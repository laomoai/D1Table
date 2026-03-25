import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'

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
      `SELECT u.id, u.email, u.name, u.picture, u.role, u.status
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

  const body = await c.req.json<{ email: string }>()
  if (!body.email?.trim()) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'Email is required' } }, 400)
  }

  const email = body.email.trim().toLowerCase()

  // 查找现有用户
  const existingUser = await c.env.DB.prepare(
    `SELECT id, team_id FROM _users WHERE email = ? LIMIT 1`
  ).bind(email).first<{ id: number; team_id: number | null }>()

  if (existingUser) {
    if (existingUser.team_id === teamId) {
      return c.json({ error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this team' } }, 409)
    }
    // 更新用户的 team_id，同步更新其 API key 的 team_id
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE _users SET team_id = ? WHERE id = ?`)
        .bind(teamId, existingUser.id),
      c.env.DB.prepare(`UPDATE _api_keys SET team_id = ? WHERE user_id = ?`)
        .bind(teamId, existingUser.id),
    ])

    return c.json({ data: { id: existingUser.id, email, message: 'User added to team' } })
  }

  // 用户不存在，预创建账号
  const result = await c.env.DB.prepare(
    `INSERT INTO _users (email, name, role, status, team_id) VALUES (?, ?, 'user', 'active', ?)`
  ).bind(email, email, teamId).run()

  return c.json({ data: { id: result.meta.last_row_id, email, message: 'User account created and added to team' } }, 201)
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

  // 不能移除自己
  if (targetId === currentUserId) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Cannot remove yourself from the team' } }, 400)
  }

  // 验证目标用户属于当前团队
  const targetUser = await c.env.DB.prepare(
    `SELECT id FROM _users WHERE id = ? AND team_id = ?`
  ).bind(targetId, teamId).first()

  if (!targetUser) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found in this team' } }, 404)
  }

  // 为被移除的用户创建个人团队
  const teamResult = await c.env.DB.prepare(
    `INSERT INTO _teams (name, created_by) VALUES (?, ?)`
  ).bind('My Team', targetId).run()

  // 将用户和其 API key 移到个人团队
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE _users SET team_id = ? WHERE id = ?`)
      .bind(teamResult.meta.last_row_id, targetId),
    c.env.DB.prepare(`UPDATE _api_keys SET team_id = ? WHERE user_id = ?`)
      .bind(teamResult.meta.last_row_id, targetId),
  ])

  return c.json({ data: { success: true } })
})

export default teams
