export async function getAccessibleNoteIds(
  db: D1Database,
  teamId: number | undefined,
  allowedNoteRootIds: string[] | null,
): Promise<Set<string> | null> {
  if (allowedNoteRootIds === null) return null
  if (allowedNoteRootIds.length === 0) return new Set()

  let sql = 'SELECT id, parent_id FROM _notes'
  const params: unknown[] = []
  if (teamId !== undefined) {
    sql += ' WHERE team_id = ?'
    params.push(teamId)
  }

  const rows = await db.prepare(sql).bind(...params).all<{ id: string; parent_id: string | null }>()
  const childrenMap = new Map<string, string[]>()
  const existingIds = new Set<string>()

  for (const row of rows.results) {
    existingIds.add(row.id)
    if (!row.parent_id) continue
    const list = childrenMap.get(row.parent_id) ?? []
    list.push(row.id)
    childrenMap.set(row.parent_id, list)
  }

  const allowed = new Set<string>()
  const queue = allowedNoteRootIds.filter((id) => existingIds.has(id))

  while (queue.length > 0) {
    const current = queue.shift()!
    if (allowed.has(current)) continue
    allowed.add(current)
    for (const childId of childrenMap.get(current) ?? []) {
      queue.push(childId)
    }
  }

  return allowed
}

export function canAccessNote(
  allowedNoteIds: Set<string> | null,
  noteId: string | null | undefined,
): boolean {
  if (!noteId) return false
  if (allowedNoteIds === null) return true
  return allowedNoteIds.has(noteId)
}
