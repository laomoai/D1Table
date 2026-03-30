import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireAdminMiddleware } from '../middleware/auth'
import { hardDeleteMember, hardDeleteSpace, isValidEmail } from '../utils/members'

const administration = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

administration.use('*', requireAdminMiddleware)

/**
 * GET /api/admin/spaces
 * List all Spaces with summary stats
 */
administration.get('/spaces', async (c) => {
  const teams = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.created_by, t.created_at, u.email as owner_email
     FROM _teams t
     LEFT JOIN _users u ON u.id = t.created_by
     ORDER BY t.id ASC`
  ).all<{ id: number; name: string; created_by: number | null; created_at: number; owner_email: string | null }>()

  const teamIds = teams.results.map(t => t.id)
  if (teamIds.length === 0) return c.json({ data: [] })

  const placeholders = teamIds.map(() => '?').join(',')

  const [memberCounts, tableCounts, noteCounts] = await Promise.all([
    c.env.DB.prepare(
      `SELECT team_id, COUNT(*) as count FROM _users WHERE team_id IN (${placeholders}) GROUP BY team_id`
    ).bind(...teamIds).all<{ team_id: number; count: number }>(),
    c.env.DB.prepare(
      `SELECT team_id, COUNT(*) as count FROM _meta WHERE team_id IN (${placeholders}) GROUP BY team_id`
    ).bind(...teamIds).all<{ team_id: number; count: number }>(),
    c.env.DB.prepare(
      `SELECT team_id, COUNT(*) as count FROM _notes WHERE team_id IN (${placeholders}) AND deleted_at IS NULL AND archived_at IS NULL GROUP BY team_id`
    ).bind(...teamIds).all<{ team_id: number; count: number }>(),
  ])

  const memberMap = new Map(memberCounts.results.map(r => [r.team_id, r.count]))
  const tableMap = new Map(tableCounts.results.map(r => [r.team_id, r.count]))
  const noteMap = new Map(noteCounts.results.map(r => [r.team_id, r.count]))

  const data = teams.results.map(t => ({
    id: t.id,
    name: t.name,
    created_by: t.created_by,
    created_at: t.created_at,
    owner_email: t.owner_email,
    member_count: memberMap.get(t.id) ?? 0,
    table_count: tableMap.get(t.id) ?? 0,
    note_count: noteMap.get(t.id) ?? 0,
  }))

  return c.json({ data })
})

/**
 * POST /api/admin/spaces
 * Create a new Space with an owner
 */
administration.post('/spaces', async (c) => {
  const body = await c.req.json<{ name: string; owner_email: string }>()
  const name = body.name?.trim()
  const ownerEmail = body.owner_email?.trim().toLowerCase()

  if (!name) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Space name is required' } }, 400)
  }
  if (!ownerEmail || !isValidEmail(ownerEmail)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid owner email is required' } }, 400)
  }

  const existing = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE email = ? LIMIT 1`
  ).bind(ownerEmail).first()
  if (existing) {
    return c.json({ error: { code: 'USER_EXISTS', message: `User "${ownerEmail}" already exists in the system` } }, 409)
  }

  // Step 1: create team (created_by is NULL initially due to circular reference)
  const teamResult = await c.env.DB.prepare(
    `INSERT INTO _teams (name) VALUES (?)`
  ).bind(name).run()
  const teamId = teamResult.meta.last_row_id

  try {
    // Step 2: create owner user
    const userResult = await c.env.DB.prepare(
      `INSERT INTO _users (email, name, role, status, team_id) VALUES (?, ?, 'user', 'active', ?)`
    ).bind(ownerEmail, ownerEmail, teamId).run()
    const userId = userResult.meta.last_row_id

    // Step 3: backfill created_by
    await c.env.DB.prepare(
      `UPDATE _teams SET created_by = ? WHERE id = ?`
    ).bind(userId, teamId).run()

    return c.json({
      data: { id: teamId, name, owner_email: ownerEmail, owner_id: userId }
    }, 201)
  } catch (err) {
    // Rollback: delete orphaned team
    await c.env.DB.prepare(`DELETE FROM _teams WHERE id = ?`).bind(teamId).run()
    throw err
  }
})

/**
 * GET /api/admin/spaces/:id
 * Space detail with member list
 */
administration.get('/spaces/:id', async (c) => {
  const spaceId = parseInt(c.req.param('id'), 10)

  const [team, members] = await Promise.all([
    c.env.DB.prepare(
      `SELECT t.id, t.name, t.created_by, t.created_at, u.email as owner_email
       FROM _teams t LEFT JOIN _users u ON u.id = t.created_by
       WHERE t.id = ?`
    ).bind(spaceId).first<{ id: number; name: string; created_by: number | null; created_at: number; owner_email: string | null }>(),
    c.env.DB.prepare(
      `SELECT id, email, name, picture, role, status, last_login FROM _users WHERE team_id = ? ORDER BY id ASC`
    ).bind(spaceId).all<{ id: number; email: string; name: string; picture: string; role: string; status: string }>(),
  ])

  if (!team) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Space not found' } }, 404)
  }

  return c.json({ data: { ...team, members: members.results } })
})

/**
 * PATCH /api/admin/spaces/:id
 * Rename a Space
 */
administration.patch('/spaces/:id', async (c) => {
  const spaceId = parseInt(c.req.param('id'), 10)
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()

  if (!name) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Space name cannot be empty' } }, 400)
  }

  const result = await c.env.DB.prepare(
    `UPDATE _teams SET name = ? WHERE id = ?`
  ).bind(name, spaceId).run()

  if (result.meta.changes === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Space not found' } }, 404)
  }

  return c.json({ data: { success: true } })
})

/**
 * POST /api/admin/spaces/:id/members
 * Add a new member to a Space (email must not exist in system)
 */
administration.post('/spaces/:id/members', async (c) => {
  const spaceId = parseInt(c.req.param('id'), 10)
  const body = await c.req.json<{ email: string }>()
  const email = body.email?.trim().toLowerCase()

  if (!email || !isValidEmail(email)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid email is required' } }, 400)
  }

  // Verify space exists
  const team = await c.env.DB.prepare(
    `SELECT id FROM _teams WHERE id = ?`
  ).bind(spaceId).first()
  if (!team) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Space not found' } }, 404)
  }

  // Email must be new
  const existing = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE email = ? LIMIT 1`
  ).bind(email).first()
  if (existing) {
    return c.json({ error: { code: 'USER_EXISTS', message: `User "${email}" already belongs to another space` } }, 409)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO _users (email, name, role, status, team_id) VALUES (?, ?, 'user', 'active', ?)`
  ).bind(email, email, spaceId).run()

  return c.json({ data: { id: result.meta.last_row_id, email } }, 201)
})

/**
 * DELETE /api/admin/spaces/:id/members/:userId
 * Remove a member from a Space (hard delete). Owner cannot be removed.
 */
administration.delete('/spaces/:id/members/:userId', async (c) => {
  const spaceId = parseInt(c.req.param('id'), 10)
  const targetId = parseInt(c.req.param('userId'), 10)

  // Verify space exists and check owner
  const team = await c.env.DB.prepare(
    `SELECT id, created_by FROM _teams WHERE id = ?`
  ).bind(spaceId).first<{ id: number; created_by: number | null }>()
  if (!team) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Space not found' } }, 404)
  }

  if (team.created_by === targetId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot remove the Space owner' } }, 400)
  }

  // Verify target user belongs to this space
  const targetUser = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE id = ? AND team_id = ?`
  ).bind(targetId, spaceId).first()
  if (!targetUser) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found in this space' } }, 404)
  }

  await hardDeleteMember(c.env.DB, targetId)

  return c.json({ data: { success: true } })
})

/**
 * DELETE /api/admin/spaces/:id
 * Delete a Space and all its data. Requires confirmation (body.confirm_name must match space name).
 */
administration.post('/spaces/:id/delete', async (c) => {
  const spaceId = parseInt(c.req.param('id'), 10)
  const body = await c.req.json<{ confirm_name: string }>()

  if (!body.confirm_name) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'confirm_name is required' } }, 400)
  }

  const team = await c.env.DB.prepare(
    `SELECT id, name FROM _teams WHERE id = ?`
  ).bind(spaceId).first<{ id: number; name: string }>()
  if (!team) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Space not found' } }, 404)
  }

  if (body.confirm_name !== team.name) {
    return c.json({ error: { code: 'CONFIRMATION_FAILED', message: 'Space name does not match. Please type the exact space name to confirm deletion.' } }, 400)
  }

  try {
    await hardDeleteSpace(c.env.DB, spaceId)
  } catch (err) {
    return c.json({ error: { code: 'DELETE_FAILED', message: (err as Error).message } }, 500)
  }

  return c.json({ data: { success: true } })
})

export default administration
