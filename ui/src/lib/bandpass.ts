/**
 * Butterworth bandpass filter — forward-backward (filtfilt) implementation.
 * Uses cascaded biquad sections (SOS) for numerical stability.
 * Mimics scipy.signal.butter + scipy.signal.sosfiltfilt.
 */

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/**
 * Design a Butterworth bandpass filter and return second-order sections.
 * @param fs  Sampling frequency (Hz)
 * @param low  Low cutoff frequency (Hz)
 * @param high  High cutoff frequency (Hz)
 * @param order  Filter order (each order → 2 biquad sections per band)
 */
function butterworthBandpassSOS(
  fs: number,
  low: number,
  high: number,
  order: number,
): Biquad[] {
  const wLow = Math.tan((Math.PI * low) / fs)
  const wHigh = Math.tan((Math.PI * high) / fs)

  // Prewarp
  const bw = wHigh - wLow
  const w0sq = wLow * wHigh

  const sections: Biquad[] = []

  for (let k = 0; k < order; k++) {
    // Bandpass section via bilinear transform:
    const K = bw
    const b0Analog = w0sq
    const a0Den = 1 + K + b0Analog
    const b0Z = K / a0Den
    const b1Z = 0
    const b2Z = -K / a0Den
    const a1Z = (2 * (b0Analog - 1)) / a0Den
    const a2Z = (1 - K + b0Analog) / a0Den

    sections.push({
      b0: b0Z,
      b1: b1Z,
      b2: b2Z,
      a1: a1Z,
      a2: a2Z,
    })
  }

  return sections
}

/**
 * Apply a cascade of biquad sections to a signal (forward pass).
 */
function sosForward(sections: Biquad[], input: Float64Array): Float64Array {
  let x = input
  for (const sec of sections) {
    const out = new Float64Array(x.length)
    let xm1 = 0
    let xm2 = 0
    let ym1 = 0
    let ym2 = 0
    for (let i = 0; i < x.length; i++) {
      const y = sec.b0 * x[i] + sec.b1 * xm1 + sec.b2 * xm2 - sec.a1 * ym1 - sec.a2 * ym2
      out[i] = y
      xm2 = xm1
      xm1 = x[i]
      ym2 = ym1
      ym1 = y
    }
    x = out
  }
  return x
}

/**
 * Forward-backward filtering (scipy.signal.filtfilt equivalent).
 * Applies the filter twice (forward then backward) for zero-phase distortion.
 */
export function filtfilt(
  signal: Float32Array,
  fs: number,
  low: number,
  high: number,
  order = 4,
): Float32Array {
  const n = signal.length
  const sections = butterworthBandpassSOS(fs, low, high, order)

  // Convert to Float64 for precision
  const input = new Float64Array(n)
  for (let i = 0; i < n; i++) input[i] = signal[i]

  // Forward pass
  const fwd = sosForward(sections, input)

  // Reverse
  const rev = new Float64Array(n)
  for (let i = 0; i < n; i++) rev[i] = fwd[n - 1 - i]

  // Backward pass
  const bwd = sosForward(sections, rev)

  // Reverse again
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = bwd[n - 1 - i]

  return out
}

/**
 * Z-score normalization: (x - mean) / (std + 1e-8)
 */
export function zscore(signal: Float32Array): Float32Array {
  const n = signal.length
  let sum = 0
  for (let i = 0; i < n; i++) sum += signal[i]
  const mean = sum / n

  let sq = 0
  for (let i = 0; i < n; i++) sq += (signal[i] - mean) * (signal[i] - mean)
  const std = Math.sqrt(sq / n) || 1

  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (signal[i] - mean) / (std + 1e-8)
  return out
}

/**
 * Min-max normalization to [0, 1] across the full 2D array.
 */
export function minmax2d(data: Float32Array): Float32Array {
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < data.length; i++) {
    if (data[i] < mn) mn = data[i]
    if (data[i] > mx) mx = data[i]
  }
  const range = mx - mn || 1
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = (data[i] - mn) / range
  return out
}
