import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'

const notes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

function generateId(): string {
  return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/**
 * Owner filter: strict ownership for regular users, full access for ADMIN_KEY.
 * Regular users can only see/edit their own notes (owner_id = userId).
 * ADMIN_KEY (userId = undefined) bypasses ownership checks.
 */
function ownerFilter(userId: number | undefined): { clause: string; params: unknown[] } {
  if (userId !== undefined) {
    return { clause: `owner_id = ?`, params: [userId] }
  }
  return { clause: '1=1', params: [] }
}

/**
 * GET /api/notes
 * 获取笔记列表（支持按 parent_id 过滤）
 */
notes.get('/', async (c) => {
  const userId = c.get('userId')
  const { clause, params } = ownerFilter(userId)

  const parentId = c.req.query('parent_id')

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
  const userId = c.get('userId')
  const { clause, params } = ownerFilter(userId)

  const rows = await c.env.DB.prepare(
    `SELECT id, title, icon, parent_id, sort_order, is_locked, created_at, updated_at
     FROM _notes WHERE ${clause} AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at DESC
     LIMIT 500`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; sort_order: number; is_locked: number; created_at: number; updated_at: number }>()

  return c.json({ data: rows.results })
})

/**
 * GET /api/notes/trash
 * List soft-deleted notes
 */
notes.get('/trash', async (c) => {
  const userId = c.get('userId')
  const { clause, params } = ownerFilter(userId)

  const rows = await c.env.DB.prepare(
    `SELECT id, title, icon, deleted_at FROM _notes WHERE ${clause} AND deleted_at IS NOT NULL AND parent_id IS NULL
     ORDER BY deleted_at DESC
     LIMIT 50`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; deleted_at: number }>()

  return c.json({ data: rows.results })
})

/**
 * GET /api/notes/:id
 * 获取单个笔记（含 content）
 */
notes.get('/:id', async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')
  const { clause, params } = ownerFilter(userId)

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

  // Validate parent_id exists and is not deleted
  if (body.parent_id) {
    const parent = await c.env.DB.prepare(
      `SELECT id FROM _notes WHERE id = ? AND deleted_at IS NULL`
    ).bind(body.parent_id).first()
    if (!parent) {
      return c.json({ error: { code: 'INVALID_PARENT', message: 'Parent note not found' } }, 400)
    }
  }

  const id = generateId()
  const userId = c.get('userId')

  await c.env.DB.prepare(
    `INSERT INTO _notes (id, title, content, parent_id, created_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    body.title?.trim() || 'Untitled',
    body.content ?? '',
    body.parent_id ?? null,
    userId ?? null,
    userId ?? null,
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
  const userId = c.get('userId')

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
      // Walk up from parent_id to check for cycles
      let cursor: string | null = body.parent_id
      const visited = new Set<string>()
      while (cursor) {
        if (cursor === id) {
          return c.json({ error: { code: 'INVALID_PARENT', message: 'Cannot set a descendant as parent (circular reference)' } }, 400)
        }
        if (visited.has(cursor)) break // safety: break if already visited
        visited.add(cursor)
        const row = await c.env.DB.prepare('SELECT parent_id FROM _notes WHERE id = ?').bind(cursor).first<{ parent_id: string | null }>()
        cursor = row?.parent_id ?? null
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
  if (userId !== undefined) {
    sql += ` AND owner_id = ?`
    params.push(userId)
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
  const userId = c.get('userId')

  // Collect all descendant IDs level by level (breadth-first, max 10 levels)
  // Each level is 1 query instead of 1-per-node
  const allIds: string[] = [id]
  let currentLevel = [id]
  for (let depth = 0; depth < 10 && currentLevel.length > 0; depth++) {
    const placeholders = currentLevel.map(() => '?').join(',')
    const children = await c.env.DB.prepare(
      `SELECT id FROM _notes WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL`
    ).bind(...currentLevel).all<{ id: string }>()
    currentLevel = children.results.map(r => r.id)
    allIds.push(...currentLevel)
  }
  const now = Math.floor(Date.now() / 1000)

  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`
    const params: unknown[] = [now, noteId]
    if (userId !== undefined) {
      sql += ` AND owner_id = ?`
      params.push(userId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * POST /api/notes/:id/restore
 * Restore a soft-deleted note (and its descendants)
 */
notes.post('/:id/restore', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')

  // Restore note and all descendants deleted at the same timestamp
  const note = await c.env.DB.prepare(
    `SELECT deleted_at FROM _notes WHERE id = ?`
  ).bind(id).first<{ deleted_at: number | null }>()

  if (!note || !note.deleted_at) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Deleted note not found' } }, 404)
  }

  // Use same breadth-first approach as delete to find all descendants
  const allIds: string[] = [id]
  let currentLevel = [id]
  for (let depth = 0; depth < 10 && currentLevel.length > 0; depth++) {
    const placeholders = currentLevel.map(() => '?').join(',')
    const children = await c.env.DB.prepare(
      `SELECT id FROM _notes WHERE parent_id IN (${placeholders}) AND deleted_at = ?`
    ).bind(...currentLevel, note.deleted_at).all<{ id: string }>()
    currentLevel = children.results.map(r => r.id)
    allIds.push(...currentLevel)
  }

  const stmts = allIds.map(noteId => {
    let sql = `UPDATE _notes SET deleted_at = NULL WHERE id = ? AND deleted_at = ?`
    const params: unknown[] = [noteId, note.deleted_at]
    if (userId !== undefined) {
      sql += ` AND owner_id = ?`
      params.push(userId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

export default notes
