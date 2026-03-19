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

  return c.json({ data: { config: row ? JSON.parse(row.config) : [] } })
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
