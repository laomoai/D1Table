/** SHA-256 哈希，返回十六进制字符串（Workers 内置 Web Crypto API） */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 生成随机 API Key，格式：d1t_ro_<32位随机> 或 d1t_rw_<32位随机> */
export function generateApiKey(type: 'readonly' | 'readwrite'): string {
  const prefix = type === 'readonly' ? 'd1t_ro_' : 'd1t_rw_'
  const random = crypto.getRandomValues(new Uint8Array(24))
  const chars = [...random]
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 32)
  return prefix + chars
}
