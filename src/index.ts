import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { apiReference } from '@scalar/hono-api-reference'
import type { Env, AuthVariables } from './types'
import { authMiddleware, tableAccessMiddleware } from './middleware/auth'
import tablesRouter from './routes/tables'
import recordsRouter from './routes/records'
import adminRouter from './routes/admin'
import fieldsRouter from './routes/fields'
import groupsRouter from './routes/groups'
import trashRouter from './routes/trash'

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// ── 全局中间件 ────────────────────────────────────────────────
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['X-API-Key', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
)

// ── 健康检查（无需认证）────────────────────────────────────────
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
)

// ── OpenAPI JSON 文档（无需认证，供 AI Agent 读取）──────────────
app.get('/api/openapi.json', (c) => {
  const serverUrl = new URL(c.req.url).origin
  return c.json(openApiSpec(serverUrl))
})

// ── Scalar API 文档 UI（无需认证）────────────────────────────────
app.get(
  '/api/docs',
  apiReference({
    spec: { url: '/api/openapi.json' },
    pageTitle: 'D1Table API 文档',
    theme: 'purple',
  })
)

// ── 需要认证的路由 ─────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})
app.use('/api/*', authMiddleware)
// 不再缓存：表列表用了 COUNT(*)，需要实时；表结构极少变更但也不值得缓存的复杂度

// 表访问控制：scope=groups 的 Key 只能访问关联分组内的表
app.use('/api/tables/:tableName/*', tableAccessMiddleware)
app.use('/api/tables/:tableName', tableAccessMiddleware)

app.route('/api/tables', tablesRouter)
app.route('/api/tables', recordsRouter)
app.route('/api/tables', fieldsRouter)
app.route('/api/admin', adminRouter)
app.route('/api/groups', groupsRouter)
app.route('/api/trash', trashRouter)

// ── 入口：API 走 Hono，其余走静态资源（SPA）────────────────────
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx)
    }

    // 静态资源由 Cloudflare Assets 处理（SPA fallback 返回 index.html）
    return env.ASSETS.fetch(request)
  },
}

// ── OpenAPI 3.0 Spec ──────────────────────────────────────────
function openApiSpec(serverUrl: string) {
  return {
    openapi: '3.0.0',
    info: {
      title: 'D1Table API',
      version: '2.0.0',
      description: `基于 Cloudflare D1 的数据管理 API，支持动态表 CRUD，适合 AI Agent 调用。

**关键约定：**
- 认证：请求头携带 \`X-API-Key\`
- 分页：游标分页（keyset），用 \`cursor\` 参数传入上一页的 \`next_cursor\`
- 时间格式：datetime 字段返回 ISO 8601 格式（UTC），如 \`2026-03-15T04:37:31.000Z\`
- 每张表有 API 名称（name，如 tbl_abc123）和显示名称（title，如"客户列表"）
- 每个字段有列名（column_name）和显示名（title），API 请求用列名，响应附带显示名映射`,
    },
    servers: [{ url: serverUrl }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        FieldMapping: {
          type: 'object',
          description: '字段名 → 显示信息的映射，帮助理解每个列的含义',
          additionalProperties: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '字段显示名（中文）' },
              field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'currency', 'percent', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'] },
            },
          },
          example: { name: { title: '姓名', field_type: 'text' }, created_at: { title: '创建时间', field_type: 'datetime' } },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page_size: { type: 'integer' },
            count: { type: 'integer', description: '本页返回条数' },
            next_cursor: { type: 'string', nullable: true, description: '下一页游标，为 null 表示已到末页' },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          summary: '健康检查',
          security: [],
          responses: { '200': { description: '服务正常' } },
        },
      },
      '/api/tables': {
        get: {
          summary: '获取所有表列表',
          responses: {
            '200': {
              description: '表列表',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', description: 'API 表名（如 tbl_abc123）' },
                            title: { type: 'string', nullable: true, description: '显示名（如"客户列表"）' },
                            row_count: { type: 'integer', description: '记录总数' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: '新建表',
          description: '动态建表。id 和 created_at 字段自动添加。建议通过 UI 创建（自动生成 tbl_ 前缀表名），也可 API 指定。',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'columns'],
                  properties: {
                    name: { type: 'string', description: 'API 表名（如 tbl_abc123）', example: 'tbl_orders01' },
                    title: { type: 'string', description: '显示名（中文）', example: '订单管理' },
                    columns: {
                      type: 'array',
                      description: '字段定义列表',
                      items: {
                        type: 'object',
                        required: ['name', 'type'],
                        properties: {
                          name: { type: 'string', description: '列名', example: 'col_amt1' },
                          title: { type: 'string', description: '显示名', example: '金额' },
                          type: { type: 'string', enum: ['TEXT', 'INTEGER', 'REAL', 'BLOB'], description: 'SQLite 类型' },
                          field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'currency', 'percent', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'], description: 'UI 字段类型' },
                          nullable: { type: 'boolean', default: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: '建表成功' },
            '409': { description: '表已存在' },
          },
        },
      },
      '/api/tables/{tableName}': {
        get: {
          summary: '获取表结构',
          description: '返回表的字段定义，含显示名和字段类型。',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: '表结构',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', description: 'API 表名' },
                          title: { type: 'string', description: '显示名' },
                          columns: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string', description: '列名' },
                                title: { type: 'string', description: '显示名' },
                                type: { type: 'string', description: 'SQLite 类型' },
                                field_type: { type: 'string', description: 'UI 字段类型' },
                                nullable: { type: 'boolean' },
                                isPrimaryKey: { type: 'boolean' },
                                defaultValue: { type: 'string', nullable: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        delete: {
          summary: '删除表（危险）',
          description: '删除整张表及其数据，不可恢复。需要读写权限。',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: '删除成功' },
            '404': { description: '表不存在' },
          },
        },
      },
      '/api/tables/{tableName}/records': {
        get: {
          summary: '查询记录（分页）',
          description: 'datetime 字段自动转为 ISO 8601 UTC 格式（如 2026-03-15T04:37:31.000Z）。响应包含 fields 字段映射，用于理解列名含义。',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page_size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: '上一页最后一条记录的 id' },
            { name: 'sort', in: 'query', schema: { type: 'string' }, description: '格式：field:asc 或 field:desc' },
            { name: 'fields', in: 'query', schema: { type: 'string' }, description: '逗号分隔的字段列表' },
            { name: 'filter[field]', in: 'query', schema: { type: 'string' }, description: '等值筛选，支持后缀 __gt/__gte/__lt/__lte/__like/__ne' },
          ],
          responses: {
            '200': {
              description: '记录列表 + 字段映射',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' }, description: '记录数组，datetime 字段为 ISO 8601 字符串' },
                      fields: { $ref: '#/components/schemas/FieldMapping' },
                      meta: { $ref: '#/components/schemas/PaginationMeta' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: '新增记录',
          description: '请求体为 JSON 对象，key 用列名（column_name），datetime 字段可传 Unix 时间戳（秒）或 ISO 8601 字符串。',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '201': { description: '新增成功，返回 { id, ...fields }' } },
        },
      },
      '/api/tables/{tableName}/records/batch': {
        post: {
          summary: '批量新增记录（最多500条）',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { records: { type: 'array', items: { type: 'object' } } },
                },
              },
            },
          },
          responses: { '201': { description: '批量插入成功' } },
        },
      },
      '/api/tables/{tableName}/records/{id}': {
        get: {
          summary: '查询单条记录',
          description: '返回记录数据 + fields 字段映射。datetime 字段为 ISO 8601 UTC 格式。',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: '记录详情 + 字段映射', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' }, fields: { $ref: '#/components/schemas/FieldMapping' } } } } } } },
        },
        patch: {
          summary: '更新记录',
          description: 'datetime 字段可传 Unix 时间戳（秒）或 ISO 8601 字符串。',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: '更新成功' } },
        },
        delete: {
          summary: '删除记录',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: '删除成功' } },
        },
      },
      '/api/tables/{tableName}/fields': {
        get: {
          summary: '获取字段元数据',
          description: '返回字段的显示名、类型、宽度、可见性等信息，前端 UI 用此驱动渲染',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: '字段元数据列表',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            column_name: { type: 'string' },
                            title: { type: 'string' },
                            field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'currency', 'percent', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'] },
                            select_options: { type: 'array', nullable: true },
                            order_index: { type: 'integer' },
                            width: { type: 'integer' },
                            is_hidden: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: '添加字段',
          description: '执行 ALTER TABLE ADD COLUMN 并写入 _field_meta',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'field_type'],
                  properties: {
                    title: { type: 'string', description: '字段显示名' },
                    column_name: { type: 'string', description: '可选，不填自动从 title 生成' },
                    field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'] },
                    nullable: { type: 'boolean', default: true },
                    select_options: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' }, color: { type: 'string' } } } },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: '字段创建成功' },
            '409': { description: '字段已存在' },
          },
        },
      },
      '/api/tables/{tableName}/fields/{colName}': {
        patch: {
          summary: '更新字段元数据',
          description: '修改字段的显示名、类型、宽度、可见性等（不修改数据库 schema）',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'colName', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    field_type: { type: 'string' },
                    width: { type: 'integer' },
                    is_hidden: { type: 'boolean' },
                    order_index: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: '更新成功' } },
        },
        delete: {
          summary: '删除（隐藏）字段',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'colName', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: '操作成功' } },
        },
      },
      '/api/admin/keys': {
        get: { summary: '获取 API Key 列表（含分组信息）', responses: { '200': { description: 'Key 列表' } } },
        post: {
          summary: '创建 API Key',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['readonly', 'readwrite'] },
                    scope: { type: 'string', enum: ['all', 'groups'], description: 'all=访问全部表，groups=仅访问指定分组的表' },
                    group_ids: { type: 'array', items: { type: 'integer' }, description: 'scope=groups 时关联的分组 ID 列表' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: '创建成功，明文 Key 仅返回一次' } },
        },
      },
      '/api/admin/keys/{id}': {
        patch: {
          summary: '更新 Key 的 scope 和关联分组',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['all', 'groups'] },
                    group_ids: { type: 'array', items: { type: 'integer' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: '更新成功' } },
        },
        delete: {
          summary: '撤销 API Key',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: '撤销成功' } },
        },
      },
      '/api/groups': {
        get: {
          summary: '获取所有分组（含关联表列表）',
          responses: { '200': { description: '分组列表' } },
        },
        post: {
          summary: '创建分组',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', description: '分组名称' },
                    sort_order: { type: 'integer', description: '排序权重，越小越靠前' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: '创建成功' }, '409': { description: '分组已存在' } },
        },
      },
      '/api/groups/{id}': {
        patch: {
          summary: '更新分组',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    sort_order: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: '更新成功' } },
        },
        delete: {
          summary: '删除分组（不影响表本身）',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: '删除成功' } },
        },
      },
      '/api/groups/{id}/tables': {
        put: {
          summary: '设置分组内的表（全量替换）',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tables: { type: 'array', items: { type: 'string' }, description: '表名列表' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: '设置成功' } },
        },
      },
    },
  }
}
