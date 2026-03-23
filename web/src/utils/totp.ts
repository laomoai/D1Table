/**
 * TOTP (RFC 6238) implementation using Web Crypto API
 * Generates 6-digit codes with 30-second period
 */

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bits: number[] = []
  for (const c of cleaned) {
    const val = alphabet.indexOf(c)
    if (val === -1) continue
    for (let i = 4; i >= 0; i--) bits.push((val >> i) & 1)
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8))
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j]
    bytes[i] = byte
  }
  return bytes
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message.buffer as ArrayBuffer)
  return new Uint8Array(sig)
}

/**
 * Generate a TOTP code from a base32 secret
 * @returns 6-digit code string, or null if secret is invalid
 */
export async function generateTOTP(secret: string): Promise<string | null> {
  try {
    const key = base32Decode(secret)
    if (key.length === 0) return null

    const epoch = Math.floor(Date.now() / 1000)
    const counter = Math.floor(epoch / 30)

    // Convert counter to 8-byte big-endian
    const msg = new Uint8Array(8)
    let tmp = counter
    for (let i = 7; i >= 0; i--) {
      msg[i] = tmp & 0xff
      tmp = Math.floor(tmp / 256)
    }

    const hash = await hmacSha1(key, msg)
    const offset = hash[hash.length - 1] & 0x0f
    const code =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)

    return String(code % 1000000).padStart(6, '0')
  } catch {
    return null
  }
}

/**
 * Get remaining seconds in current 30s period
 */
export function getTOTPRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30)
}
