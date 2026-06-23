import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineProgress } from '@shared/types'
import { CallRecorder } from '../audio/recorder'

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
}

export function useRecorder(audioMode: 'speakerphone' | 'loopback') {
  const recorderRef = useRef<CallRecorder | null>(null)
  const levelListeners = useRef<Set<(levels: number[]) => void>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTsRef = useRef<number>(0)

  const [state, setState] = useState<RecorderState>({
    devices: [],
    deviceId: '',
    monitoring: false,
    recording: false,
    elapsedSec: 0,
    channels: audioMode === 'loopback' ? 2 : 1,
    progress: null,
    error: null,
    micBlocked: false
  })

  // Lazily create the recorder and fan meter updates out to a listener.
  const recorder = (): CallRecorder => {
    if (!recorderRef.current) {
      recorderRef.current = new CallRecorder()
      recorderRef.current.onLevel((levels) => {
        for (const cb of levelListeners.current) cb(levels)
      })
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
      setState((s) => ({ ...s, devices, micBlocked: false }))
      return devices
    } catch (e) {
      setState((s) => ({ ...s, micBlocked: true, error: errMsg(e) }))
      return []
    }
  }, [])

  const selectDevice = useCallback(
    async (deviceId: string) => {
      localStorage.setItem(LAST_DEVICE_KEY, deviceId)
      setState((s) => ({ ...s, deviceId, error: null }))
      try {
        await recorder().monitor(deviceId, audioMode)
        setState((s) => ({ ...s, monitoring: true, micBlocked: false, channels: recorder().channelCount }))
      } catch (e) {
        setState((s) => ({ ...s, monitoring: false, micBlocked: true, error: errMsg(e) }))
      }
    },
    [audioMode]
  )

  // Initial device load + restore last choice.
  useEffect(() => {
    void (async () => {
      const devices = await refreshDevices()
      const last = localStorage.getItem(LAST_DEVICE_KEY)
      const chosen =
        devices.find((d) => d.deviceId === last)?.deviceId || devices[0]?.deviceId || ''
      if (chosen) await selectDevice(chosen)
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
    if (!recorder().monitoring) await selectDevice(state.deviceId)
    // selectDevice swallows monitor() failures; bail if the graph never came up
    // so we never show a running timer over a dead (silent) capture.
    if (!recorder().monitoring) {
      setState((s) => ({
        ...s,
        recording: false,
        error: s.error ?? 'Cannot start: microphone is not available.'
      }))
      return
    }
    recorder().beginRecording()
    startTsRef.current = Date.now()
    setState((s) => ({ ...s, recording: true, elapsedSec: 0, progress: null, error: null }))
    clearTimer()
    timerRef.current = setInterval(() => {
      // Compute from wall clock so the timer never drifts.
      const elapsed = Math.floor((Date.now() - startTsRef.current) / 1000)
      setState((s) => ({ ...s, elapsedSec: elapsed }))
    }, 250)
  }, [state.deviceId, selectDevice])

  const runPipeline = useCallback(async (leadId: string) => {
    try {
      await window.stoneBridge.processRecording(leadId)
    } catch (e) {
      // The audio is already safe on disk; surface a retryable error.
      setState((s) => ({
        ...s,
        progress: {
          leadId,
          stage: 'error',
          message: errMsg(e),
          retryable: true,
          audioPathSafe: s.progress?.audioPathSafe ?? null
        }
      }))
    }
  }, [])

  const stop = useCallback(
    async (consent: ConsentPayload) => {
      clearTimer()
      setState((s) => ({
        ...s,
        recording: false,
        progress: { leadId: '', stage: 'saving', message: 'Saving recording…', retryable: false, audioPathSafe: null }
      }))
      let result
      try {
        result = await recorder().stop()
      } catch (e) {
        setState((s) => ({
          ...s,
          progress: { leadId: '', stage: 'error', message: errMsg(e), retryable: false, audioPathSafe: null }
        }))
        return
      }

      // Resume monitoring so the operator can record the next call immediately
      // while this one processes in the background.
      try {
        await recorder().monitor(state.deviceId, audioMode)
        setState((s) => ({ ...s, monitoring: true, channels: recorder().channelCount }))
      } catch (e) {
        setState((s) => ({ ...s, monitoring: false, error: errMsg(e) }))
      }

      try {
        const saved = await window.stoneBridge.saveRecording({
          wav: result.wav,
          durationSec: result.durationSec,
          sampleRate: result.sampleRate,
          channels: result.channels,
          deviceLabel: result.deviceLabel,
          consent
        })
        setState((s) => ({
          ...s,
          progress: {
            leadId: saved.leadId,
            stage: 'transcribing',
            message: 'Saved to disk. Processing…',
            retryable: false,
            audioPathSafe: saved.audioPath
          }
        }))
        await runPipeline(saved.leadId)
      } catch (e) {
        setState((s) => ({
          ...s,
          progress: { leadId: '', stage: 'error', message: errMsg(e), retryable: false, audioPathSafe: null }
        }))
      }
    },
    [runPipeline, state.deviceId, audioMode]
  )

  const retry = useCallback(async () => {
    const leadId = state.progress?.leadId
    if (!leadId) return
    setState((s) => ({
      ...s,
      progress: { leadId, stage: 'transcribing', message: 'Retrying…', retryable: false, audioPathSafe: s.progress?.audioPathSafe ?? null }
    }))
    try {
      await window.stoneBridge.retryProcessing(leadId)
    } catch (e) {
      setState((s) => ({
        ...s,
        progress: { leadId, stage: 'error', message: errMsg(e), retryable: true, audioPathSafe: s.progress?.audioPathSafe ?? null }
      }))
    }
  }, [state.progress?.leadId])

  // Live pipeline progress events from the main process.
  useEffect(() => {
    const unsub = window.stoneBridge.onPipelineProgress((p) => {
      setState((s) => ({ ...s, progress: p }))
    })
    return unsub
  }, [])

  return { state, registerLevelListener, refreshDevices, selectDevice, start, stop, retry }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
