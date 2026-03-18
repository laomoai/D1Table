# D1Table 任务计划

> 开发优先级：先跑通核心数据流，再完善 UI，最后优化成本。

---

## 里程碑概览

```
Phase 1：骨架搭建          ← 项目初始化，能跑起来
Phase 2：后端 API          ← 核心数据 CRUD + OpenAPI
Phase 3：前端界面          ← 表格视图 + 基础操作
Phase 4：成本优化          ← 缓存 + 索引 + 分页优化
Phase 5：收尾              ← 安全加固 + 文档 + 部署
```

---

## Phase 1：骨架搭建

### T1-1 初始化 Monorepo
- [ ] 创建根 `package.json`，配置 workspace（`apps/worker`, `apps/web`）
- [ ] 配置根 `.gitignore`
- [ ] 初始化 git 仓库

### T1-2 初始化 Worker 项目
- [ ] `npm create cloudflare@latest apps/worker` 选择 Hono 模板
- [ ] 安装依赖：`hono`, `@hono/zod-openapi`, `drizzle-orm`, `zod`
- [ ] 安装开发依赖：`drizzle-kit`, `wrangler`
- [ ] 配置 `wrangler.toml`（绑定 D1 数据库）
- [ ] 创建本地 D1 数据库：`wrangler d1 create d1table`
- [ ] 验证：`wrangler dev` 能启动，`GET /api/health` 返回 200

### T1-3 初始化 Web 项目
- [ ] `npm create vite@latest apps/web -- --template vue-ts`
- [ ] 安装依赖：`@tanstack/vue-table`, `@tanstack/vue-query`, `naive-ui`
- [ ] 配置 Vite 代理（开发时转发 `/api` 到 Worker）
- [ ] 验证：`npm run dev` 能启动，看到默认页面

### T1-4 配置 Drizzle
- [ ] 创建 `apps/worker/src/db/schema.ts`（示例表：`_api_keys` 和 demo `contacts` 表）
- [ ] 配置 `drizzle.config.ts`
- [ ] 执行首次迁移：`drizzle-kit generate` + `wrangler d1 execute`
- [ ] 验证：D1 中能看到表结构

**Phase 1 完成标准：** Worker 和 Web 均能本地启动，D1 有初始表结构。

---

## Phase 2：后端 API

### T2-1 中间件
- [ ] `middleware/auth.ts`：读取 `X-API-Key` 请求头，查 `_api_keys` 表校验
  - 无效 Key → 401
  - readonly Key + 写操作 → 403
- [ ] `middleware/cache.ts`：GET 请求自动读写 `caches.default`，TTL 60秒
  - 命中缓存直接返回，不查 D1
  - 写操作后清除对应缓存 key

### T2-2 元数据接口
- [ ] `GET /api/tables`：查询 `sqlite_master` 获取所有用户表名
  - 过滤掉 `_` 开头的系统表
- [ ] `GET /api/tables/:tableName`：解析 `CREATE TABLE` SQL，返回字段名和类型
  - 返回格式：`{ columns: [{ name, type, nullable, isPrimaryKey }] }`

### T2-3 数据 CRUD 接口
- [ ] `GET /api/tables/:tableName/records`
  - 支持参数：`cursor`, `page_size`（默认20，最大100）
  - 支持参数：`filter[field]=value`, `filter[field_gt]=value`
  - 支持参数：`sort=field:asc|desc`
  - 支持参数：`fields=f1,f2,f3`
  - 实现 keyset 分页（`WHERE id > :cursor LIMIT :size`）
  - 字段白名单校验（防止注入非法列名）
- [ ] `GET /api/tables/:tableName/records/:id`：单条查询
- [ ] `POST /api/tables/:tableName/records`：插入记录，返回新记录
- [ ] `PATCH /api/tables/:tableName/records/:id`：更新指定字段
- [ ] `DELETE /api/tables/:tableName/records/:id`：删除记录
- [ ] `POST /api/tables/:tableName/records/batch`：批量插入（使用 `db.batch()`）

### T2-4 OpenAPI 文档接口
- [ ] `GET /api/openapi.json`：返回完整 OpenAPI 3.0 spec
  - 静态描述元数据接口
  - 动态描述各表的 CRUD 接口（根据 D1 表结构生成）
- [ ] `GET /api/docs`：Swagger UI 页面（使用 `@scalar/hono-api-reference`）

### T2-5 API Key 管理接口
- [ ] `POST /api/admin/keys`：创建新 API Key（需 admin 权限）
- [ ] `GET /api/admin/keys`：列出所有 Key（隐藏明文）
- [ ] `DELETE /api/admin/keys/:id`：撤销 Key

**Phase 2 完成标准：** 用 curl 或 Postman 能完成全部 CRUD，OpenAPI 文档可访问，Cache 中间件生效。

---

## Phase 3：前端界面

### T3-1 路由和布局
- [ ] 安装 `vue-router`
- [ ] 左侧边栏：显示所有表名，点击切换
- [ ] 顶部栏：系统名称、设置入口
- [ ] 路由：`/` → 表列表，`/table/:name` → 表格视图，`/settings` → 设置

### T3-2 核心表格视图（DataGrid.vue）
- [ ] 使用 TanStack Table 渲染表格
- [ ] 列定义从 `GET /api/tables/:name` 动态生成
- [ ] 无限滚动：滚动到底部触发加载下一页（TanStack Query + `useInfiniteQuery`）
- [ ] 列头显示字段类型标签
- [ ] 行选中高亮

### T3-3 筛选和排序
- [ ] 筛选栏（FilterBar.vue）：
  - 下拉选择字段 → 选择操作符（等于/包含/大于/小于）→ 输入值
  - 支持多条件叠加
  - 条件变更后重置分页游标，重新请求
- [ ] 列头点击排序（升序/降序/取消）

### T3-4 记录操作
- [ ] 新增记录按钮 → 弹窗（RecordForm.vue）
  - 根据字段类型自动渲染输入控件（TEXT→输入框，INTEGER→数字框）
  - 提交后刷新列表
- [ ] 行内编辑：双击单元格进入编辑状态，失焦自动保存（PATCH）
- [ ] 右键菜单或操作列：编辑、删除（带确认弹窗）

### T3-5 系统设置页
- [ ] 显示 API Base URL
- [ ] API Key 管理：创建/撤销 Key，一次性显示明文
- [ ] OpenAPI 文档链接

**Phase 3 完成标准：** 浏览器能完成完整的增删改查操作，筛选排序分页正常工作。

---

## Phase 4：成本优化

### T4-1 索引管理
- [ ] 在 schema 中为常用筛选字段添加索引定义
- [ ] 实现索引白名单：只允许对有索引的字段进行排序和筛选
  - 无索引字段的排序/筛选请求返回 400，提示用户

### T4-2 计数表
- [ ] 创建 `_meta` 系统表：`(table_name TEXT, row_count INTEGER)`
- [ ] 在 INSERT/DELETE 的 Worker 逻辑中同步更新计数
- [ ] `GET /api/tables/:name/count` 接口只读 `_meta` 表（1行）
- [ ] 前端在表名旁显示行数

### T4-3 缓存策略细化
- [ ] 列表接口缓存 key 包含所有查询参数（确保不同筛选条件分别缓存）
- [ ] 写操作后精确清除相关缓存（按表名前缀清除）
- [ ] 静态资源（前端 JS/CSS）设置长期缓存头

### T4-4 批量导入优化
- [ ] CSV 导入：前端解析 → 分批发送（每批100条）→ Worker 用 `db.batch()` 写入
- [ ] 避免一次性写入大量行触发计费高峰

**Phase 4 完成标准：** D1 控制台中每次列表查询的扫描行数 ≤ 页大小 × 1.2。

---

## Phase 5：收尾

### T5-1 安全加固
- [ ] 所有用户输入的表名/字段名通过白名单校验（只允许字母数字下划线）
- [ ] page_size 上限强制为 100
- [ ] 请求体大小限制（防止超大 JSON 导致 CPU 超时）
- [ ] 错误信息不暴露内部 SQL

### T5-2 生产部署
- [ ] 创建生产 D1 数据库
- [ ] 配置生产环境 `wrangler.toml`
- [ ] 配置 Cloudflare Pages 自动部署（连接 GitHub）
- [ ] 配置自定义域名

### T5-3 文档补全
- [ ] 更新 README：快速上手、部署步骤
- [ ] OpenAPI spec 补充中文描述
- [ ] 记录各接口的 D1 行读取消耗（便于成本监控）

**Phase 5 完成标准：** 生产环境可访问，OpenAPI 文档完整，新成员能按 README 完成部署。

---

## 依赖关系图

```
T1-1 → T1-2 → T1-4 → T2-1 → T2-2 → T2-3 → T2-4
                                ↓
T1-3 ──────────────────────── T3-1 → T3-2 → T3-3 → T3-4
                                                        ↓
                                              T4-1 → T4-2 → T4-3 → T5-1 → T5-2
```

---

## 技术风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|---|---|---|---|
| D1 动态查询 SQL 拼接导致注入 | 中 | 高 | 强制白名单校验，所有值用参数绑定 |
| Workers CPU 超时（复杂查询） | 低 | 中 | 禁止无 LIMIT 查询，复杂聚合放到 SQL 层 |
| 缓存 key 冲突导致脏数据 | 低 | 中 | 缓存 key 包含完整查询参数 hash |
| D1 免费额度超限（免费版） | 低 | 低 | 监控日用量，超80%发告警；升级 $5/月方案 |
| 前端无限滚动性能问题 | 中 | 低 | TanStack Table 虚拟滚动，DOM 节点上限500 |
