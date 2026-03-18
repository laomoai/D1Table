# D1Table 技术设计文档

> 基于 Cloudflare D1 的轻量数据管理系统，参考 NocoDB 功能设计，提供中文界面与 REST API。

---

## 一、项目目标

| 目标 | 说明 |
|---|---|
| 数据管理 UI | 类 NocoDB 的表格视图，支持增删改查、筛选、排序 |
| REST API | 标准化接口，供 AI Agent 调用 |
| OpenAPI 文档 | 自动生成，AI Agent 可读取 spec 了解可用操作 |
| 成本最优 | 在 Cloudflare 免费/低成本额度内运行 |
| 全边缘部署 | 100% 运行在 Cloudflare 网络，无需独立服务器 |

---

## 二、技术栈

### 后端
| 组件 | 选型 | 理由 |
|---|---|---|
| 运行时 | Cloudflare Workers | 边缘计算，零冷启动，免费额度充足 |
| Web 框架 | Hono | 专为 Workers 设计，轻量，内置 OpenAPI 支持 |
| ORM | Drizzle ORM | 原生支持 D1，类型安全，迁移管理 |
| API 规范 | @hono/zod-openapi | 自动生成 OpenAPI 3.0 spec |
| 数据库 | Cloudflare D1 | 边缘 SQLite，按行计费 |

### 前端
| 组件 | 选型 | 理由 |
|---|---|---|
| 托管 | Cloudflare Pages | 静态托管免费，与 Workers 同网络 |
| 框架 | Vue 3 + Vite | 轻量，组合式 API，生态成熟 |
| 表格组件 | TanStack Table | 虚拟滚动，高性能，支持大数据集 |
| 请求管理 | TanStack Query | 自动缓存、分页状态、请求去重 |
| UI 组件库 | naive-ui | 中文友好，组件完整 |

### 工具链
| 工具 | 用途 |
|---|---|
| drizzle-kit | Schema 迁移管理 |
| wrangler | Cloudflare 部署工具 |
| Zod | 输入校验 + OpenAPI schema 生成 |

---

## 三、系统架构

```
┌─────────────────────────────────────────────────────┐
│                  用户浏览器 / AI Agent               │
└──────────────┬──────────────────┬───────────────────┘
               │ 管理界面          │ REST API
               ▼                  ▼
┌──────────────────────────────────────────────────────┐
│              Cloudflare 边缘网络                      │
│                                                      │
│  ┌─────────────────────┐   ┌──────────────────────┐  │
│  │  Cloudflare Pages   │   │  Cloudflare Workers  │  │
│  │  (Vue 3 前端)        │   │  (Hono API 服务)     │  │
│  └─────────────────────┘   └──────────┬───────────┘  │
│                                       │              │
│                             ┌─────────▼──────────┐   │
│                             │   Cache API (免费)  │   │
│                             └─────────┬──────────┘   │
│                                       │ cache miss   │
│                             ┌─────────▼──────────┐   │
│                             │   Cloudflare D1    │   │
│                             │   (SQLite 数据库)   │   │
│                             └────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

---

## 四、目录结构

```
D1Table/
├── docs/                          # 文档
│   ├── tech-design.md             # 本文件
│   └── task-plan.md               # 任务计划
│
├── apps/
│   ├── worker/                    # Cloudflare Workers 后端
│   │   ├── src/
│   │   │   ├── index.ts           # 入口，注册路由
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # Drizzle schema 定义
│   │   │   │   └── migrations/    # SQL 迁移文件
│   │   │   ├── routes/
│   │   │   │   ├── tables.ts      # 元数据：表结构管理
│   │   │   │   ├── records.ts     # 数据 CRUD
│   │   │   │   └── openapi.ts     # OpenAPI spec 输出
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts        # API Key 校验
│   │   │   │   └── cache.ts       # Cache API 中间件
│   │   │   └── utils/
│   │   │       └── query-builder.ts  # 动态 SQL 构建
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── web/                       # Cloudflare Pages 前端
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── pages/
│       │   │   ├── TableList.vue  # 表列表页
│       │   │   ├── TableView.vue  # 表格数据视图
│       │   │   └── Settings.vue   # 系统设置
│       │   ├── components/
│       │   │   ├── DataGrid.vue   # 核心表格组件
│       │   │   ├── FilterBar.vue  # 筛选条件
│       │   │   └── RecordForm.vue # 新增/编辑记录弹窗
│       │   └── api/
│       │       └── client.ts      # API 请求封装
│       ├── vite.config.ts
│       └── package.json
│
└── package.json                   # monorepo 根配置
```

---

## 五、API 设计

### 5.1 认证

所有 API 通过 `X-API-Key` 请求头认证，支持两种权限级别：

| Key 类型 | 权限 | 适用场景 |
|---|---|---|
| `readonly_*` | 仅 GET 请求 | AI Agent 查询、数据分析 |
| `readwrite_*` | 全部操作 | 管理界面、可信 Agent |

### 5.2 接口列表

#### 元数据接口
```
GET  /api/tables                    # 获取所有表列表
GET  /api/tables/:tableName         # 获取表结构（字段定义）
```

#### 数据 CRUD 接口
```
GET    /api/tables/:tableName/records           # 查询记录（分页）
GET    /api/tables/:tableName/records/:id       # 查询单条记录
POST   /api/tables/:tableName/records           # 新增记录
PATCH  /api/tables/:tableName/records/:id       # 更新记录
DELETE /api/tables/:tableName/records/:id       # 删除记录
POST   /api/tables/:tableName/records/batch     # 批量新增
```

#### 查询参数
```
GET /api/tables/orders/records
  ?page_size=20          # 每页条数（默认20，最大100）
  &cursor=               # keyset 分页游标（上一页最后一条 id）
  &filter[status]=active # 字段筛选
  &filter[amount_gt]=100 # 范围筛选（gt/gte/lt/lte/like）
  &sort=created_at:desc  # 排序
  &fields=id,name,status # 只返回指定字段
```

#### 系统接口
```
GET  /api/openapi.json              # OpenAPI 3.0 spec（供 AI Agent 读取）
GET  /api/health                    # 健康检查
```

### 5.3 响应格式

```json
// 列表响应
{
  "data": [...],
  "meta": {
    "total": null,        // 不做 COUNT(*)，避免全表扫描
    "page_size": 20,
    "next_cursor": "1234" // 下一页游标
  }
}

// 单条响应
{
  "data": { ... }
}

// 错误响应
{
  "error": {
    "code": "RECORD_NOT_FOUND",
    "message": "记录不存在"
  }
}
```

> **为何不返回 total：** COUNT(*) 会全表扫描，100万行 = 消耗100万行读取额度。
> 改用游标分页，total 通过维护计数表获取（仅读1行）。

---

## 六、成本控制策略

### 6.1 D1 行读取优化（最关键）

**核心原则：D1 按实际扫描行数计费，不是按查询次数。**

| 策略 | 实现方式 | 节省效果 |
|---|---|---|
| 强制分页 | 所有列表接口默认 `LIMIT 20`，最大 `LIMIT 100` | 单次读取从全表降到20行 |
| keyset 分页 | 用 `WHERE id > :cursor` 代替 `OFFSET` | OFFSET N 会扫描前 N 行，keyset 不会 |
| 必须建索引 | 筛选字段全部建索引 | 避免全表扫描 |
| Cache API | GET 请求缓存60秒 | 缓存命中率50%时，读取量减半 |
| 禁止 SELECT * | 强制指定字段列表 | 减少数据传输，降低 CPU time |
| 计数表替代 COUNT | 维护 `_meta` 表存储各表行数 | COUNT(*) 读N行 → 读1行 |

### 6.2 D1 行写入优化（写比读贵1000倍）

| 策略 | 实现方式 |
|---|---|
| 批量写入 | 使用 `db.batch()` 合并多条插入 |
| 避免频繁更新 | 合并多次字段更新为一次 PATCH |
| 软删除慎用 | updated_at 更新会消耗写入额度 |

### 6.3 KV 不用于缓存

KV 写入 $5/百万次，是 Cache API（免费）的 ∞ 倍成本。
所有缓存只使用 `caches.default`（Cache API），不使用 KV。

### 6.4 成本估算

| 团队规模 | 日均操作 | 月 D1 读（含缓存） | 月成本 |
|---|---|---|---|
| 个人 | ~100次 | ~60万行 | $0（免费版） |
| 5人小团队 | ~500次 | ~300万行 | $0（免费版） |
| 20人团队 | ~2000次 | ~1200万行 | $5（Workers Paid，D1在包含内） |
| 大规模使用 | ~2万次 | ~1.2亿行 | $5（仍在250亿包含额度内） |

> 计算依据：每次操作平均读20行 × 操作次数 × 30天 × 缓存命中率50%

---

## 七、前端功能规划

### 7.1 表格视图（核心）
- 表头显示字段名和类型
- 行内编辑（点击单元格直接修改）
- 多列排序
- 字段筛选（下拉选择条件和值）
- 虚拟滚动（仅渲染可见行，支持大数据集）
- 无限滚动加载（滚动到底部自动加载下一页）

### 7.2 记录管理
- 新增记录弹窗（表单自动根据字段类型生成）
- 编辑记录弹窗
- 删除确认
- 批量导入（CSV）

### 7.3 表结构管理
- 查看当前表的字段列表和类型
- 字段类型展示（TEXT / INTEGER / REAL / BLOB）

### 7.4 系统设置
- API Key 管理（生成只读/读写 Key）
- 查看 OpenAPI 文档

---

## 八、安全设计

| 风险 | 防护措施 |
|---|---|
| 未授权访问 | 所有 API 接口必须携带有效 API Key |
| SQL 注入 | 所有查询使用 Drizzle ORM 参数化，禁止拼接 SQL |
| 越权操作 | readonly Key 在中间件层拦截写操作，不依赖业务逻辑 |
| 大量数据泄露 | page_size 最大限制为 100，不允许无限量导出 |
| 恶意排序/筛选 | 字段白名单校验，只允许对已建索引字段排序 |

---

## 九、部署架构

```
wrangler deploy          # 部署 Worker
wrangler pages deploy    # 部署前端

生产环境变量（wrangler.toml）：
  [[d1_databases]]
  binding = "DB"
  database_name = "d1table"
  database_id = "<uuid>"

  [vars]
  API_KEY_SALT = "<random>"
```
