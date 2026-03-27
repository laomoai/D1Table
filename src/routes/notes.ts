import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware, teamFilter } from '../middleware/auth'
import { canAccessNote, getAccessibleNoteIds } from '../utils/note-access'

const notes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

function generateId(): string {
  return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
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
       FROM _notes WHERE ${clause} AND deleted_at IS NULL
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

  let sql = `SELECT id, title, icon, parent_id, sort_order, created_by, created_at, updated_at FROM _notes WHERE ${clause} AND deleted_at IS NULL`

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
     FROM _notes WHERE ${clause} AND deleted_at IS NULL
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
    `SELECT id, title, content, icon, parent_id, sort_order, is_locked, created_by, owner_id, created_at, updated_at
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

  // Collect all descendant IDs level by level (breadth-first, max 10 levels)
  // Only traverse within same team
  const allIds: string[] = [id]
  let currentLevel = [id]
  for (let depth = 0; depth < 10 && currentLevel.length > 0; depth++) {
    const placeholders = currentLevel.map(() => '?').join(',')
    let childSql = `SELECT id FROM _notes WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL`
    const childParams: unknown[] = [...currentLevel]
    if (teamId !== undefined) {
      childSql += ` AND team_id = ?`
      childParams.push(teamId)
    }
    const children = await c.env.DB.prepare(childSql).bind(...childParams).all<{ id: string }>()
    currentLevel = children.results.map(r => r.id)
    allIds.push(...currentLevel)
  }
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

  // Use same breadth-first approach as delete to find all descendants (within same team)
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
    currentLevel = children.results.map(r => r.id)
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
