import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'

const notes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

function generateId(): string {
  return 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/** owner 过滤条件辅助 */
function ownerFilter(userId: number | undefined): { clause: string; params: unknown[] } {
  if (userId !== undefined) {
    return { clause: `(owner_id = ? OR owner_id IS NULL)`, params: [userId] }
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

  let sql = `SELECT id, title, icon, parent_id, sort_order, created_by, created_at, updated_at FROM _notes WHERE ${clause}`

  if (parentId && parentId !== 'root') {
    sql += ` AND parent_id = ?`
    params.push(parentId)
  } else {
    // Top-level notes
    sql += ` AND parent_id IS NULL`
  }

  sql += ` ORDER BY sort_order ASC, created_at DESC`

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
    `SELECT id, title, icon, parent_id, sort_order, created_at, updated_at
     FROM _notes WHERE ${clause}
     ORDER BY sort_order ASC, created_at DESC`
  ).bind(...params)
    .all<{ id: string; title: string; icon: string | null; parent_id: string | null; sort_order: number; created_at: number; updated_at: number }>()

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
    `SELECT id, title, content, icon, parent_id, sort_order, created_by, owner_id, created_at, updated_at
     FROM _notes WHERE id = ? AND ${clause}`
  ).bind(id, ...params)
    .first<{ id: string; title: string; content: string; icon: string | null; parent_id: string | null; sort_order: number; created_by: number | null; owner_id: number | null; created_at: number; updated_at: number }>()

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

  const MAX_CONTENT = 5 * 1024 * 1024 // 5MB
  if (body.content && body.content.length > MAX_CONTENT) {
    return c.json({ error: { code: 'CONTENT_TOO_LARGE', message: 'Note content exceeds 5MB limit' } }, 413)
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
  }>()
  const userId = c.get('userId')

  const sets: string[] = ['updated_at = unixepoch()']
  const params: unknown[] = []

  if (body.title !== undefined) {
    sets.push('title = ?')
    params.push(body.title.trim() || 'Untitled')
  }
  if (body.content !== undefined) {
    const MAX_CONTENT = 5 * 1024 * 1024
    if (body.content.length > MAX_CONTENT) {
      return c.json({ error: { code: 'CONTENT_TOO_LARGE', message: 'Note content exceeds 5MB limit' } }, 413)
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

  if (sets.length === 1) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  params.push(id)
  let sql = `UPDATE _notes SET ${sets.join(', ')} WHERE id = ?`
  if (userId !== undefined) {
    sql += ` AND (owner_id = ? OR owner_id IS NULL)`
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
 * 删除笔记（级联删除子笔记）
 */
notes.delete('/:id', requireWriteMiddleware, async (c) => {
  const { id } = c.req.param()
  const userId = c.get('userId')

  // 递归获取所有子笔记 ID
  async function getDescendantIds(parentId: string): Promise<string[]> {
    const children = await c.env.DB.prepare(
      `SELECT id FROM _notes WHERE parent_id = ?`
    ).bind(parentId).all<{ id: string }>()

    const ids: string[] = []
    for (const child of children.results) {
      ids.push(child.id)
      ids.push(...await getDescendantIds(child.id))
    }
    return ids
  }

  const allIds = [id, ...await getDescendantIds(id)]

  const stmts = allIds.map(noteId => {
    let sql = `DELETE FROM _notes WHERE id = ?`
    const params: unknown[] = [noteId]
    if (userId !== undefined) {
      sql += ` AND (owner_id = ? OR owner_id IS NULL)`
      params.push(userId)
    }
    return c.env.DB.prepare(sql).bind(...params)
  })

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

export default notes
