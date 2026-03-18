# D1Table SaaS 转型规划方案

**版本：** v1.0
**日期：** 2026-03-18
**状态：** 待评审

---

## 一、产品定位

**目标用户：** AI Agent 开发者（个人为主）
**核心价值：** 为 AI Agent 设计的结构化数据存储，带可视化界面——Agent 通过 REST API 读写数据，开发者通过界面监控和管理
**技术约束：** 后端 Hono.js + Cloudflare Workers，前端 Vue 3 + Naive UI，不换框架

---

## 二、整体架构

### 双库架构

```
┌─────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                      │
│                                                         │
│  ┌──────────────────┐      ┌──────────────────────────┐ │
│  │  主控库 (CTRL_DB)  │      │  租户库 (D1 HTTP API)    │ │
│  │  users           │      │  通过 CF D1 REST API     │ │
│  │  subscriptions   │  ←→  │  动态路由到每个用户的库  │ │
│  │  api_keys        │      │  复用现有 Schema         │ │
│  │  usage_hourly    │      └──────────────────────────┘ │
│  │  webhooks        │                                   │
│  └──────────────────┘                                   │
│                                                         │
│  Better-Auth (Google OAuth)  |  Stripe Webhook          │
└─────────────────────────────────────────────────────────┘
```

### 多租户方案：Database-per-Tenant

- 每个用户注册时自动创建一个独立的 Cloudflare D1 数据库
- Paid plan 支持最多 50,000 个租户数据库
- 租户库复用现有 5 个 migration 文件（无需改动 schema）
- 主控库通过 `wrangler.toml` 静态绑定（`CTRL_DB`）
- 租户库通过 Cloudflare D1 HTTP API 动态访问

### 动态选库实现

新建 `TenantDB` 适配器类，封装 D1 HTTP API，对外暴露与 `D1Database` 兼容的接口。认证后挂载到 Hono context，所有路由从 context 取 `db` 而不是 `c.env.DB`。

---

## 三、主控库 Schema

```sql
-- 用户表
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  avatar_url     TEXT,
  google_id      TEXT UNIQUE,
  tenant_db_id   TEXT NOT NULL,
  tenant_db_name TEXT NOT NULL,
  plan           TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  db_init_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ready' | 'failed'
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 订阅表
CREATE TABLE subscriptions (
  id                   TEXT PRIMARY KEY,  -- Stripe subscription ID
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id   TEXT NOT NULL,
  stripe_price_id      TEXT NOT NULL,
  status               TEXT NOT NULL,    -- 'active' | 'canceled' | 'past_due' | 'trialing'
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- API Keys（从租户库迁移到主控库，以便路由选库）
CREATE TABLE api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'readonly',
  scope        TEXT NOT NULL DEFAULT 'all',
  is_active    INTEGER NOT NULL DEFAULT 1,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 用量统计（按小时桶聚合）
CREATE TABLE usage_hourly (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hour_ts    INTEGER NOT NULL,  -- Unix 时间戳截断到小时
  api_calls  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, hour_ts)
);

-- Webhook 配置
CREATE TABLE webhooks (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  secret       TEXT NOT NULL,
  events       TEXT NOT NULL,  -- JSON 数组: ["record.created", "record.deleted", ...]
  table_filter TEXT,           -- JSON 数组表名，null = 所有表
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## 四、认证方案

- **登录方式：** 仅 Google OAuth（不支持邮箱注册）
- **库：** Better-Auth（支持 Cloudflare Workers + D1）
- **前端：** Cookie session（替换现有 localStorage API Key）
- **Agent 访问：** 保留 `X-API-Key` 头认证，Key 存主控库
- **认证中间件统一路径：**
  1. 有 `X-API-Key` → 查主控库 `api_keys` → 得到 `user_id + tenant_db_id`
  2. 有 Cookie → Better-Auth 验证 session → 得到 `user_id + tenant_db_id`
  3. 实例化 `TenantDB`，挂载到 context

---

## 五、功能规划

### Phase 1 — 基础多用户（约 17 天）

**后端：**
- `Env` 类型新增：`CTRL_DB`、`CF_API_TOKEN`、`CF_ACCOUNT_ID`、`BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID/SECRET`、`STRIPE_SECRET_KEY`、`RESEND_API_KEY`
- 新建 `src/utils/tenant-db.ts`：TenantDB 适配器（D1 HTTP API 封装）
- 主控库 Schema + migration 脚本
- Better-Auth 集成（Google OAuth + session）
- 用户注册流程：OAuth 回调 → 创建 D1 库 → 执行初始化迁移 → 写入 users 表
- 认证中间件重写（支持双路径）
- 所有路由 `c.env.DB` → `c.get('db')`（约 35 处）

**前端：**
- `LoginPage.vue` 完全重写：Google OAuth 按钮
- `client.ts`：去掉 API Key 注入，改为 `withCredentials: true`
- 路由守卫：`hasApiKey()` → 异步 `isAuthenticated()`
- `AppLayout.vue`：新增用户头像下拉（套餐标签 / Billing 入口 / Logout）
- `Settings.vue`：Account Tab 显示用户信息

### Phase 2 — AI Agent 核心功能（约 12 天）

- **Webhook 系统：** record.created / updated / deleted / table.created / deleted；HMAC-SHA256 签名；`ctx.waitUntil` 异步投递；完整 CRUD API
- **Bulk API 扩展：** 批量 upsert（按唯一键）、批量 delete（id 数组）、批量 update
- **Python SDK：** 完整类型标注、异步客户端、Webhook 签名验证、PyPI 发布
- **TypeScript SDK：** npm 发布
- OpenAPI 文档更新

### Phase 3 — 商业化（约 12 天）

- **Stripe 集成：** Checkout Session、Customer Portal、Webhook 接收（subscription 状态同步）
- **用量统计：** 写操作异步累计到 `usage_hourly`；月度用量查询接口
- **套餐限制：** Free 月调用量 ≥ 2000 返回 429；Free 表数 ≥ 10 禁止建表
- **Billing UI：** 升级/降级、当前用量、下次结算日
- **Resend 邮件：** 用量 80% 预警、付款失败、到期提醒
- **Cron Job：** 每日清理 90 天前用量数据；重试 `db_init_status=pending` 的失败用户

### Landing Page（约 3 天）

- Hero：标题 + Google 一键登录 CTA
- 产品价值三点（API 友好 / 可视化 / 零运维）
- 代码示例（Python / TypeScript / curl）
- 定价表
- Footer

---

## 六、定价方案

| 维度 | Free | Pro ($9/月 · 年付 $79/年) |
|------|------|--------------------------|
| 月 API 调用量 | 2,000 次 | 100,000 次 |
| 超额处理 | 限流 (429) | $8/万次（按量计费）|
| 最多表数量 | 10 张 | 无限制 |
| API Keys | 3 个 | 无限制 |
| Webhook | ❌ | ✅ 最多 5 个 |
| 回收站保留 | 7 天 | 30 天 |

**API 调用量定义：** `/api/tables/**` 下成功返回 2xx 的请求计 1 次；batch 写入整体计 1 次；`/api/auth/**`、`/api/billing/**`、`/api/docs` 不计费。

---

## 七、关键风险

| 风险 | 等级 | 缓解方案 |
|------|------|---------|
| TenantDB 适配器延迟（+30-80ms/请求） | 高 | 优先使用 `batch()`；JWT 编码 tenant_db_id 避免查主控库 |
| 用户注册时 D1 库创建中断 | 中 | `db_init_status` 字段 + Cron 重试机制 |
| Better-Auth 在 Workers 上的兼容性 | 中 | `nodejs_compat` 已启用；提前做 PoC 验证 |
| 主控库查询额外延迟（+5-10ms） | 低 | JWT 编码用户信息，减少主控库查询次数 |

---

## 八、工作量总览

| Phase | 天数 | 关键产出 |
|-------|------|---------|
| Phase 1 | 17 天 | 多用户登录、数据隔离、现有功能可用 |
| Phase 2 | 12 天 | Webhook、Bulk API、SDK |
| Phase 3 | 12 天 | Stripe、用量计费、邮件通知 |
| Landing Page | 3 天 | 对外展示页面 |
| **总计** | **约 44 天** | 完整 SaaS 上线 |

### 推荐开发顺序

```
Week 1-2: Phase 1 后端（TenantDB + 主控库 + OAuth）
Week 3:   Phase 1 前端 + 端到端测试
Week 4:   Landing Page + Phase 2 Webhook
Week 5:   Phase 2 Bulk API + SDK
Week 6:   Phase 3 Stripe + 用量统计
Week 7:   Phase 3 Billing UI + 邮件 + Cron
Week 8:   全链路测试、安全审查、上线
```

**建议：** Phase 1 完成后立即邀请 5-10 名 AI Agent 开发者内测，在 Phase 2 期间根据反馈调整 API 设计，避免 SDK 发布后发现根本性问题。
