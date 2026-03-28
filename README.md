# D1Table

D1Table 是一个基于 **Cloudflare Workers + D1 + R2** 的轻量级在线数据工作台。

它把表格数据库、Notes、图表、回收箱、团队权限、API 文档整合到同一个界面里，既适合团队成员通过可视化界面使用，也适合 AI Agent 或自动化脚本通过 REST API 访问。

## 适合用来做什么

- 团队内部结构化数据管理
- 轻量业务后台
- 内容库、账号库、任务库、研究资料库
- 表格与 Notes 混合协作
- AI Agent 的记忆库与操作台
- 通过 API Key 提供安全访问

## 核心能力

### Tables 与视图

- 动态创建、修改、锁定、删除表
- Grid、Gallery、Kanban、Chart、Dashboard 等视图
- 丰富字段类型：文本、长文本、数字、金额、百分比、邮箱、网址、日期、日期时间、复选框、单选、图片、关联记录、关联 Note、密码、TOTP 等
- 行详情抽屉，便于快速查看和编辑
- 支持批量新增记录
- 支持记录导出
- 支持表分组、最近访问、搜索

### Notes

- 树形目录与子页面
- 编辑与预览
- 支持图标、锁定、回收箱、恢复
- 支持当前笔记导入 / 导出
- 与 Tables 共用主导航

### 设置与管理

- Google OAuth 登录
- 管理员 / 普通用户角色
- 团队管理
- 用户偏好同步
- API Key 管理，支持撤销，以及对已撤销 key 的永久删除
- `Settings > Import / Export` 提供系统级导出
  - 导出 Notes Bundle
  - 导出 Tables Bundle
  - 导出 Schema CSV

### 安全与权限

- 记录、表、Notes 支持软删除与回收箱
- 支持恢复与永久删除
- 表锁定
- API Key 支持范围控制：
  - 只读 / 读写
  - 全部表 / 指定分组
  - 全部 Notes / 无 Notes / 指定 Note Root

### API 与自动化

- 自动生成 API 文档
- OpenAPI JSON 便于 Agent / 工具自动发现接口
- 支持通过 `X-API-Key` 进行服务端或脚本访问

## 文档入口

- 用户说明：`docs/使用说明.md`
- Google OAuth 配置：`docs/google-auth-spec.md`
- API 文档：部署后访问 `/api/docs`
- OpenAPI JSON：部署后访问 `/api/openapi.json`
- 英文 README：`README_en.md`

## 技术栈

- 后端：Cloudflare Workers + Hono
- 数据库：Cloudflare D1
- 文件存储：Cloudflare R2
- 前端：Vue 3 + Vite + Naive UI
- 图表：ECharts

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Wrangler CLI
- Cloudflare 账号
- Google Cloud OAuth 2.0 凭据

### 一键安装

```bash
git clone https://github.com/laomoai/D1Table.git
cd D1Table
./setup.sh
```

脚本会帮助你完成：

1. 创建 D1 和 R2 资源
2. 生成本地配置
3. 填写 Google OAuth 信息
4. 安装依赖
5. 执行迁移
6. 构建并部署

## 手动部署

### 1. 安装依赖

```bash
git clone https://github.com/laomoai/D1Table.git
cd D1Table
npm install
cd web && npm install && cd ..
```

### 2. 创建 Cloudflare 资源

```bash
wrangler d1 create d1table
wrangler r2 bucket create d1table-files
```

记下创建后的 D1 数据库 ID。

### 3. 配置 Wrangler

```bash
cp wrangler.toml.example wrangler.toml
```

然后把 `wrangler.toml` 中的 D1 和 R2 资源信息改成你自己的。

### 4. 设置生产环境 Secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put ALLOWED_EMAILS
wrangler secret put ADMIN_KEY
```

说明：

- `SESSION_SECRET` 建议使用随机长字符串
- `ALLOWED_EMAILS` 可选；不填则不启用邮箱白名单
- `ADMIN_KEY` 建议配置，便于运维访问

### 5. 执行迁移

```bash
npm run db:migrate
```

建议统一使用项目脚本，不要手动逐个执行 SQL 文件。

### 6. 部署

```bash
npm run deploy
```

## Preview 环境

项目支持独立的 preview 环境。

建议命名：

- D1：`d1table-preview`
- R2：`d1table-preview-files`

设置 preview secrets：

```bash
wrangler secret put GOOGLE_CLIENT_ID --env preview
wrangler secret put GOOGLE_CLIENT_SECRET --env preview
wrangler secret put SESSION_SECRET --env preview
wrangler secret put ALLOWED_EMAILS --env preview
wrangler secret put ADMIN_KEY --env preview
```

执行 preview 迁移与部署：

```bash
npm run db:migrate:preview
npm run deploy:preview
```

## 本地开发

### 1. 创建本地变量文件

```bash
cp .dev.vars.example .dev.vars
```

填写：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

### 2. 执行本地迁移

```bash
npm run db:migrate:local
```

### 3. 启动开发环境

分别在两个终端执行：

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

访问：

- 前端：`http://localhost:5173`
- Worker：`http://localhost:8787`

## Google OAuth 回调地址

在 Google Cloud Console 中配置 OAuth 回调地址。

生产环境：

```text
https://你的正式域名/api/auth/callback
```

Preview：

```text
https://你的-preview域名/api/auth/callback
```

本地：

```text
http://localhost:8787/api/auth/callback
```

## 登录与鉴权

### Web 登录

- 使用 Google 登录
- 第一个登录的用户会成为初始管理员
- 管理员可在 `Settings` 中管理用户与团队

### API 调用

请求头使用：

```text
X-API-Key: your_api_key
```

这里不是 Bearer Token。

## 常用命令

```bash
# 本地开发
npm run dev:worker
npm run dev:web

# 前端构建
npm run build:web

# 本地迁移
npm run db:migrate:local

# 生产迁移
npm run db:migrate

# preview 迁移
npm run db:migrate:preview

# 生产部署
npm run deploy

# preview 部署
npm run deploy:preview
```

## API 概览

完整接口请以部署后的以下文档为准：

- `/api/docs`
- `/api/openapi.json`

常用能力包括：

- 表管理
- 字段管理
- 记录查询、增删改
- 批量插入
- 记录导出
- Dashboard 配置保存
- 分组管理
- 用户偏好
- API Key 管理
- 用户与团队管理
- 回收箱恢复与永久删除
- Notes 管理
- 图片上传与删除

### 导出限制

- 单次记录导出上限为 10,000 行
- 超出上限时会返回明确错误，不会静默截断

## 项目结构

- `src` - Worker API 与后端逻辑
- `web` - Vue 前端
- `migrations` - 数据库迁移
- `scripts` - 迁移与部署辅助脚本
- `docs` - 设计与说明文档
- `tests` - 测试文件

## 上线前检查

1. 生产 secrets 已配置
2. Google OAuth 回调地址正确
3. 生产迁移已执行
4. 登录功能正常
5. 建表和写入记录正常
6. 回收箱恢复正常
7. `/api/docs` 与 `/api/openapi.json` 可访问

## License

MIT
