# D1Table

D1Table 是一个运行在 **Cloudflare Workers + D1 + R2** 上的轻量级在线数据管理系统。

它把“数据库、表格管理、Notes、图表、回收箱、权限控制、API 文档”整合到一个界面里，既适合团队成员通过可视化界面使用，也适合 AI Agent 或自动化脚本通过 API 读写数据。

## 适合用来做什么

- 管理团队内部的结构化数据
- 给 AI Agent 提供稳定的 REST API 数据源
- 搭建轻量的业务后台、资料库、账号库、内容库、任务库
- 用表格、卡片、图表和 Notes 组织信息
- 用 API Key 做只读或分组范围的安全访问

## 当前能力

### 数据与视图
- 动态创建、修改、删除表
- 表格视图、卡片视图、看板视图、图表视图
- 行详情抽屉，支持快速查看与编辑
- 支持文本、长文本、数字、金额、百分比、邮箱、网址、日期、日期时间、复选框、单选、图片、关联记录、关联 Note 等字段类型
- 支持批量新增记录
- 支持导出记录

### 组织与协作
- Tables 首页支持分组、最近访问、搜索
- 左侧同时支持 Tables 和 Notes 导航
- Notes 支持树形目录、子页面、导入导出
- 支持团队成员与权限管理
- 支持用户偏好同步

### 安全与权限
- Google OAuth 登录
- 管理员 / 普通用户角色
- API Key 支持只读、读写
- API Key 支持全部表或指定分组范围
- 删除的记录、表、Notes 会进入回收箱，可恢复

### API 与集成
- 自动生成 API 文档
- OpenAPI JSON 可供 AI Agent 自动读取
- 支持用 `X-API-Key` 进行服务端或脚本访问

## 文档入口

- 用户使用说明：`docs/使用说明.md`
- API 文档：部署后访问 `/api/docs`
- OpenAPI JSON：部署后访问 `/api/openapi.json`
- Google OAuth 配置说明：`docs/google-auth-spec.md`

## 快速部署

### 环境要求

- Node.js 18+
- Wrangler CLI
- Cloudflare 账号
- Google Cloud OAuth 2.0 凭据

### 一键部署

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
./setup.sh
```

脚本会自动完成：

1. 创建 D1 数据库
2. 创建 R2 Bucket
3. 生成本地配置
4. 提示填写 Google OAuth 信息
5. 安装依赖
6. 运行数据库迁移
7. 构建前端并部署

## 手动部署

### 1. 安装依赖

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
npm install
cd web && npm install && cd ..
```

### 2. 创建 Cloudflare 资源

```bash
wrangler d1 create d1table
wrangler r2 bucket create d1table-files
```

创建后记下数据库 ID。

### 3. 配置 Wrangler

```bash
cp wrangler.toml.example wrangler.toml
```

然后把 `wrangler.toml` 里的数据库和 Bucket 信息改成你自己的资源。

### 4. 设置生产 secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put ALLOWED_EMAILS
wrangler secret put ADMIN_KEY
```

说明：

- `SESSION_SECRET` 建议使用随机的长字符串
- `ALLOWED_EMAILS` 可选，不填则不限制邮箱白名单
- `ADMIN_KEY` 建议配置，便于运维场景使用

### 5. 运行生产迁移

```bash
npm run db:migrate
```

说明：

- 请统一使用这个脚本
- 不要手动逐个执行迁移文件

### 6. 部署生产

```bash
npm run deploy
```

## Preview 环境部署

项目支持独立的 preview 环境。

### 推荐资源命名

- Preview D1：`d1table-preview`
- Preview R2：`d1table-preview-files`

### Preview secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID --env preview
wrangler secret put GOOGLE_CLIENT_SECRET --env preview
wrangler secret put SESSION_SECRET --env preview
wrangler secret put ALLOWED_EMAILS --env preview
wrangler secret put ADMIN_KEY --env preview
```

### Preview 迁移与部署

```bash
npm run db:migrate:preview
npm run deploy:preview
```

## 本地开发

### 1. 本地变量

```bash
cp .dev.vars.example .dev.vars
```

填写以下变量：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

### 2. 本地迁移

```bash
npm run db:migrate:local
```

### 3. 启动开发环境

分别打开两个终端：

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

然后访问：

- 前端：`http://localhost:5173`
- Worker：`http://localhost:8787`

## Google OAuth 配置

在 Google Cloud Console 创建 OAuth 2.0 Client ID，并配置回调地址。

### 生产环境回调地址

```text
https://你的生产域名/api/auth/callback
```

### Preview 回调地址

```text
https://你的-preview域名/api/auth/callback
```

### 本地回调地址

```text
http://localhost:8787/api/auth/callback
```

## 登录与权限

### Web 登录

- 使用 Google 登录
- 首个登录用户会成为管理员
- 管理员可以在 Settings 里管理用户和团队

### API 调用方式

所有 API 请求都使用请求头：

```text
X-API-Key: your_api_key
```

不是 Bearer Token。

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

完整接口请以部署后的 `/api/docs` 和 `/api/openapi.json` 为准。

这里列常用能力范围：

- 表管理
- 字段管理
- 记录查询与增删改
- 批量新增记录
- 记录导出
- 图表配置保存
- 分组管理
- 用户偏好保存
- API Key 管理
- 用户与团队管理
- 回收箱恢复与永久删除
- Notes 管理
- 图片上传与删除

### 导出限制

- 记录导出单次最多 10,000 行
- 超过上限时接口会直接返回错误，不会静默截断

## 项目结构

- `src`：Worker API 与服务端逻辑
- `web`：Vue 前端
- `migrations`：数据库迁移
- `scripts`：迁移与部署辅助脚本
- `docs`：设计、说明与参考资料
- `skills/d1table-client`：Python 客户端

## 上线前建议检查

1. 生产 secrets 是否齐全
2. Google OAuth 回调地址是否配置正确
3. 生产迁移是否已执行
4. 是否能正常登录
5. 是否能正常创建表、写入记录、恢复回收箱
6. `/api/docs` 和 `/api/openapi.json` 是否可访问

## License

MIT
