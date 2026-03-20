/**
 * Note field value encoding/decoding.
 * Stored as JSON string in table cells: {"id":"n_xxx","title":"标题","icon":"📁"}
 * Backward compatible: also parses legacy "id|title|icon" format.
 */

export interface NoteFieldValue {
  id: string
  title: string
  icon: string
}

export function encodeNoteValue(id: string, title: string, icon: string): string {
  return JSON.stringify({ id, title, icon })
}

export function decodeNoteValue(raw: unknown): NoteFieldValue | null {
  if (!raw) return null
  const s = String(raw)

  // Try JSON first
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s)
      if (obj.id) return { id: obj.id, title: obj.title || obj.id, icon: obj.icon || '' }
    } catch { /* fall through */ }
  }

  // Legacy pipe format: id|title|icon
  const parts = s.split('|')
  if (parts.length >= 2) {
    return { id: parts[0], title: parts[1], icon: parts[2] || '' }
  }

  // Raw ID fallback
  if (s.startsWith('n_')) {
    return { id: s, title: 'Note ' + s.slice(2, 8), icon: '' }
  }

  return null
}
