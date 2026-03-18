# Google OAuth 登录改造技术方案

**版本：** v1.0
**日期：** 2026-03-18
**状态：** 待评审

---

## 一、目标与范围

### 目标
将现有的 API Key 登录（ADMIN_KEY 输入框）替换为 Google OAuth 登录，通过环境变量白名单控制允许登录的邮箱。

### 不在范围内
- 多用户 / 多租户
- Stripe 计费
- 用户注册流程
- 邮件通知

### 保持不变
- AI Agent 的 `X-API-Key` 访问方式完全不动
- 所有业务路由逻辑不变
- 前端表格、字段、记录等功能页面不变

---

## 二、新增环境变量

| 变量名 | 设置方式 | 说明 |
|--------|---------|------|
| `GOOGLE_CLIENT_ID` | `wrangler secret put` | Google OAuth 应用 Client ID |
| `GOOGLE_CLIENT_SECRET` | `wrangler secret put` | Google OAuth 应用 Client Secret |
| `SESSION_SECRET` | `wrangler secret put` | Cookie HMAC 签名密钥，随机 32+ 字符 |
| `ALLOWED_EMAILS` | `wrangler secret put` | 逗号分隔的允许登录邮箱，如 `a@gmail.com,b@gmail.com` |

**Google Cloud Console 需要配置的回调 URL：**
- 生产：`https://d1table.lemoai.xyz/api/auth/callback`
- 本地：`http://localhost:8787/api/auth/callback`

---

## 三、认证架构

### 3.1 认证流程

```
Browser                    Worker                      Google
  │                           │                           │
  │── GET /api/auth/login ───>│                           │
  │                           │── 生成 state，写临时      │
  │                           │   cookie，重定向 ─────────>│
  │<── 302 redirect ──────────│                           │
  │                           │                           │
  │── 用户授权 ────────────────────────────────────────────>│
  │<── 302 /api/auth/callback?code=...&state=... ─────────│
  │                           │                           │
  │── GET /api/auth/callback ->│                           │
  │                           │── POST /token ────────────>│
  │                           │<── access_token ──────────│
  │                           │── GET /userinfo ───────────>│
  │                           │<── {email, name, picture} │
  │                           │                           │
  │                           │ 校验 state（防 CSRF）
  │                           │ 校验 email 在 ALLOWED_EMAILS
  │                           │ 生成 signed session cookie
  │                           │
  │<── 302 / (带 Set-Cookie) ──│
  │                           │
  │── 后续所有请求带 Cookie ───>│
  │                           │ 验证 cookie 签名 + 有效期
  │<── 正常响应 ───────────────│
```

### 3.2 双路认证（保持向后兼容）

认证中间件按优先级处理：

```
请求到达
  ├── 有 session cookie？
  │     ├── 验证签名有效 + 未过期 + email 在白名单
  │     │     └── ✅ 通过：keyType=readwrite, keyScope=all, allowedTables=null
  │     └── 无效 → 继续检查 API Key
  │
  └── 有 X-API-Key / ?api_key=？
        └── 现有逻辑（不变）
              ├── 匹配 ADMIN_KEY → ✅ 通过
              ├── 查 _api_keys 表 → ✅ 通过
              └── 都不匹配 → 401
```

---

## 四、后端实现

### 4.1 Session Cookie 格式

不使用第三方库，完全基于 Web Crypto API（Workers 原生支持）。

**Cookie 参数：**
```
Name:     d1t_session
Value:    <payload_b64url>.<signature_b64url>
Path:     /
HttpOnly: true
Secure:   true（生产）/ false（本地开发）
SameSite: Lax
Max-Age:  2592000（30 天）
```

**Payload 结构（base64url 编码的 JSON）：**
```json
{
  "email": "user@gmail.com",
  "name": "User Name",
  "picture": "https://lh3.googleusercontent.com/...",
  "exp": 1742000000
}
```

**签名算法：** HMAC-SHA256(payload_b64url, SESSION_SECRET)

**验证步骤：**
1. 按最后一个 `.` 拆分为 `payload` 和 `sig`
2. 用 SESSION_SECRET 重新计算 HMAC，与 `sig` 做恒等时间比较（防时序攻击）
3. base64url 解码 payload，检查 `exp > Date.now()/1000`
4. 检查 `email` 在 `ALLOWED_EMAILS` 列表中

**State Cookie（CSRF 防护）：**
```
Name:     d1t_oauth_state
Value:    随机 16 字节的 hex 字符串
Max-Age:  300（5 分钟）
HttpOnly: true
SameSite: Lax
```

### 4.2 新增文件：`src/utils/session.ts`

负责：
- `createSessionCookie(user, secret, isSecure)` → Set-Cookie 头字符串
- `verifySession(cookieHeader, secret, allowedEmails)` → `SessionUser | null`
- `clearSessionCookie()` → 过期 Set-Cookie 头字符串
- `generateState()` → 随机 hex state 字符串
- 内部 HMAC 签名/验证工具函数

### 4.3 新增文件：`src/routes/auth.ts`

挂载路径：`/api/auth`（**不经过 authMiddleware**）

| 路由 | 说明 |
|------|------|
| `GET /api/auth/login` | 生成 state，写临时 cookie，重定向到 Google OAuth URL |
| `GET /api/auth/callback` | 交换 code，验证 state，校验邮箱，写 session cookie，重定向到 `/` |
| `POST /api/auth/logout` | 清除 session cookie，返回 200 |
| `GET /api/auth/me` | 验证 session，返回 `{email, name, picture}` 或 401 |

**`/api/auth/callback` 错误处理：**
- state 不匹配 → 重定向到 `/login?error=invalid_state`
- email 不在白名单 → 重定向到 `/login?error=unauthorized_email`
- Google API 失败 → 重定向到 `/login?error=oauth_failed`

### 4.4 修改：`src/types.ts`

新增到 `Env`：
```typescript
GOOGLE_CLIENT_ID: string
GOOGLE_CLIENT_SECRET: string
SESSION_SECRET: string
ALLOWED_EMAILS: string  // 逗号分隔
```

新增类型：
```typescript
export type SessionUser = {
  email: string
  name: string
  picture: string
}

// AuthVariables 新增可选字段
export type AuthVariables = {
  keyType: 'readonly' | 'readwrite'
  keyScope: 'all' | 'groups'
  allowedTables: string[] | null
  user?: SessionUser  // session 登录时设置，API Key 登录时为空
}
```

### 4.5 修改：`src/middleware/auth.ts`

在现有 API Key 逻辑前插入 session cookie 校验：

```typescript
// 1. 尝试 session cookie
const cookieHeader = c.req.header('Cookie')
if (cookieHeader) {
  const allowedEmails = c.env.ALLOWED_EMAILS.split(',').map(e => e.trim())
  const user = await verifySession(cookieHeader, c.env.SESSION_SECRET, allowedEmails)
  if (user) {
    c.set('keyType', 'readwrite')
    c.set('keyScope', 'all')
    c.set('allowedTables', null)
    c.set('user', user)
    return next()
  }
}

// 2. 现有 API Key 逻辑（完全不变）
const apiKey = c.req.header('X-API-Key') ?? c.req.query('api_key')
// ... 原有代码 ...
```

### 4.6 修改：`src/index.ts`

1. 在 authMiddleware 之前挂载 auth 路由（`/api/auth` 不需要认证）
2. CORS 中补充 PUT 方法（如缺）

```typescript
// auth 路由无需认证，在 authMiddleware 之前注册
app.route('/api/auth', authRouter)

// 以下保持不变
app.use('/api/*', authMiddleware)
// ...
```

---

## 五、前端实现

### 5.1 修改：`web/src/api/client.ts`

1. Axios 实例添加 `withCredentials: true`
2. 删除请求拦截器中的 `X-API-Key` 注入逻辑
3. 删除 `saveApiKey`、`hasApiKey`、`getApiKey` 函数
4. 新增 `getCurrentUser()` → `GET /api/auth/me`，返回 `SessionUser | null`
5. 保留所有业务 API 方法（不变）

**注意：** Settings 页面的 API Key 管理（`api.getKeys()`、`api.createKey()` 等）改为依赖 session cookie 认证，接口本身不变。

### 5.2 修改：`web/src/router/index.ts`

将同步的 `hasApiKey()` 改为异步身份校验：

```typescript
// 用模块级缓存避免每次路由跳转都发请求
let authCache: { authed: boolean; checked: boolean } = { authed: false, checked: false }

router.beforeEach(async (to) => {
  if (!authCache.checked) {
    try {
      await api.getCurrentUser()
      authCache = { authed: true, checked: true }
    } catch {
      authCache = { authed: false, checked: true }
    }
  }
  if (!authCache.authed && !to.meta.guest) return '/login'
  if (authCache.authed && to.path === '/login') return '/'
})
```

**缓存失效时机：** 用户退出登录时重置 `authCache`。

### 5.3 重写：`web/src/pages/LoginPage.vue`

- 删除 API Key 输入表单、帮助折叠面板
- 添加 Google 登录按钮（`<a href="/api/auth/login">`，非 axios 请求，触发完整页面跳转）
- 读取 URL 中的 `?error=` 参数展示错误信息：
  - `unauthorized_email` → "此 Google 账号没有访问权限"
  - `invalid_state` → "登录失败，请重试"
  - `oauth_failed` → "Google 服务异常，请重试"
- 保留现有品牌样式（logo、颜色、卡片）

### 5.4 修改：`web/src/components/AppLayout.vue`

在 `sidebar-footer` 区域替换原有 Settings 按钮：

1. 应用加载时调用 `getCurrentUser()` 获取用户信息
2. 展示用户头像（Google picture URL）+ 邮箱（截断显示）
3. 头像点击弹出下拉菜单：
   - Settings（跳转 `/settings`）
   - Logout（调用 `POST /api/auth/logout` → 清空 authCache → 跳转 `/login`）

---

## 六、本地开发配置

**`.dev.vars` 新增（不提交 git）：**
```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=replace_with_32_char_random_string
ALLOWED_EMAILS=your@gmail.com
```

**Google Cloud Console 配置步骤：**
1. 前往 https://console.cloud.google.com → APIs & Services → Credentials
2. 创建 OAuth 2.0 Client ID（Web application 类型）
3. Authorized redirect URIs 添加：
   - `https://d1table.lemoai.xyz/api/auth/callback`
   - `http://localhost:8787/api/auth/callback`
4. 复制 Client ID 和 Client Secret 到 `.dev.vars` 和 `wrangler secret put`

---

## 七、安全考量

| 风险 | 缓解方案 |
|------|---------|
| CSRF 攻击 | OAuth state 参数 + SameSite=Lax cookie |
| Session 伪造 | HMAC-SHA256 签名，SESSION_SECRET 通过 wrangler secret 管理 |
| Session 重放 | `exp` 字段 30 天有效期 |
| 邮箱枚举 | callback 错误统一重定向，不暴露具体原因（仅前端显示提示） |
| 时序攻击 | HMAC 比对使用 `crypto.subtle.verify`（恒等时间） |
| ADMIN_KEY 保留 | 保留 ADMIN_KEY 作为紧急 API 访问后门，不暴露在前端 |

---

## 八、任务拆分

### Task 1：后端 - 基础类型和工具函数
**文件：** `src/types.ts`、`src/utils/session.ts`
- 更新 `Env` 类型（4 个新变量）
- 更新 `AuthVariables` 类型（新增 `user?`）
- 新增 `SessionUser` 类型
- 实现 session 签名/验证工具函数（HMAC-SHA256）
- 实现 state 生成函数

**预估：** 2 小时

---

### Task 2：后端 - Auth 路由
**文件：** `src/routes/auth.ts`（新建）
- `GET /api/auth/login`
- `GET /api/auth/callback`（含 Google token 交换、userinfo 获取）
- `POST /api/auth/logout`
- `GET /api/auth/me`

**预估：** 3 小时

---

### Task 3：后端 - 认证中间件更新
**文件：** `src/middleware/auth.ts`
- 在 API Key 逻辑前插入 session cookie 校验
- 现有 API Key 逻辑保持不变

**预估：** 1 小时

---

### Task 4：后端 - 入口挂载
**文件：** `src/index.ts`、`wrangler.toml`
- 注册 `/api/auth` 路由（在 authMiddleware 之前）
- `wrangler.toml` 注释说明新增的 secret 变量

**预估：** 30 分钟

---

### Task 5：前端 - API Client 更新
**文件：** `web/src/api/client.ts`
- 添加 `withCredentials: true`
- 删除 API Key 注入拦截器
- 删除 `saveApiKey`、`hasApiKey`、`getApiKey`
- 新增 `getCurrentUser()`

**预估：** 1 小时

---

### Task 6：前端 - 路由守卫更新
**文件：** `web/src/router/index.ts`
- 异步 `getCurrentUser()` 替换 `hasApiKey()`
- 模块级 authCache 避免重复请求

**预估：** 1 小时

---

### Task 7：前端 - 登录页重写
**文件：** `web/src/pages/LoginPage.vue`
- 删除 API Key 表单
- Google 登录按钮
- 错误信息展示（读 URL query）

**预估：** 1.5 小时

---

### Task 8：前端 - AppLayout 用户信息
**文件：** `web/src/components/AppLayout.vue`
- 获取并展示用户头像 + 邮箱
- 下拉菜单（Settings / Logout）
- 退出登录逻辑

**预估：** 2 小时

---

### Task 9：本地测试 + 修 bug
- 配置 `.dev.vars`
- 端到端测试完整登录流程
- 测试 API Key 访问不受影响
- 测试邮箱白名单拦截

**预估：** 2 小时

---

### Task 10：部署
- `wrangler secret put` 设置 4 个新变量
- `npm run deploy`
- 生产验证

**预估：** 30 分钟

---

## 九、总工作量

| Task | 预估时间 |
|------|---------|
| T1 类型 + session 工具 | 2h |
| T2 Auth 路由 | 3h |
| T3 中间件更新 | 1h |
| T4 入口挂载 | 0.5h |
| T5 前端 API Client | 1h |
| T6 路由守卫 | 1h |
| T7 登录页 | 1.5h |
| T8 AppLayout | 2h |
| T9 测试 | 2h |
| T10 部署 | 0.5h |
| **合计** | **约 14.5 小时** |

---

## 十、执行顺序

```
T1 → T2 → T3 → T4   （后端，顺序执行）
              ↓
T5 → T6 → T7 → T8   （前端，顺序执行）
              ↓
           T9 → T10
```

T1-T4 和 T5-T8 可以并行开发（前后端独立），但 T9 需要两者都完成。
