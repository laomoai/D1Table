import type { SessionUser } from '../types'

// ── Base64url 工具 ────────────────────────────────────────────

function base64urlEncode(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlEncodeString(str: string): string {
  const encoded = new TextEncoder().encode(str)
  return base64urlEncode(encoded)
}

function base64urlDecode(str: string): Uint8Array {
  // 补全 padding
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ── HMAC-SHA256 工具 ──────────────────────────────────────────

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret)
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret)
  const data = new TextEncoder().encode(payload)
  const sigBuf = await crypto.subtle.sign('HMAC', key, data)
  return base64urlEncode(new Uint8Array(sigBuf))
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await importHmacKey(secret)
  const data = new TextEncoder().encode(payload)
  const sigBytes = base64urlDecode(signature)
  return crypto.subtle.verify('HMAC', key, sigBytes, data)
}

// ── Cookie 解析工具 ───────────────────────────────────────────

function getCookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(';')
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split('=')
    if (key.trim() === name) {
      return rest.join('=').trim()
    }
  }
  return null
}

// ── 导出函数 ──────────────────────────────────────────────────

/** 生成 16 字节随机 hex 字符串（用于 OAuth CSRF 防护） */
export function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** 创建 signed session cookie 的 Set-Cookie 头字符串 */
export async function createSessionCookie(
  user: SessionUser,
  secret: string,
  isSecure: boolean
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30天
  const payloadObj = { email: user.email, name: user.name, picture: user.picture, exp }
  const payloadB64 = base64urlEncodeString(JSON.stringify(payloadObj))
  const sig = await hmacSign(payloadB64, secret)
  const value = `${payloadB64}.${sig}`

  let cookie = `d1t_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  if (isSecure) {
    cookie += '; Secure'
  }
  return cookie
}

/** 返回使 session cookie 过期的 Set-Cookie 头字符串 */
export function clearSessionCookie(): string {
  return 'd1t_session=; Path=/; Max-Age=0'
}

/** 验证 session cookie，返回 SessionUser 或 null */
export async function verifySession(
  cookieHeader: string,
  secret: string,
  allowedEmails: string[]
): Promise<SessionUser | null> {
  const raw = getCookieValue(cookieHeader, 'd1t_session')
  if (!raw) return null

  const dotIndex = raw.lastIndexOf('.')
  if (dotIndex === -1) return null

  const payloadB64 = raw.slice(0, dotIndex)
  const sig = raw.slice(dotIndex + 1)

  // 恒等时间签名验证（防时序攻击）
  const valid = await hmacVerify(payloadB64, sig, secret)
  if (!valid) return null

  // 解析 payload
  let payload: { email: string; name: string; picture: string; exp: number }
  try {
    const decoded = new TextDecoder().decode(base64urlDecode(payloadB64))
    payload = JSON.parse(decoded)
  } catch {
    return null
  }

  // 检查过期时间
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null

  // 检查邮箱白名单
  if (!allowedEmails.includes(payload.email)) return null

  return { email: payload.email, name: payload.name, picture: payload.picture }
}

/** 创建 CSRF state 临时 cookie 的 Set-Cookie 头 */
export function createStateCookie(state: string): string {
  return `d1t_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`
}

/** 从 Cookie 头中提取 d1t_oauth_state 的值 */
export function getStateCookie(cookieHeader: string): string | null {
  return getCookieValue(cookieHeader, 'd1t_oauth_state')
}
