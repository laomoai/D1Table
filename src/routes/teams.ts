import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { hardDeleteMember, isValidEmail } from '../utils/members'

type AppContext = Context<{ Bindings: Env; Variables: AuthVariables }>

/** Verify current user is the Space owner (created_by). Returns error response or null. */
async function requireOwner(c: AppContext, teamId: number): Promise<Response | null> {
  const userId = c.get('userId')
  const team = await c.env.DB.prepare(
    `SELECT created_by FROM _teams WHERE id = ?`
  ).bind(teamId).first<{ created_by: number | null }>()
  if (!team || team.created_by !== userId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Only the Space owner can perform this action' } }, 403)
  }
  return null
}

const teams = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

/**
 * GET /api/teams/current
 * 获取当前团队详情 + 成员列表
 */
teams.get('/current', async (c) => {
  const teamId = c.get('teamId')
  if (!teamId) {
    return c.json({ error: { code: 'NO_TEAM', message: 'No team associated with this account' } }, 400)
  }

  const [team, members] = await Promise.all([
    c.env.DB.prepare(`SELECT id, name, created_by, created_at FROM _teams WHERE id = ?`)
      .bind(teamId).first<{ id: number; name: string; created_by: number | null; created_at: number }>(),
    c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.picture, u.role, u.status, u.last_login
       FROM _users u WHERE u.team_id = ? ORDER BY u.id ASC`
    ).bind(teamId).all<{ id: number; email: string; name: string; picture: string; role: string; status: string }>(),
  ])

  if (!team) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Team not found' } }, 404)
  }

  return c.json({
    data: {
      ...team,
      members: members.results,
    }
  })
})

/**
 * PATCH /api/teams/current
 * 重命名团队
 */
teams.patch('/current', requireWriteMiddleware, async (c) => {
  const teamId = c.get('teamId')
  if (!teamId) {
    return c.json({ error: { code: 'NO_TEAM', message: 'No team associated' } }, 400)
  }

  const ownerErr = await requireOwner(c, teamId)
  if (ownerErr) return ownerErr

  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Team name cannot be empty' } }, 400)
  }

  await c.env.DB.prepare(`UPDATE _teams SET name = ? WHERE id = ?`)
    .bind(body.name.trim(), teamId).run()

  return c.json({ data: { success: true } })
})

/**
 * POST /api/teams/current/members
 * 添加成员（输入邮箱）
 */
teams.post('/current/members', requireWriteMiddleware, async (c) => {
  const teamId = c.get('teamId')
  if (!teamId) {
    return c.json({ error: { code: 'NO_TEAM', message: 'No team associated' } }, 400)
  }

  const ownerErr = await requireOwner(c, teamId)
  if (ownerErr) return ownerErr

  const body = await c.req.json<{ email: string }>()
  const email = body.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Valid email is required' } }, 400)
  }

  // 查找现有用户
  const existingUser = await c.env.DB.prepare(
    `SELECT id, team_id FROM _users WHERE email = ? LIMIT 1`
  ).bind(email).first<{ id: number; team_id: number | null }>()

  if (existingUser) {
    if (existingUser.team_id === teamId) {
      return c.json({ error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this space' } }, 409)
    }
    return c.json({ error: { code: 'USER_EXISTS', message: `User "${email}" already belongs to another space` } }, 409)
  }

  // 用户不存在，预创建账号
  const result = await c.env.DB.prepare(
    `INSERT INTO _users (email, name, role, status, team_id) VALUES (?, ?, 'user', 'active', ?)`
  ).bind(email, email, teamId).run()

  return c.json({ data: { id: result.meta.last_row_id, email, message: 'User account created and added to space' } }, 201)
})

/**
 * DELETE /api/teams/current/members/:userId
 * 移除成员
 */
teams.delete('/current/members/:userId', requireWriteMiddleware, async (c) => {
  const teamId = c.get('teamId')
  const currentUserId = c.get('userId')
  const targetId = parseInt(c.req.param('userId'), 10)

  if (!teamId) {
    return c.json({ error: { code: 'NO_TEAM', message: 'No team associated' } }, 400)
  }

  const ownerErr = await requireOwner(c, teamId)
  if (ownerErr) return ownerErr

  // 不能移除自己（即 owner 不可被移除）
  if (targetId === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot remove yourself from the team' } }, 400)
  }

  // owner 不可被移除（防止通过 API 直接调用绕过前端）
  const team = await c.env.DB.prepare(
    `SELECT created_by FROM _teams WHERE id = ?`
  ).bind(teamId).first<{ created_by: number | null }>()
  if (team && team.created_by === targetId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot remove the Space owner' } }, 400)
  }

  // 验证目标用户属于当前团队
  const targetUser = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE id = ? AND team_id = ?`
  ).bind(targetId, teamId).first()

  if (!targetUser) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found in this team' } }, 404)
  }

  await hardDeleteMember(c.env.DB, targetId)

  return c.json({ data: { success: true } })
})

export default teams
