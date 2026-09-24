import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineProgress } from '@shared/types'
import { CallRecorder, type RecordingResult } from '../audio/recorder'
import { errorText } from '../lib/format'

const LAST_DEVICE_KEY = 'stone.lastInputDeviceId'

export interface ConsentPayload {
  state: string
  method: string
  script_acknowledged: boolean
  audible_played: boolean
}

export interface RecorderState {
  devices: MediaDeviceInfo[]
  deviceId: string
  monitoring: boolean
  recording: boolean
  elapsedSec: number
  channels: number
  progress: PipelineProgress | null
  error: string | null
  micBlocked: boolean
  /** Why the last finished call could not be saved; its audio is still held in memory. */
  saveError: string | null
}

function readLastDevice(): string | null {
  try {
    return localStorage.getItem(LAST_DEVICE_KEY)
  } catch {
    return null
  }
}
function writeLastDevice(id: string): void {
  try {
    localStorage.setItem(LAST_DEVICE_KEY, id)
  } catch {
    /* storage unavailable — the choice just isn't remembered */
  }
}

/**
 * The capture engine's React face. Mounted ONCE at the app root (never inside a
 * page) so switching screens mid-call can't tear down a live recording.
 *
 * After Stop the order is save-first: the WAV goes to disk before the mic is
 * reopened for the next call, and if the save fails the audio stays in memory
 * behind a "Retry save" instead of being dropped.
 */
export function useRecorder(audioMode: 'speakerphone' | 'loopback') {
  const recorderRef = useRef<CallRecorder | null>(null)
  const levelListeners = useRef<Set<(levels: number[]) => void>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTsRef = useRef<number>(0)
  const selectReq = useRef(0)
  const pendingSave = useRef<{ result: RecordingResult; consent: ConsentPayload } | null>(null)

  const [state, setState] = useState<RecorderState>({
    devices: [],
    deviceId: '',
    monitoring: false,
    recording: false,
    elapsedSec: 0,
    channels: audioMode === 'loopback' ? 2 : 1,
    progress: null,
    error: null,
    micBlocked: false,
    saveError: null
  })

  // Lazily create the recorder and fan meter updates out to listeners.
  const recorder = (): CallRecorder => {
    if (!recorderRef.current) {
      recorderRef.current = new CallRecorder()
      recorderRef.current.onLevel((levels) => {
        for (const cb of levelListeners.current) cb(levels)
      })
      // An unplugged mic mid-call leaves a silent recording — say so at once.
      recorderRef.current.onEnded(() =>
        setState((s) => ({
          ...s,
          monitoring: s.recording,
          error: s.recording
            ? 'The microphone disconnected — the rest of this call won’t be heard. Stop to save what was recorded.'
            : 'The microphone disconnected. Plug it back in and press refresh.'
        }))
      )
    }
    return recorderRef.current
  }

  const registerLevelListener = useCallback((cb: (levels: number[]) => void) => {
    levelListeners.current.add(cb)
    return () => {
      levelListeners.current.delete(cb)
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await recorder().listInputs()
      setState((s) => ({ ...s, devices }))
      return devices
    } catch (e) {
      setState((s) => ({ ...s, micBlocked: true, error: errorText(e) }))
      return []
    }
  }, [])

  const selectDevice = useCallback(
    async (deviceId: string) => {
      // Never swap the input under a live call — that would cut the recording.
      if (recorder().recording) return
      const req = ++selectReq.current
      writeLastDevice(deviceId)
      setState((s) => ({ ...s, deviceId, error: null }))
      try {
        await recorder().monitor(deviceId, audioMode)
        if (req !== selectReq.current) return // superseded by a newer choice
        const live = recorder().monitoring
        setState((s) => ({ ...s, monitoring: live, micBlocked: false, channels: recorder().channelCount }))
      } catch (e) {
        if (req !== selectReq.current) return
        setState((s) => ({ ...s, monitoring: false, micBlocked: true, error: errorText(e) }))
      }
    },
    [audioMode]
  )

  // Initial device load + restore last choice.
  useEffect(() => {
    void (async () => {
      const devices = await refreshDevices()
      const last = readLastDevice()
      const chosen = devices.find((d) => d.deviceId === last)?.deviceId || devices[0]?.deviceId || ''
      if (chosen) await selectDevice(chosen)
      else setState((s) => ({ ...s, micBlocked: true }))
    })()
    const onChange = (): void => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', onChange)
      if (timerRef.current) clearInterval(timerRef.current)
      recorderRef.current?.teardown()
    }
    // Mount-only by design: enumerate devices + open the last-used one exactly
    // once. refreshDevices/selectDevice are stable; re-running would re-probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // readiness loads asynchronously, so audioMode can change AFTER the initial
  // mount. Re-open the device so the channel layout matches the new mode —
  // but never tear down an active recording.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    if (state.deviceId && state.monitoring && !state.recording) {
      void selectDevice(state.deviceId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMode])

  const clearTimer = (): void => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const start = useCallback(async () => {
    if (recorder().recording) return // guard against double-activation
    if (pendingSave.current) return // a finished call must be saved first
    if (!recorder().monitoring) await selectDevice(state.deviceId)
    // selectDevice swallows monitor() failures; bail if the graph never came up
    // so we never show a running timer over a dead (silent) capture.
    if (!recorder().monitoring) {
      setState((s) => ({
        ...s,
        recording: false,
        error: s.error ?? 'Cannot start: the microphone is not available.'
      }))
      return
    }
    recorder().beginRecording()
    startTsRef.current = Date.now()
    // The previous call's processing status stays visible until this call is saved.
    setState((s) => ({ ...s, recording: true, elapsedSec: 0, error: null }))
    clearTimer()
    timerRef.current = setInterval(() => {
      // Compute from wall clock so the timer never drifts.
      const elapsed = Math.floor((Date.now() - startTsRef.current) / 1000)
      setState((s) => ({ ...s, elapsedSec: elapsed }))
    }, 250)
  }, [state.deviceId, selectDevice])

  /** Keep main's precise error for this lead if it already arrived; else synthesize one. */
  const failLead = (leadId: string, e: unknown): void =>
    setState((s) =>
      s.progress?.leadId === leadId && s.progress.stage === 'error'
        ? s
        : {
            ...s,
            progress: {
              leadId,
              stage: 'error',
              message: errorText(e),
              retryable: true,
              audioPathSafe: s.progress?.audioPathSafe ?? null
            }
          }
    )

  /** Persist a finished call. On failure the audio stays in memory for retry. */
  const saveAndProcess = useCallback(async (result: RecordingResult, consent: ConsentPayload) => {
    pendingSave.current = { result, consent }
    setState((s) => ({
      ...s,
      saveError: null,
      progress: { leadId: '', stage: 'saving', message: 'Saving recording…', retryable: false, audioPathSafe: null }
    }))
    let saved
    try {
      saved = await window.stoneBridge.saveRecording({
        wav: result.wav,
        durationSec: result.durationSec,
        sampleRate: result.sampleRate,
        channels: result.channels,
        deviceLabel: result.deviceLabel,
        consent
      })
    } catch (e) {
      setState((s) => ({
        ...s,
        saveError: errorText(e),
        progress: s.progress?.stage === 'saving' ? null : s.progress
      }))
      return
    }
    pendingSave.current = null
    setState((s) => ({
      ...s,
      saveError: null,
      progress: {
        leadId: saved.leadId,
        stage: 'transcribing',
        message: 'Saved to disk. Processing…',
        retryable: false,
        audioPathSafe: saved.audioPath
      }
    }))
    try {
      await window.stoneBridge.processRecording(saved.leadId)
    } catch (e) {
      failLead(saved.leadId, e)
    }
  }, [])

  const stop = useCallback(
    async (consent: ConsentPayload) => {
      if (!recorder().recording) return
      clearTimer()
      setState((s) => ({
        ...s,
        recording: false,
        monitoring: false,
        progress: { leadId: '', stage: 'saving', message: 'Saving recording…', retryable: false, audioPathSafe: null }
      }))
      let result: RecordingResult
      try {
        result = await recorder().stop()
      } catch (e) {
        setState((s) => ({
          ...s,
          progress: {
            leadId: '',
            stage: 'error',
            message: `The recording could not be finalized: ${errorText(e)}`,
            retryable: false,
            audioPathSafe: null
          }
        }))
        void selectDevice(state.deviceId)
        return
      }

      // SAVE FIRST — the save IPC is dispatched before the mic is reopened.
      const saving = saveAndProcess(result, consent)
      void selectDevice(state.deviceId)
      await saving
    },
    [saveAndProcess, selectDevice, state.deviceId]
  )

  /** Retry whatever failed last: an unsaved call first, else the lead's processing. */
  const retry = useCallback(async () => {
    if (pendingSave.current) {
      const { result, consent } = pendingSave.current
      await saveAndProcess(result, consent)
      return
    }
    const leadId = state.progress?.leadId
    if (!leadId) return
    setState((s) => ({
      ...s,
      progress: {
        leadId,
        stage: 'transcribing',
        message: 'Retrying…',
        retryable: false,
        audioPathSafe: s.progress?.audioPathSafe ?? null
      }
    }))
    try {
      await window.stoneBridge.retryProcessing(leadId)
    } catch (e) {
      failLead(leadId, e)
    }
  }, [saveAndProcess, state.progress?.leadId])

  /** Re-list inputs and reconnect (after granting mic access or plugging a mic in). */
  const reconnect = useCallback(async () => {
    const devices = await refreshDevices()
    if (recorder().recording) return
    const id = devices.find((d) => d.deviceId === state.deviceId)?.deviceId || devices[0]?.deviceId || ''
    if (id) await selectDevice(id)
    else setState((s) => ({ ...s, monitoring: false, micBlocked: true }))
  }, [refreshDevices, selectDevice, state.deviceId])

  const dismissProgress = useCallback(() => {
    setState((s) => (s.progress && s.progress.stage !== 'saving' ? { ...s, progress: null } : s))
  }, [])

  // Live pipeline progress from main. While a new call is mid-save, another
  // call's late events must not replace its "Saving…" status.
  useEffect(() => {
    const unsub = window.stoneBridge.onPipelineProgress((p) => {
      setState((s) => (s.progress?.stage === 'saving' && s.progress.leadId !== p.leadId ? s : { ...s, progress: p }))
    })
    return unsub
  }, [])

  return {
    state,
    registerLevelListener,
    refreshDevices,
    reconnect,
    selectDevice,
    start,
    stop,
    retry,
    dismissProgress
  }
}

export type Recorder = ReturnType<typeof useRecorder>
