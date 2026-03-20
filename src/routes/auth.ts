import { Hono } from 'hono'
import type { Env, AuthVariables, SessionUser } from '../types'
import {
  generateState, createSessionCookie, clearSessionCookie,
  verifySession, createStateCookie, getStateCookie
} from '../utils/session'

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// GET /login — 发起 Google OAuth 流程
auth.get('/login', (c) => {
  const state = generateState()
  const origin = new URL(c.req.url).origin
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  })
  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return new Response(null, {
    status: 302,
    headers: {
      'Location': googleUrl,
      'Set-Cookie': createStateCookie(state),
    },
  })
})

// GET /callback — 处理 Google OAuth 回调
auth.get('/callback', async (c) => {
  const { code, state, error } = c.req.query() as Record<string, string>

  // 1. OAuth 错误
  if (error) {
    return c.redirect('/login?error=oauth_failed')
  }

  // 2. 验证 CSRF state
  const cookieHeader = c.req.header('Cookie') ?? ''
  const savedState = getStateCookie(cookieHeader)
  if (!savedState || savedState !== state) {
    return c.redirect('/login?error=invalid_state')
  }

  const origin = new URL(c.req.url).origin

  // 3. 向 Google 交换 token
  let accessToken: string
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: 'authorization_code',
      }).toString(),
    })
    if (!tokenResp.ok) {
      return c.redirect('/login?error=token_exchange_failed')
    }
    const tokenData = await tokenResp.json<{ access_token: string }>()
    accessToken = tokenData.access_token
  } catch {
    return c.redirect('/login?error=token_exchange_failed')
  }

  // 4. 获取用户信息
  let userInfo: { email: string; name: string; picture: string }
  try {
    const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!userResp.ok) {
      return c.redirect('/login?error=userinfo_failed')
    }
    userInfo = await userResp.json<{ email: string; name: string; picture: string }>()
  } catch {
    return c.redirect('/login?error=userinfo_failed')
  }

  // 5. 检查 _users 表
  const existingUser = await c.env.DB.prepare(
    `SELECT id, status FROM _users WHERE email = ? LIMIT 1`
  ).bind(userInfo.email).first<{ id: number; status: string }>()

  if (existingUser) {
    // 用户已存在
    if (existingUser.status === 'disabled') {
      return c.redirect('/login?error=account_disabled')
    }
    // 更新 last_login、name、picture
    await c.env.DB.prepare(
      `UPDATE _users SET last_login = unixepoch(), name = ?, picture = ? WHERE id = ?`
    ).bind(userInfo.name, userInfo.picture, existingUser.id).run()
  } else {
    // 用户不存在，检查是否为引导模式（_users 表空）
    const userCount = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM _users`
    ).first<{ cnt: number }>()

    if (userCount && userCount.cnt === 0) {
      // 引导模式：用 ALLOWED_EMAILS 验证，首个用户成为 admin
      const allowedEmails = (c.env.ALLOWED_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
      if (allowedEmails.length > 0 && !allowedEmails.includes(userInfo.email)) {
        return c.redirect('/login?error=unauthorized_email')
      }
      // 创建为 admin
      await c.env.DB.prepare(
        `INSERT INTO _users (email, name, picture, role, last_login) VALUES (?, ?, ?, 'admin', unixepoch())`
      ).bind(userInfo.email, userInfo.name, userInfo.picture).run()
    } else {
      // _users 表非空，但该邮箱不在其中 → 拒绝
      return c.redirect('/login?error=unauthorized_email')
    }
  }

  // 6. 生成 session cookie
  const user: SessionUser = { email: userInfo.email, name: userInfo.name, picture: userInfo.picture }
  const isSecure = c.env.ENVIRONMENT === 'production'
  const sessionCookie = await createSessionCookie(user, c.env.SESSION_SECRET, isSecure)

  // 7. 清除 state cookie，设置 session cookie，重定向到首页
  const response = new Response(null, {
    status: 302,
    headers: { 'Location': '/' },
  })
  response.headers.append('Set-Cookie', 'd1t_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
  response.headers.append('Set-Cookie', sessionCookie)
  return response
})

// POST /logout — 清除 session cookie
auth.post('/logout', (c) => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  })
})

// GET /me — 返回当前登录用户信息（含 id 和 role）
auth.get('/me', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  if (!cookieHeader) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401)
  }

  const user = await verifySession(cookieHeader, c.env.SESSION_SECRET)
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401)
  }

  const userRow = await c.env.DB.prepare(
    `SELECT id, role, status FROM _users WHERE email = ? LIMIT 1`
  ).bind(user.email).first<{ id: number; role: string; status: string }>()

  if (!userRow || userRow.status !== 'active') {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'User account not found or disabled' } }, 401)
  }

  return c.json({ data: { id: userRow.id, email: user.email, name: user.name, picture: user.picture, role: userRow.role } })
})

export default auth
