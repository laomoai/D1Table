import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware, teamFilter } from '../middleware/auth'
import { canAccessNote, getAccessibleNoteIds } from '../utils/note-access'

const notes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

function generateId(): string {
  return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** BFS collect descendants with access control and breadth cap */
async function collectDescendants(
  db: D1Database,
  rootId: string,
  teamId: number | undefined,
  allowedNoteIds: Set<string> | null,
  opts?: { filterDeleted?: boolean }
): Promise<string[]> {
  const MAX_DEPTH = 10
  const MAX_BREADTH = 500
  const allIds: string[] = [rootId]
  let currentLevel = [rootId]

  for (let depth = 0; depth < MAX_DEPTH && currentLevel.length > 0; depth++) {
    const placeholders = currentLevel.map(() => '?').join(',')
    let childSql = `SELECT id FROM _notes WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL`
    const childParams: unknown[] = [...currentLevel]
    if (teamId !== undefined) {
      childSql += ` AND team_id = ?`
      childParams.push(teamId)
    }
    const children = await db.prepare(childSql).bind(...childParams).all<{ id: string }>()
    currentLevel = children.results
      .filter(r => allowedNoteIds === null || allowedNoteIds.has(r.id))
      .map(r => r.id)
      .slice(0, MAX_BREADTH)
    allIds.push(...currentLevel)
  }

  return allIds
}

/**
 * GET /api/notes
 * 获取笔记列表（支持按 parent_id 过滤）
 */
notes.get('/', async (c) => {
  const { clause, params } = teamFilter(c.get('teamId'))
  const parentId = c.req.query('parent_id')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (parentId && parentId !== 'root' && !canAccessNote(allowedNoteIds, parentId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  if (allowedNoteIds !== null) {
    const rows = await c.env.DB.prepare(
      `SELECT id, title, icon, parent_id, sort_order, created_by, created_at, updated_at
       FROM _notes WHERE ${clause} AND deleted_at IS NULL AND archived_at IS NULL
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 500`
    ).bind(...params)
      .all<{ id: string; title: string; icon: string | null; parent_id: string | null; sort_order: number; created_by: number | null; created_at: number; updated_at: number }>()

    const visible = rows.results
      .filter((row) => allowedNoteIds.has(row.id))
      .map((row) => ({
        ...row,
        parent_id: row.parent_id && allowedNoteIds.has(row.parent_id) ? row.parent_id : null,
      }))

    const filtered = parentId && parentId !== 'root'
      ? visible.filter((row) => row.parent_id === parentId)
      : visible.filter((row) => row.parent_id === null)

    return c.json({ data: filtered.slice(0, 200) })
  }

  let sql = `SELECT id, title, icon, parent_id, sort_order, created_by, created_at, updated_at FROM _notes WHERE ${clause} AND deleted_at IS NULL AND archived_at IS NULL`

  if (parentId && parentId !== 'root') {
    sql += ` AND parent_id = ?`
    params.push(parentId)
  } else {
    sql += ` AND parent_id IS NULL`
  }

  sql += ` ORDER BY sort_order ASC, created_at DESC LIMIT 200`

  const rows = await c.env.DB.prepare(sql).bind(...params)
    .all<{ id: string; title: string; parent_id: string | null; sort_order: number; created_by: number | null; created_at: number; updated_at: number }>()

  return c.json({ data: rows.results })
})

/**
 * GET /api/notes/tree
 * 获取所有笔记的树形结构
 */
notes.get('/tree', async (c) => {
  const { clause, params } = teamFilter(c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  const rows = await c.env.DB.prepare(
    `SELECT id, title, icon, parent_id, sort_order, is_locked, created_at, updated_at
     FROM _notes WHERE ${clause} AND deleted_at IS NULL AND archived_at IS NULL
     ORDER BY sort_order ASC, created_at DESC
     LIMIT 500`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; sort_order: number; is_locked: number; created_at: number; updated_at: number }>()

  const data = allowedNoteIds === null
    ? rows.results
    : rows.results
        .filter((row) => allowedNoteIds.has(row.id))
        .map((row) => ({
          ...row,
          parent_id: row.parent_id && allowedNoteIds.has(row.parent_id) ? row.parent_id : null,
        }))

  return c.json({ data })
})

/**
 * GET /api/notes/archived
 * 获取已归档笔记，按根笔记聚合返回
 */
notes.get('/archived', async (c) => {
  const { clause, params } = teamFilter(c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))
  const q = c.req.query('q')?.toLowerCase()

  // Load non-deleted notes to build tree in memory (capped at 5000)
  const allRows = await c.env.DB.prepare(
    `SELECT id, title, icon, parent_id, archived_at, cover, description, sort_order, created_at, updated_at
     FROM _notes WHERE ${clause} AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at DESC
     LIMIT 5000`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; archived_at: number | null; cover: string | null; description: string | null; sort_order: number; created_at: number; updated_at: number }>()

  let notes_all = allRows.results
  if (allowedNoteIds !== null) {
    notes_all = notes_all.filter(r => allowedNoteIds.has(r.id))
  }

  // Build parent lookup
  const noteMap = new Map(notes_all.map(n => [n.id, n]))

  // Find root for a given note
  function findRoot(noteId: string): string | null {
    let current = noteId
    const visited = new Set<string>()
    while (true) {
      if (visited.has(current)) return null
      visited.add(current)
      const n = noteMap.get(current)
      if (!n) return null
      if (!n.parent_id) return current
      current = n.parent_id
    }
  }

  // Find all archived notes and group by root
  const archivedByRoot = new Map<string, number>()
  for (const n of notes_all) {
    if (!n.archived_at) continue
    if (q && !n.title.toLowerCase().includes(q)) continue
    const rootId = findRoot(n.id)
    if (!rootId) continue
    archivedByRoot.set(rootId, (archivedByRoot.get(rootId) ?? 0) + 1)
  }

  // Build response: root notes that have archived children
  const data = []
  for (const [rootId, archivedCount] of archivedByRoot) {
    const root = noteMap.get(rootId)
    if (!root) continue
    data.push({
      id: root.id,
      title: root.title,
      icon: root.icon,
      cover: root.cover,
      description: root.description,
      archived_count: archivedCount,
      created_at: root.created_at,
      updated_at: root.updated_at,
    })
  }

  return c.json({ data })
})

/**
 * GET /api/notes/:id/archived-children
 * 获取某个根笔记下所有已归档的子笔记
 */
notes.get('/:id/archived-children', async (c) => {
  const { id } = c.req.param()
  const { clause, params } = teamFilter(c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  // Load non-deleted notes to build tree (capped at 5000)
  const allRows = await c.env.DB.prepare(
    `SELECT id, title, icon, parent_id, archived_at, sort_order, created_at, updated_at
     FROM _notes WHERE ${clause} AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at DESC
     LIMIT 5000`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; archived_at: number | null; sort_order: number; created_at: number; updated_at: number }>()

  let notes_all = allRows.results
  if (allowedNoteIds !== null) {
    notes_all = notes_all.filter(r => allowedNoteIds.has(r.id))
  }

  // Build children map
  const childrenMap = new Map<string, typeof notes_all>()
  for (const n of notes_all) {
    if (!n.parent_id) continue
    const arr = childrenMap.get(n.parent_id) ?? []
    arr.push(n)
    childrenMap.set(n.parent_id, arr)
  }

  // BFS to find all descendants of root
  // First pass: collect all archived notes
  const allDescendants = new Map<string, (typeof notes_all)[0]>()
  const archivedIds = new Set<string>()
  const queue = [id]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const child of childrenMap.get(current) ?? []) {
      allDescendants.set(child.id, child)
      if (child.archived_at) archivedIds.add(child.id)
      queue.push(child.id)
    }
  }

  // Second pass: for each archived note, walk up to root and include intermediate path nodes
  const resultIds = new Set<string>(archivedIds)
  for (const archivedId of archivedIds) {
    let current = allDescendants.get(archivedId)
    while (current && current.parent_id && current.parent_id !== id) {
      if (resultIds.has(current.parent_id)) break
      resultIds.add(current.parent_id)
      current = allDescendants.get(current.parent_id)
    }
  }

  const result = [...resultIds]
    .map(nid => allDescendants.get(nid)!)
    .filter(Boolean)

  return c.json({ data: result })
})

/**
 * GET /api/notes/trash
 * List soft-deleted notes
 */
notes.get('/trash', async (c) => {
  const { clause, params } = teamFilter(c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('page_size') ?? '20', 10) || 20))

  const rows = await c.env.DB.prepare(
    `SELECT id, title, icon, parent_id, deleted_at FROM _notes
     WHERE ${clause} AND deleted_at IS NOT NULL
     ORDER BY deleted_at DESC`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; deleted_at: number }>()

  const deletedMap = new Map(rows.results.map((row) => [row.id, row]))
  const visible = rows.results.filter((row) => {
    if (allowedNoteIds !== null && !allowedNoteIds.has(row.id)) return false
    if (!row.parent_id) return true
    if (allowedNoteIds !== null && !allowedNoteIds.has(row.parent_id)) return true
    return !deletedMap.has(row.parent_id)
  })

  const paged = visible.slice((page - 1) * pageSize, page * pageSize)
  return c.json({ data: paged, meta: { total: visible.length, page, page_size: pageSize } })
})

/**
 * GET /api/notes/:id
 * 获取单个笔记（含 content）
 */
notes.get('/:id', async (c) => {
  const { id } = c.req.param()
  const { clause, params } = teamFilter(c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  const row = await c.env.DB.prepare(
    `SELECT id, title, content, icon, parent_id, sort_order, is_locked, created_by, owner_id, created_at, updated_at, cover, description
     FROM _notes WHERE id = ? AND ${clause} AND deleted_at IS NULL`
  ).bind(id, ...params)
    .first<{ id: string; title: string; content: string; icon: string | null; parent_id: string | null; sort_order: number; is_locked: number; created_by: number | null; owner_id: number | null; created_at: number; updated_at: number }>()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404)
  }

  return c.json({ data: row })
})

/**
 * POST /api/notes
 * 创建笔记
 */
notes.post('/', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{
    title?: string
    content?: string
    parent_id?: string
  }>()

  const MAX_CONTENT = 1024 * 1024 // 1MB
  if (body.content && body.content.length > MAX_CONTENT) {
    return c.json({ error: { code: 'CONTENT_TOO_LARGE', message: 'Note content exceeds 1MB limit' } }, 413)
  }
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  // Validate parent_id exists, not deleted, and belongs to same team
  const teamId = c.get('teamId')
  if (body.parent_id) {
    if (!canAccessNote(allowedNoteIds, body.parent_id)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot create under this note' } }, 403)
    }
    let parentSql = `SELECT id FROM _notes WHERE id = ? AND deleted_at IS NULL`
    const parentParams: unknown[] = [body.parent_id]
    if (teamId !== undefined) {
      parentSql += ` AND team_id = ?`
      parentParams.push(teamId)
    }
    const parent = await c.env.DB.prepare(parentSql).bind(...parentParams).first()
    if (!parent) {
      return c.json({ error: { code: 'INVALID_PARENT', message: 'Parent note not found' } }, 400)
    }
  } else if (allowedNoteIds !== null) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Scoped note access can only create notes inside allowed directories' } }, 403)
  }

  const id = generateId()
  const userId = c.get('userId')

  await c.env.DB.prepare(
    `INSERT INTO _notes (id, title, content, parent_id, created_by, owner_id, team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.title?.trim() || 'Untitled',
    body.content ?? '',
    body.parent_id ?? null,
    userId ?? null,
    userId ?? null,
    c.get('teamId') ?? null,
  ).run()

  return c.json({ data: { id, title: body.title?.trim() || 'Untitled' } }, 201)
})

/**
 * PATCH /api/notes/:id
 * 更新笔记
 */
notes.patch('/:id', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    title?: string
    content?: string
    icon?: string | null
    parent_id?: string | null
    sort_order?: number
    is_locked?: boolean
  }>()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  const sets: string[] = ['updated_at = unixepoch()']
  const params: unknown[] = []

  if (body.title !== undefined) {
    sets.push('title = ?')
    params.push(body.title.trim() || 'Untitled')
  }
  if (body.content !== undefined) {
    const MAX_CONTENT = 1024 * 1024 // 1MB — D1 row size limit
    if (body.content.length > MAX_CONTENT) {
      return c.json({ error: { code: 'CONTENT_TOO_LARGE', message: 'Note content exceeds 1MB limit' } }, 413)
    }
    sets.push('content = ?')
    params.push(body.content)
  }
  if (body.icon !== undefined) {
    sets.push('icon = ?')
    params.push(body.icon)
  }
  if (body.parent_id !== undefined) {
    // Prevent circular reference: parent cannot be self or a descendant
    if (body.parent_id === id) {
      return c.json({ error: { code: 'INVALID_PARENT', message: 'Cannot set note as its own parent' } }, 400)
    }
    if (body.parent_id) {
      if (!canAccessNote(allowedNoteIds, body.parent_id)) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot move note outside allowed directories' } }, 403)
      }
      // Validate parent exists and belongs to same team
      let parentCheckSql = 'SELECT id FROM _notes WHERE id = ? AND deleted_at IS NULL'
      const parentCheckParams: unknown[] = [body.parent_id]
      if (teamId !== undefined) {
        parentCheckSql += ' AND team_id = ?'
        parentCheckParams.push(teamId)
      }
      const parentExists = await c.env.DB.prepare(parentCheckSql).bind(...parentCheckParams).first()
      if (!parentExists) {
        return c.json({ error: { code: 'INVALID_PARENT', message: 'Parent note not found' } }, 400)
      }
      // Walk up from parent_id to check for cycles (within same team)
      let cursor: string | null = body.parent_id
      const visited = new Set<string>()
      while (cursor) {
        if (cursor === id) {
          return c.json({ error: { code: 'INVALID_PARENT', message: 'Cannot set a descendant as parent (circular reference)' } }, 400)
        }
        if (visited.has(cursor)) break
        visited.add(cursor)
        let walkSql = 'SELECT parent_id FROM _notes WHERE id = ?'
        const walkParams: unknown[] = [cursor]
        if (teamId !== undefined) {
          walkSql += ' AND team_id = ?'
          walkParams.push(teamId)
        }
        const parentRow = await c.env.DB.prepare(walkSql).bind(...walkParams).first<{ parent_id: string | null }>()
        cursor = parentRow?.parent_id ?? null
      }
    }
    sets.push('parent_id = ?')
    params.push(body.parent_id)
  }
  if (body.sort_order !== undefined) {
    sets.push('sort_order = ?')
    params.push(body.sort_order)
  }
  if (body.is_locked !== undefined) {
    sets.push('is_locked = ?')
    params.push(body.is_locked ? 1 : 0)
  }
  if ((body as { cover?: string | null }).cover !== undefined) {
    sets.push('cover = ?')
    params.push((body as { cover?: string | null }).cover)
  }
  if ((body as { description?: string | null }).description !== undefined) {
    sets.push('description = ?')
    params.push((body as { description?: string | null }).description)
  }

  if (sets.length === 1) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  params.push(id)
  let sql = `UPDATE _notes SET ${sets.join(', ')} WHERE id = ?`
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }

  const result = await c.env.DB.prepare(sql).bind(...params).run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * POST /api/notes/:id/archive
 * Archive a note and all its descendants
 */
notes.post('/:id/archive', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  // Verify note exists and is not deleted
  let verifySql = `SELECT id, parent_id FROM _notes WHERE id = ? AND deleted_at IS NULL`
  const verifyParams: unknown[] = [id]
  if (teamId !== undefined) {
    verifySql += ` AND team_id = ?`
    verifyParams.push(teamId)
  }
  const target = await c.env.DB.prepare(verifySql).bind(...verifyParams).first<{ id: string; parent_id: string | null }>()
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404)
  }

  // Cannot archive root notes (notes without parent)
  if (!target.parent_id) {
    return c.json({ error: { code: 'INVALID_OPERATION', message: 'Cannot archive root notes directly' } }, 400)
  }

  const allIds = await collectDescendants(c.env.DB, id, teamId, allowedNoteIds)

  const now = Math.floor(Date.now() / 1000)
  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET archived_at = ? WHERE id = ? AND archived_at IS NULL AND deleted_at IS NULL`
    const params: unknown[] = [now, noteId]
    if (teamId !== undefined) {
      sql += ` AND team_id = ?`
      params.push(teamId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)
  return c.json({ data: { success: true, archived_count: allIds.length } })
})

/**
 * POST /api/notes/:id/unarchive
 * Unarchive a note and all its descendants
 */
notes.post('/:id/unarchive', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  const allIds = await collectDescendants(c.env.DB, id, teamId, allowedNoteIds)

  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET archived_at = NULL WHERE id = ? AND deleted_at IS NULL`
    const params: unknown[] = [noteId]
    if (teamId !== undefined) {
      sql += ` AND team_id = ?`
      params.push(teamId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)
  return c.json({ data: { success: true } })
})

/**
 * POST /api/notes/batch-archive
 * Batch archive multiple notes
 */
notes.post('/batch-archive', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{ ids: string[] }>()
  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'ids array is required' } }, 400)
  }
  if (body.ids.length > 50) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Maximum 50 notes per batch' } }, 400)
  }

  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))
  const now = Math.floor(Date.now() / 1000)

  // Validate IDs are strings
  const validIds = body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)

  // For each ID, collect descendants and archive
  const allIds = new Set<string>()
  for (const noteId of validIds) {
    if (!canAccessNote(allowedNoteIds, noteId)) continue
    const descendants = await collectDescendants(c.env.DB, noteId, teamId, allowedNoteIds)
    descendants.forEach(id => allIds.add(id))
  }

  const stmts = [...allIds].map(nid => {
    let sql = `UPDATE _notes SET archived_at = ? WHERE id = ? AND archived_at IS NULL AND deleted_at IS NULL`
    const params: unknown[] = [now, nid]
    if (teamId !== undefined) {
      sql += ` AND team_id = ?`
      params.push(teamId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  if (stmts.length > 0) await c.env.DB.batch(stmts)
  return c.json({ data: { success: true, archived_count: allIds.size } })
})

/**
 * DELETE /api/notes/:id
 * Soft delete: set deleted_at on note and all descendants
 */
notes.delete('/:id', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  // Verify the target note belongs to current team
  let verifySql = `SELECT id FROM _notes WHERE id = ? AND deleted_at IS NULL`
  const verifyParams: unknown[] = [id]
  if (teamId !== undefined) {
    verifySql += ` AND team_id = ?`
    verifyParams.push(teamId)
  }
  const target = await c.env.DB.prepare(verifySql).bind(...verifyParams).first()
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404)
  }

  const allIds = await collectDescendants(c.env.DB, id, teamId, allowedNoteIds)
  const now = Math.floor(Date.now() / 1000)

  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
    const params: unknown[] = [now, noteId]
    if (teamId !== undefined) {
      sql += ` AND team_id = ?`
      params.push(teamId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/notes/:id/permanent
 * Hard-delete a soft-deleted note (already in trash)
 */
notes.delete('/:id/permanent', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  let sql = `DELETE FROM _notes WHERE id = ? AND deleted_at IS NOT NULL`
  const params: unknown[] = [id]
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }

  const result = await c.env.DB.prepare(sql).bind(...params).run()
  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Deleted note not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * POST /api/notes/:id/restore
 * Restore a soft-deleted note (and its descendants)
 */
notes.post('/:id/restore', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))

  if (!canAccessNote(allowedNoteIds, id)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Access to this note is not allowed' } }, 403)
  }

  // Restore note and all descendants deleted at the same timestamp
  let noteSql = `SELECT deleted_at FROM _notes WHERE id = ?`
  const noteParams: unknown[] = [id]
  if (teamId !== undefined) {
    noteSql += ` AND team_id = ?`
    noteParams.push(teamId)
  }
  const note = await c.env.DB.prepare(noteSql).bind(...noteParams)
    .first<{ deleted_at: number | null }>()

  if (!note || !note.deleted_at) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Deleted note not found' } }, 404)
  }

  // BFS to find all descendants deleted at the same timestamp (with access check + breadth cap)
  const allIds: string[] = [id]
  let currentLevel = [id]
  for (let depth = 0; depth < 10 && currentLevel.length > 0; depth++) {
    const placeholders = currentLevel.map(() => '?').join(',')
    let childSql = `SELECT id FROM _notes WHERE parent_id IN (${placeholders}) AND deleted_at = ?`
    const childParams: unknown[] = [...currentLevel, note.deleted_at]
    if (teamId !== undefined) {
      childSql += ` AND team_id = ?`
      childParams.push(teamId)
    }
    const children = await c.env.DB.prepare(childSql).bind(...childParams).all<{ id: string }>()
    currentLevel = children.results
      .filter(r => allowedNoteIds === null || allowedNoteIds.has(r.id))
      .map(r => r.id)
      .slice(0, 500)
    allIds.push(...currentLevel)
  }

  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET deleted_at = NULL WHERE id = ? AND deleted_at = ?`
    const params: unknown[] = [noteId, note.deleted_at]
    if (teamId !== undefined) {
      sql += ` AND team_id = ?`
      params.push(teamId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

export default notes
