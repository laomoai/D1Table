import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'

const preferences = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// GET /api/user/preferences
preferences.get('/preferences', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ data: {} })

  const row = await c.env.DB
    .prepare('SELECT data FROM _user_preferences WHERE user_id = ?')
    .bind(userId)
    .first<{ data: string }>()

  let data: Record<string, unknown> = {}
  if (row) {
    try { data = JSON.parse(row.data) } catch { /* corrupted data, return empty */ }
  }
  return c.json({ data })
})

// PUT /api/user/preferences
preferences.put('/preferences', async (c) => {
  const userId = c.get('userId')
  if (!userId) return c.json({ data: { success: false } })

  const body = await c.req.json<Record<string, unknown>>()
  const data = JSON.stringify(body)

  if (data.length > 50_000) {
    return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Preferences exceed 50KB limit' } }, 400)
  }

  await c.env.DB
    .prepare(`
      INSERT INTO _user_preferences (user_id, data, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = unixepoch()
    `)
    .bind(userId, data)
    .run()

  return c.json({ data: { success: true } })
})

export default preferences
