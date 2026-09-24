// =============================================================================
// Lossless WAV (PCM 16-bit) encoder + a tiny header parser. Pure functions with
// no DOM/Node dependency so they can be unit-tested directly. Used by the
// renderer to turn captured Float32 audio into a canonical .wav file, and by
// tests to assert the bytes are well-formed.
// =============================================================================

/** Clamp a float sample to [-1, 1] and convert to signed 16-bit. */
function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample))
  return s < 0 ? s * 0x8000 : s * 0x7fff
}

/**
 * Encode interleaved PCM16 WAV from one channel (mono) or two (stereo, e.g.
 * mic-left / system-right). Channels must be equal length; shorter ones are
 * treated as their own length (we use the min). Accepts any number-indexed
 * arrays (Float32Array regardless of backing buffer type).
 */
export function encodeWavPCM16(channelData: ArrayLike<number>[], sampleRate: number): ArrayBuffer {
  if (channelData.length === 0) throw new Error('encodeWavPCM16: no channels')
  const channels = channelData.length
  const frames = channelData.reduce((min, c) => Math.min(min, c.length), Infinity)
  const frameCount = Number.isFinite(frames) ? frames : 0
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // audioFormat = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let f = 0; f < frameCount; f++) {
    for (let c = 0; c < channels; c++) {
      view.setInt16(offset, floatToInt16(channelData[c][f]), true)
      offset += 2
    }
  }
  return buffer
}

/**
 * Encode PCM16 WAV straight from per-channel lists of Int16 blocks (the
 * recorder's native storage), interleaving into the one output buffer — no
 * intermediate full-length Float32 copies, so peak memory stays ~2× the audio.
 * `frames` is the per-channel sample count actually written into the blocks.
 */
export function encodeWavFromInt16Blocks(
  blocks: Int16Array[][],
  frames: number,
  sampleRate: number
): ArrayBuffer {
  const channels = Math.max(1, blocks.length)
  const blockAlign = channels * 2
  const dataSize = frames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  // Typed arrays use host byte order; every supported Mac (arm64/x64) is
  // little-endian, which is what WAV requires.
  const out = new Int16Array(buffer, 44, frames * channels)
  for (let c = 0; c < channels; c++) {
    let f = 0
    for (const block of blocks[c] ?? []) {
      const n = Math.min(block.length, frames - f)
      for (let i = 0; i < n; i++) out[(f + i) * channels + c] = block[i]
      f += n
      if (f >= frames) break
    }
  }
  return buffer
}

/** Float sample → Int16 with the same clamping/scaling as encodeWavPCM16. */
export function toInt16(sample: number): number {
  return floatToInt16(sample) | 0
}

export interface WavHeader {
  valid: boolean
  channels: number
  sampleRate: number
  bitsPerSample: number
  dataBytes: number
  durationSec: number
}

/** Parse the canonical 44-byte header for validation/tests. */
export function parseWavHeader(buffer: ArrayBuffer): WavHeader {
  const view = new DataView(buffer)
  const str = (o: number, n: number): string => {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(o + i))
    return s
  }
  const valid = buffer.byteLength >= 44 && str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE'
  const channels = valid ? view.getUint16(22, true) : 0
  const sampleRate = valid ? view.getUint32(24, true) : 0
  const bitsPerSample = valid ? view.getUint16(34, true) : 0
  const dataBytes = valid ? view.getUint32(40, true) : 0
  const bytesPerFrame = (channels * bitsPerSample) / 8
  const durationSec = bytesPerFrame > 0 ? dataBytes / bytesPerFrame / sampleRate : 0
  return { valid, channels, sampleRate, bitsPerSample, dataBytes, durationSec }
}
