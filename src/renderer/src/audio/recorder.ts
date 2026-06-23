// =============================================================================
// CallRecorder — renderer-side audio capture. Captures the selected input,
// disables Chromium's EC/NS/AGC (which mangle the waveform), encodes lossless
// PCM16 WAV via an AudioWorklet (ScriptProcessor is deprecated; MediaRecorder
// only emits lossy Opus), and exposes a live per-channel RMS meter so the
// operator can confirm BOTH voices are reaching the recorder before recording.
//
// Lifecycle: monitor(device) opens the stream and starts the meter WITHOUT
// recording (and without running the recorder worklet, to stay idle-cheap);
// beginRecording() connects the worklet and starts accumulating samples at the
// Record press; stop() finalizes the WAV and releases the device. A muted gain
// keeps the graph alive so the meter updates during monitor.
// =============================================================================

import { encodeWavPCM16 } from '@shared/wav'

// AudioWorklet processor source, loaded from a Blob URL so we don't depend on
// the bundler emitting a separately-addressable asset. Each render quantum's
// buffers are recycled, so we copy then TRANSFER the copies to main (zero-copy
// send, no structured clone).
const WORKLET_SRC = `
class StoneRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      const copy = []
      const transfer = []
      for (let c = 0; c < input.length; c++) {
        const s = input[c].slice(0)
        copy.push(s)
        transfer.push(s.buffer)
      }
      this.port.postMessage(copy, transfer)
    }
    return true
  }
}
registerProcessor('stone-recorder', StoneRecorderProcessor)
`

export interface RecordingResult {
  wav: ArrayBuffer
  durationSec: number
  sampleRate: number
  channels: number
  deviceLabel: string
}

export type LevelCallback = (levelsDb: number[]) => void

export class CallRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private mutedGain: GainNode | null = null
  private worklet: AudioWorkletNode | null = null
  private analysers: AnalyserNode[] = []
  private chunks: Float32Array[][] = []
  private channels = 1
  private deviceLabel = ''
  private rafId = 0
  private levelCb: LevelCallback | null = null

  /** True only while actively accumulating samples. */
  recording = false
  /** True while a device is open and the meter is live (recording or not). */
  monitoring = false

  /**
   * Enumerate audio input devices. Labels and non-default deviceIds are hidden
   * until mic permission is granted, so we unlock with a throwaway getUserMedia
   * first.
   */
  async listInputs(): Promise<MediaDeviceInfo[]> {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      probe.getTracks().forEach((t) => t.stop())
    } catch {
      // Permission denied — we can still enumerate (labels may be blank).
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  }

  /** Subscribe to live meter updates (dBFS per channel). */
  onLevel(cb: LevelCallback): void {
    this.levelCb = cb
  }

  /** Open the device and start the live meter, without recording yet. */
  async monitor(deviceId: string, mode: 'speakerphone' | 'loopback'): Promise<void> {
    if (this.monitoring || this.ctx) this.teardown()
    const wantChannels = mode === 'loopback' ? 2 : 1

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: wantChannels,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    }
    this.stream = await navigator.mediaDevices.getUserMedia(constraints)
    const track = this.stream.getAudioTracks()[0]
    this.deviceLabel = track?.label || ''
    this.channels = track?.getSettings().channelCount || wantChannels

    this.ctx = new AudioContext()
    // Register the recorder processor now (cheap); the node is only created
    // while recording. Revoke the blob URL once the module is loaded.
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }))
    try {
      await this.ctx.audioWorklet.addModule(moduleUrl)
    } finally {
      URL.revokeObjectURL(moduleUrl)
    }

    this.source = this.ctx.createMediaStreamSource(this.stream)

    // Per-channel meters via a splitter (pre-allocated read buffers).
    const splitter = this.ctx.createChannelSplitter(this.channels)
    this.source.connect(splitter)
    this.analysers = []
    for (let c = 0; c < this.channels; c++) {
      const an = this.ctx.createAnalyser()
      an.fftSize = 1024
      splitter.connect(an, c)
      this.analysers.push(an)
    }

    // A muted gain keeps the graph "pulling" so the meter updates during
    // monitor; the recorder worklet later joins this same silent path.
    this.mutedGain = this.ctx.createGain()
    this.mutedGain.gain.value = 0
    this.mutedGain.connect(this.ctx.destination)

    this.monitoring = true
    this.startMeter()
  }

  /** Begin accumulating samples (call after monitor()). Returns the start time. */
  beginRecording(): number {
    if (!this.ctx || !this.source || !this.mutedGain) return Date.now()
    this.chunks = Array.from({ length: this.channels }, () => [])
    this.worklet = new AudioWorkletNode(this.ctx, 'stone-recorder')
    this.worklet.port.onmessage = (e: MessageEvent): void => {
      if (!this.recording) return
      const frame = e.data as Float32Array[]
      for (let c = 0; c < frame.length && c < this.chunks.length; c++) {
        this.chunks[c].push(frame[c])
      }
    }
    this.source.connect(this.worklet)
    this.worklet.connect(this.mutedGain)
    this.recording = true
    return Date.now()
  }

  private startMeter(): void {
    // Allocate the read buffers ONCE (not per animation frame).
    const buffers = this.analysers.map((an) => new Float32Array(an.fftSize))
    const tick = (): void => {
      if (!this.monitoring) return
      const levels = this.analysers.map((an, i) => {
        const buf = buffers[i]
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (let j = 0; j < buf.length; j++) sum += buf[j] * buf[j]
        const rms = Math.sqrt(sum / buf.length)
        return 20 * Math.log10(rms || 1e-8) // dBFS
      })
      this.levelCb?.(levels)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  /** Finalize the recording into a WAV and release the device. */
  async stop(): Promise<RecordingResult> {
    const sampleRate = this.ctx?.sampleRate ?? 48000
    const channelData = this.chunks.map((chunkList) => concat(chunkList))
    this.teardown()

    const wav = encodeWavPCM16(channelData.length ? channelData : [new Float32Array(0)], sampleRate)
    const frames = channelData[0]?.length ?? 0
    return {
      wav,
      durationSec: frames / sampleRate,
      sampleRate,
      channels: channelData.length || 1,
      deviceLabel: this.deviceLabel
    }
  }

  /** Stop monitoring/recording and release the device without producing a file. */
  teardown(): void {
    this.recording = false
    this.monitoring = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    try {
      if (this.worklet) {
        this.worklet.port.onmessage = null
        this.worklet.port.close()
        this.worklet.disconnect()
      }
    } catch {
      /* noop */
    }
    this.worklet = null
    this.analysers.forEach((a) => a.disconnect())
    this.analysers = []
    try {
      this.source?.disconnect()
      this.mutedGain?.disconnect()
    } catch {
      /* noop */
    }
    this.source = null
    this.mutedGain = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close()
    this.ctx = null
  }

  get channelCount(): number {
    return this.channels
  }
}

function concat(list: Float32Array[]): Float32Array {
  let total = 0
  for (const a of list) total += a.length
  const out = new Float32Array(total)
  let off = 0
  for (const a of list) {
    out.set(a, off)
    off += a.length
  }
  return out
}
