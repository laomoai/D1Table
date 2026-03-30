import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware, requireAdminMiddleware } from '../middleware/auth'
import { isValidEmail } from '../utils/members'
import { generateApiKey, sha256 } from '../utils/crypto'

const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

type ApiKeySchemaCapabilities = {
  hasNotesScopeColumn: boolean
  hasNoteRootsTable: boolean
}

async function getApiKeySchemaCapabilities(db: D1Database): Promise<ApiKeySchemaCapabilities> {
  const [apiKeyColumns, noteRootsTable] = await Promise.all([
    db.prepare(`PRAGMA table_info('_api_keys')`).all<{ name: string }>(),
    db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_api_key_note_roots'`
    ).first<{ name: string }>(),
  ])
  const hasNotesScopeColumn = apiKeyColumns.results.some((c) => c.name === 'notes_scope')
  return {
    hasNotesScopeColumn,
    hasNoteRootsTable: !!noteRootsTable,
  }
}

function getDefaultNotesScope(scope: 'all' | 'groups'): 'all' | 'none' {
  return scope === 'groups' ? 'none' : 'all'
}

async function validateGroupIds(
  db: D1Database,
  teamId: number | undefined,
  groupIds: number[] | undefined,
): Promise<boolean> {
  if (!groupIds || groupIds.length === 0) return true
  const placeholders = groupIds.map(() => '?').join(',')
  let sql = `SELECT id FROM _groups WHERE id IN (${placeholders})`
  const params: unknown[] = [...groupIds]
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }
  const rows = await db.prepare(sql).bind(...params).all<{ id: number }>()
  return rows.results.length === new Set(groupIds).size
}

async function validateNoteRootIds(
  db: D1Database,
  teamId: number | undefined,
  noteRootIds: string[] | undefined,
): Promise<boolean> {
  if (!noteRootIds || noteRootIds.length === 0) return true
  const placeholders = noteRootIds.map(() => '?').join(',')
  let sql = `SELECT id FROM _notes WHERE id IN (${placeholders}) AND deleted_at IS NULL`
  const params: unknown[] = [...noteRootIds]
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }
  const rows = await db.prepare(sql).bind(...params).all<{ id: string }>()
  return rows.results.length === new Set(noteRootIds).size
}

// 所有 admin 路由都需要读写权限
admin.use('*', requireWriteMiddleware)

// ── API Key 管理 ──────────────────────────────────────────────

/**
 * GET /api/admin/keys
 * 获取当前用户的 API Key 列表
 */
admin.get('/keys', async (c) => {
  const teamId = c.get('teamId')
  const capabilities = await getApiKeySchemaCapabilities(c.env.DB)

  const notesScopeSelect = capabilities.hasNotesScopeColumn
    ? 'notes_scope'
    : "CASE WHEN scope = 'groups' THEN 'none' ELSE 'all' END AS notes_scope"

  const keySql = teamId !== undefined
    ? `SELECT id, key_prefix, name, type, scope, ${notesScopeSelect}, created_at, is_active, last_used_at FROM _api_keys WHERE team_id = ? ORDER BY created_at DESC LIMIT 200`
    : `SELECT id, key_prefix, name, type, scope, ${notesScopeSelect}, created_at, is_active, last_used_at FROM _api_keys ORDER BY created_at DESC LIMIT 200`

  const rows = teamId !== undefined
    ? await c.env.DB.prepare(keySql).bind(teamId).all<{ id: number; key_prefix: string; name: string; type: string; scope: string; notes_scope: string; created_at: number; is_active: number; last_used_at: number | null }>()
    : await c.env.DB.prepare(keySql).all<{ id: number; key_prefix: string; name: string; type: string; scope: string; notes_scope: string; created_at: number; is_active: number; last_used_at: number | null }>()

  // 获取每个 key 关联的分组
  const akgRows = await c.env.DB
    .prepare(
      `SELECT akg.key_id, akg.group_id, g.name as group_name
       FROM _api_key_groups akg JOIN _groups g ON g.id = akg.group_id`
    )
    .all<{ key_id: number; group_id: number; group_name: string }>()

  const groupsByKey = new Map<number, Array<{ id: number; name: string }>>()
  for (const r of akgRows.results) {
    const arr = groupsByKey.get(r.key_id) ?? []
    arr.push({ id: r.group_id, name: r.group_name })
    groupsByKey.set(r.key_id, arr)
  }

  const noteRootsByKey = new Map<string, Array<{ id: string; title: string }>>()
  if (capabilities.hasNoteRootsTable) {
    const noteRootRows = await c.env.DB.prepare(
      `SELECT akn.key_id, akn.note_id, n.title
       FROM _api_key_note_roots akn
       JOIN _notes n ON n.id = akn.note_id`
    ).all<{ key_id: number | string; note_id: string; title: string | null }>()
    for (const r of noteRootRows.results) {
      const keyId = String(r.key_id)
      const arr = noteRootsByKey.get(keyId) ?? []
      arr.push({ id: r.note_id, title: r.title || 'Untitled' })
      noteRootsByKey.set(keyId, arr)
    }
  }

  const data = rows.results.map(row => ({
    ...row,
    groups: groupsByKey.get(row.id) ?? [],
    note_roots: noteRootsByKey.get(String(row.id)) ?? [],
  }))

  return c.json({ data })
})

/**
 * POST /api/admin/keys
 * 创建新 API Key
 */
admin.post('/keys', async (c) => {
  const capabilities = await getApiKeySchemaCapabilities(c.env.DB)
  const body = await c.req.json<{
    name: string
    type?: 'readonly' | 'readwrite'
    scope?: 'all' | 'groups'
    group_ids?: number[]
    notes_scope?: 'all' | 'none' | 'roots'
    note_root_ids?: string[]
  }>()

  if (!body.name?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Key name is required' } }, 400)
  }

  const normalizedGroupIds = Array.isArray(body.group_ids)
    ? [...new Set(body.group_ids.filter((v): v is number => Number.isInteger(v)))]
    : []
  const normalizedNoteRootIds = Array.isArray(body.note_root_ids)
    ? [...new Set(body.note_root_ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : []

  if (body.scope === 'groups') {
    const validGroups = await validateGroupIds(c.env.DB, c.get('teamId'), normalizedGroupIds)
    if (!validGroups) {
      return c.json({ error: { code: 'INVALID_GROUPS', message: 'One or more selected groups are invalid' } }, 400)
    }
  }

  if (body.notes_scope === 'roots') {
    const validRoots = await validateNoteRootIds(c.env.DB, c.get('teamId'), normalizedNoteRootIds)
    if (!validRoots) {
      return c.json({ error: { code: 'INVALID_NOTE_ROOTS', message: 'One or more selected note directories are invalid' } }, 400)
    }
  }

  const keyType = body.type === 'readwrite' ? 'readwrite' : 'readonly'
  const scope = body.scope === 'groups' ? 'groups' : 'all'
  const notesScope = body.notes_scope === 'roots' ? 'roots' : body.notes_scope === 'none' ? 'none' : getDefaultNotesScope(scope)

  if ((body.notes_scope !== undefined || Array.isArray(body.note_root_ids)) && !capabilities.hasNotesScopeColumn) {
    return c.json(
      { error: { code: 'MIGRATION_REQUIRED', message: 'Database migration required before using notes permissions for API keys' } },
      503,
    )
  }
  if (notesScope === 'roots' && !capabilities.hasNoteRootsTable) {
    return c.json(
      { error: { code: 'MIGRATION_REQUIRED', message: 'Database migration required before using notes directory permissions' } },
      503,
    )
  }
  const plainKey = generateApiKey(keyType)
  const keyHash = await sha256(plainKey)
  const keyPrefix = plainKey.slice(0, 10)

  let newKeyId: number | null = null
  try {
    const insertResult = capabilities.hasNotesScopeColumn
      ? await c.env.DB
          .prepare(`INSERT INTO _api_keys (key_prefix, key_hash, name, type, scope, notes_scope, user_id, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(keyPrefix, keyHash, body.name.trim(), keyType, scope, notesScope, c.get('userId') ?? null, c.get('teamId') ?? null)
          .run()
      : await c.env.DB
          .prepare(`INSERT INTO _api_keys (key_prefix, key_hash, name, type, scope, user_id, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(keyPrefix, keyHash, body.name.trim(), keyType, scope, c.get('userId') ?? null, c.get('teamId') ?? null)
          .run()

    newKeyId = insertResult.meta.last_row_id

    if (scope === 'groups' && newKeyId && normalizedGroupIds.length > 0) {
      const groupStmts = normalizedGroupIds.map(gid =>
        c.env.DB.prepare(
          `INSERT INTO _api_key_groups (key_id, group_id) VALUES (?, ?)`
        ).bind(newKeyId, gid)
      )
      await c.env.DB.batch(groupStmts)
    }

    if (notesScope === 'roots' && capabilities.hasNoteRootsTable && newKeyId && normalizedNoteRootIds.length > 0) {
      const noteStmts = normalizedNoteRootIds.map(noteId =>
        c.env.DB.prepare(
          `INSERT INTO _api_key_note_roots (key_id, note_id) VALUES (?, ?)`
        ).bind(String(newKeyId), noteId)
      )
      await c.env.DB.batch(noteStmts)
    }
  } catch (err) {
    const message = (err as Error).message || ''
    if (message.includes('no such column: notes_scope') || message.includes('no such table: _api_key_note_roots')) {
      return c.json(
        { error: { code: 'MIGRATION_REQUIRED', message: 'Database migration required before creating API keys with notes permissions' } },
        503,
      )
    }
    if (message.includes('FOREIGN KEY constraint failed')) {
      return c.json(
        { error: { code: 'INVALID_BODY', message: 'Selected groups or note directories are invalid' } },
        400,
      )
    }
    throw err
  }

  return c.json({
    data: {
      key: plainKey,
      key_prefix: keyPrefix,
      name: body.name.trim(),
      type: keyType,
      scope,
      notes_scope: notesScope,
      group_ids: scope === 'groups' ? normalizedGroupIds : [],
      note_root_ids: notesScope === 'roots' ? normalizedNoteRootIds : [],
    },
    message: 'Save this key now — it will not be shown again',
  }, 201)
})

/**
 * PATCH /api/admin/keys/:id
 * 更新 Key 的 scope 和关联分组
 */
admin.patch('/keys/:id', async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const capabilities = await getApiKeySchemaCapabilities(c.env.DB)
  const body = await c.req.json<{
    scope?: 'all' | 'groups'
    group_ids?: number[]
    notes_scope?: 'all' | 'none' | 'roots'
    note_root_ids?: string[]
  }>()

  const normalizedGroupIds = Array.isArray(body.group_ids)
    ? [...new Set(body.group_ids.filter((v): v is number => Number.isInteger(v)))]
    : undefined
  const normalizedNoteRootIds = Array.isArray(body.note_root_ids)
    ? [...new Set(body.note_root_ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : undefined

  if (Array.isArray(body.group_ids)) {
    const validGroups = await validateGroupIds(c.env.DB, teamId, normalizedGroupIds)
    if (!validGroups) {
      return c.json({ error: { code: 'INVALID_GROUPS', message: 'One or more selected groups are invalid' } }, 400)
    }
  }

  if ((body.notes_scope !== undefined || Array.isArray(body.note_root_ids)) && !capabilities.hasNotesScopeColumn) {
    return c.json(
      { error: { code: 'MIGRATION_REQUIRED', message: 'Database migration required before using notes permissions for API keys' } },
      503,
    )
  }
  if ((body.notes_scope === 'roots' || Array.isArray(body.note_root_ids)) && !capabilities.hasNoteRootsTable) {
    return c.json(
      { error: { code: 'MIGRATION_REQUIRED', message: 'Database migration required before using notes directory permissions' } },
      503,
    )
  }

  if (body.notes_scope === 'roots' || Array.isArray(body.note_root_ids)) {
    const validRoots = await validateNoteRootIds(c.env.DB, teamId, normalizedNoteRootIds)
    if (!validRoots) {
      return c.json({ error: { code: 'INVALID_NOTE_ROOTS', message: 'One or more selected note directories are invalid' } }, 400)
    }
  }

  // 验证 key 归属
  if (teamId !== undefined) {
    const key = await c.env.DB.prepare(
      `SELECT id FROM _api_keys WHERE id = ? AND team_id = ?`
    ).bind(id, teamId).first()
    if (!key) return c.json({ error: { code: 'NOT_FOUND', message: 'Key not found' } }, 404)
  }

  const stmts: D1PreparedStatement[] = []

  if (body.scope) {
    stmts.push(
      c.env.DB.prepare(`UPDATE _api_keys SET scope = ? WHERE id = ?`).bind(body.scope, id)
    )
  }

  if (body.notes_scope && capabilities.hasNotesScopeColumn) {
    stmts.push(
      c.env.DB.prepare(`UPDATE _api_keys SET notes_scope = ? WHERE id = ?`).bind(body.notes_scope, id)
    )
  }

  if (Array.isArray(body.group_ids)) {
    stmts.push(
      c.env.DB.prepare(`DELETE FROM _api_key_groups WHERE key_id = ?`).bind(id)
    )
    for (const gid of normalizedGroupIds ?? []) {
      stmts.push(
        c.env.DB.prepare(`INSERT INTO _api_key_groups (key_id, group_id) VALUES (?, ?)`).bind(id, gid)
      )
    }
  }

  if (Array.isArray(body.note_root_ids) && capabilities.hasNoteRootsTable) {
    stmts.push(
      c.env.DB.prepare(`DELETE FROM _api_key_note_roots WHERE key_id = ?`).bind(String(id))
    )
    for (const noteId of normalizedNoteRootIds ?? []) {
      stmts.push(
        c.env.DB.prepare(`INSERT INTO _api_key_note_roots (key_id, note_id) VALUES (?, ?)`).bind(String(id), noteId)
      )
    }
  }

  if (stmts.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/keys/:id
 * 撤销 API Key（软删除）
 */
admin.delete('/keys/:id', async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')

  let sql = `UPDATE _api_keys SET is_active = 0 WHERE id = ?`
  const params: unknown[] = [id]
  if (teamId !== undefined) {
    sql += ` AND team_id = ?`
    params.push(teamId)
  }

  const result = await c.env.DB.prepare(sql).bind(...params).run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Key not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/keys/:id/permanent
 * 永久删除已撤销的 API Key
 */
admin.delete('/keys/:id/permanent', async (c) => {
  const { id } = c.req.param()
  const teamId = c.get('teamId')
  const capabilities = await getApiKeySchemaCapabilities(c.env.DB)

  let selectSql = `SELECT id, is_active FROM _api_keys WHERE id = ?`
  const selectParams: unknown[] = [id]
  if (teamId !== undefined) {
    selectSql += ` AND team_id = ?`
    selectParams.push(teamId)
  }

  const key = await c.env.DB.prepare(selectSql).bind(...selectParams).first<{ id: number; is_active: number }>()
  if (!key) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Key not found' } }, 404)
  }
  if (key.is_active) {
    return c.json({ error: { code: 'INVALID_STATE', message: 'Only revoked keys can be permanently deleted' } }, 400)
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`DELETE FROM _api_key_groups WHERE key_id = ?`).bind(id),
  ]

  if (capabilities.hasNoteRootsTable) {
    stmts.push(
      c.env.DB.prepare(`DELETE FROM _api_key_note_roots WHERE key_id = ?`).bind(String(id))
    )
  }

  stmts.push(
    c.env.DB.prepare(`DELETE FROM _api_keys WHERE id = ?`).bind(id)
  )

  await c.env.DB.batch(stmts)

  return c.json({ data: { success: true } })
})

// ── 用户管理（仅 Admin） ────────────────────────────────────────

/**
 * GET /api/admin/users
 * 获取所有用户列表
 */
admin.get('/users', requireAdminMiddleware, async (c) => {
  const rows = await c.env.DB
    .prepare(`SELECT u.id, u.email, u.name, u.picture, u.role, u.status, u.created_at, u.last_login, u.team_id,
              t.name as team_name
              FROM _users u LEFT JOIN _teams t ON t.id = u.team_id ORDER BY u.id ASC`)
    .all<{ id: number; email: string; name: string; picture: string; role: string; status: string; created_at: number; last_login: number | null; team_id: number | null; team_name: string | null }>()

  return c.json({ data: rows.results })
})

/**
 * POST /api/admin/users
 * 添加新用户
 */
admin.post('/users', requireAdminMiddleware, async (c) => {
  const body = await c.req.json<{ email: string; name?: string; role?: 'admin' | 'user' }>()

  const email = body.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid email is required' } }, 400)
  }
  const name = body.name?.trim() || email
  const role = body.role === 'admin' ? 'admin' : 'user'

  // 先检查是否已存在，避免创建孤儿团队
  const existing = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE email = ? LIMIT 1`
  ).bind(email).first()
  if (existing) {
    return c.json({ error: { code: 'USER_EXISTS', message: `User "${email}" already exists` } }, 409)
  }

  // 创建个人团队 + 用户
  const teamResult = await c.env.DB
    .prepare(`INSERT INTO _teams (name) VALUES (?)`)
    .bind(`${name}'s Team`)
    .run()
  const teamId = teamResult.meta.last_row_id

  const result = await c.env.DB
    .prepare(`INSERT INTO _users (email, name, role, team_id) VALUES (?, ?, ?, ?)`)
    .bind(email, name, role, teamId)
    .run()

  await c.env.DB.prepare(`UPDATE _teams SET created_by = ? WHERE id = ?`)
    .bind(result.meta.last_row_id, teamId).run()

  return c.json({ data: { id: result.meta.last_row_id, email, name, role, status: 'active' } }, 201)
})

/**
 * PATCH /api/admin/users/:id
 * 更新用户（角色、状态）
 */
admin.patch('/users/:id', requireAdminMiddleware, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ role?: 'admin' | 'user'; status?: 'active' | 'disabled' }>()
  const currentUserId = c.get('userId')

  // 不能禁用自己
  if (body.status === 'disabled' && Number(id) === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot disable your own account' } }, 400)
  }

  const sets: string[] = []
  const params: unknown[] = []

  if (body.role && ['admin', 'user'].includes(body.role)) {
    sets.push('role = ?')
    params.push(body.role)
  }
  if (body.status && ['active', 'disabled'].includes(body.status)) {
    sets.push('status = ?')
    params.push(body.status)
  }

  if (sets.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'No valid fields provided' } }, 400)
  }

  params.push(id)
  const result = await c.env.DB
    .prepare(`UPDATE _users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/users/:id
 * 禁用用户（软删除）
 */
admin.delete('/users/:id', requireAdminMiddleware, async (c) => {
  const { id } = c.req.param()
  const currentUserId = c.get('userId')

  if (Number(id) === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot disable your own account' } }, 400)
  }

  const result = await c.env.DB
    .prepare(`UPDATE _users SET status = 'disabled' WHERE id = ?`)
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

export default admin
