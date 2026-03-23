/**
 * Global clipboard utility with toast notification
 * Uses a registered message provider for feedback
 */

type MessageFn = (content: string, options?: { duration?: number }) => void

let _success: MessageFn | null = null

/** Register the Naive UI message.success function (call once in App/Layout) */
export function registerClipboardToast(successFn: MessageFn) {
  _success = successFn
}

/** Copy text to clipboard and show a toast */
export async function copyText(text: string, label?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    _success?.(label ? `${label} copied` : 'Copied', { duration: 1500 })
    return true
  } catch {
    return false
  }
}
