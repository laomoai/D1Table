import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { getUserTables } from '../utils/schema-cache'

const dashboards = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// GET /api/tables/:tableName/dashboard
dashboards.get('/:tableName/dashboard', async (c) => {
  const { tableName } = c.req.param()
  const tables = await getUserTables(c.env.DB)
  if (!tables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: 'Table not found' } }, 404)
  }

  const row = await c.env.DB
    .prepare('SELECT config FROM _dashboards WHERE table_name = ?')
    .bind(tableName)
    .first<{ config: string }>()

  let config: unknown[] = []
  if (row) {
    try { config = JSON.parse(row.config) } catch { /* corrupted data, return empty */ }
  }
  return c.json({ data: { config } })
})

// PUT /api/tables/:tableName/dashboard
dashboards.put('/:tableName/dashboard', requireWriteMiddleware, async (c) => {
  const { tableName } = c.req.param()
  const tables = await getUserTables(c.env.DB)
  if (!tables.includes(tableName)) {
    return c.json({ error: { code: 'TABLE_NOT_FOUND', message: 'Table not found' } }, 404)
  }

  const body = await c.req.json<{ config: unknown[] }>()
  const config = JSON.stringify(body.config ?? [])

  // 限制 config 大小（50KB）
  if (config.length > 50_000) {
    return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Dashboard config exceeds 50KB limit' } }, 400)
  }

  await c.env.DB
    .prepare(`
      INSERT INTO _dashboards (table_name, config, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(table_name) DO UPDATE SET config = excluded.config, updated_at = unixepoch()
    `)
    .bind(tableName, config)
    .run()

  return c.json({ data: { success: true } })
})

export default dashboards
