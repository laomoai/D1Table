import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { apiReference } from '@scalar/hono-api-reference'
import type { Env, AuthVariables } from './types'
import { authMiddleware, tableAccessMiddleware } from './middleware/auth'
import authRouter from './routes/auth'
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
    pageTitle: 'D1Table API Docs',
    theme: 'purple',
  })
)

// auth 路由不需要认证，必须在 authMiddleware 之前注册
app.route('/api/auth', authRouter)

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
      description: `Cloudflare D1-backed data management API with dynamic table CRUD, designed for AI Agent use.

**Key conventions:**
- Authentication: include \`X-API-Key\` in the request header
- Pagination: cursor-based pagination (keyset) — pass the previous page's \`next_cursor\` as the \`cursor\` parameter
- Datetime format: datetime fields are returned as ISO 8601 UTC strings, e.g. \`2026-03-15T04:37:31.000Z\`
- Each table has an API name (name, e.g. tbl_abc123) and a display name (title, e.g. "Customer List")
- Each field has a column name (column_name) and a display name (title); use the column name in API requests — the response includes a display name mapping`,
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
          description: 'Mapping of column name → display info, useful for understanding each column',
          additionalProperties: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Field display name' },
              field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'currency', 'percent', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'] },
            },
          },
          example: { name: { title: 'Name', field_type: 'text' }, created_at: { title: 'Created At', field_type: 'datetime' } },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page_size: { type: 'integer' },
            count: { type: 'integer', description: 'Number of records returned on this page' },
            next_cursor: { type: 'string', nullable: true, description: 'Cursor for the next page; null means this is the last page' },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          security: [],
          responses: { '200': { description: 'Service is healthy' } },
        },
      },
      '/api/tables': {
        get: {
          summary: 'List all tables',
          responses: {
            '200': {
              description: 'Table list',
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
                            name: { type: 'string', description: 'API table name (e.g. tbl_abc123)' },
                            title: { type: 'string', nullable: true, description: 'Display name (e.g. "Customer List")' },
                            row_count: { type: 'integer', description: 'Total number of records' },
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
          summary: 'Create table',
          description: 'Dynamically create a table. The id and created_at fields are added automatically. It is recommended to create tables via the UI (which auto-generates a tbl_ prefixed name), but the API also accepts a custom name.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'columns'],
                  properties: {
                    name: { type: 'string', description: 'API table name (e.g. tbl_abc123)', example: 'tbl_orders01' },
                    title: { type: 'string', description: 'Display name', example: 'Order Management' },
                    columns: {
                      type: 'array',
                      description: 'Field definitions',
                      items: {
                        type: 'object',
                        required: ['name', 'type'],
                        properties: {
                          name: { type: 'string', description: 'Column name', example: 'col_amt1' },
                          title: { type: 'string', description: 'Display name', example: 'Amount' },
                          type: { type: 'string', enum: ['TEXT', 'INTEGER', 'REAL', 'BLOB'], description: 'SQLite type' },
                          field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'currency', 'percent', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'], description: 'UI field type' },
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
            '201': { description: 'Table created successfully' },
            '409': { description: 'Table already exists' },
          },
        },
      },
      '/api/tables/{tableName}': {
        get: {
          summary: 'Get table schema',
          description: 'Returns the field definitions for a table, including display names and field types.',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Table schema',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', description: 'API table name' },
                          title: { type: 'string', description: 'Display name' },
                          columns: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                name: { type: 'string', description: 'Column name' },
                                title: { type: 'string', description: 'Display name' },
                                type: { type: 'string', description: 'SQLite type' },
                                field_type: { type: 'string', description: 'UI field type' },
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
          summary: 'Delete table (destructive)',
          description: 'Deletes the entire table and all its data. This action is irreversible. Requires read-write permission.',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Deleted successfully' },
            '404': { description: 'Table not found' },
          },
        },
      },
      '/api/tables/{tableName}/records': {
        get: {
          summary: 'List records (paginated)',
          description: 'datetime fields are automatically converted to ISO 8601 UTC format (e.g. 2026-03-15T04:37:31.000Z). The response includes a fields mapping to help interpret column names.',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page_size', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'The id of the last record from the previous page' },
            { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Format: field:asc or field:desc' },
            { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Comma-separated list of fields to return' },
            { name: 'filter[field]', in: 'query', schema: { type: 'string' }, description: 'Equality filter; supports suffixes __gt/__gte/__lt/__lte/__like/__ne' },
          ],
          responses: {
            '200': {
              description: 'Record list + field mapping',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { type: 'object' }, description: 'Array of records; datetime fields are ISO 8601 strings' },
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
          summary: 'Create record',
          description: 'Request body is a JSON object with column names as keys. datetime fields accept a Unix timestamp (seconds) or an ISO 8601 string.',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '201': { description: 'Created successfully; returns { id, ...fields }' } },
        },
      },
      '/api/tables/{tableName}/records/batch': {
        post: {
          summary: 'Batch create records (up to 500)',
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
          responses: { '201': { description: 'Batch insert successful' } },
        },
      },
      '/api/tables/{tableName}/records/{id}': {
        get: {
          summary: 'Get single record',
          description: 'Returns record data + fields mapping. datetime fields are in ISO 8601 UTC format.',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Record detail + field mapping', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' }, fields: { $ref: '#/components/schemas/FieldMapping' } } } } } } },
        },
        patch: {
          summary: 'Update record',
          description: 'datetime fields accept a Unix timestamp (seconds) or an ISO 8601 string.',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Updated successfully' } },
        },
        delete: {
          summary: 'Delete record',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Deleted successfully' } },
        },
      },
      '/api/tables/{tableName}/fields': {
        get: {
          summary: 'Get field metadata',
          description: 'Returns field display names, types, widths, visibility, etc. Used by the frontend UI to drive rendering.',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Field metadata list',
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
          summary: 'Add field',
          description: 'Executes ALTER TABLE ADD COLUMN and writes to _field_meta.',
          parameters: [{ name: 'tableName', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'field_type'],
                  properties: {
                    title: { type: 'string', description: 'Field display name' },
                    column_name: { type: 'string', description: 'Optional; auto-generated from title if omitted' },
                    field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'email', 'url', 'date', 'datetime', 'checkbox', 'select'] },
                    nullable: { type: 'boolean', default: true },
                    select_options: { type: 'array', items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' }, color: { type: 'string' } } } },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Field created successfully' },
            '409': { description: 'Field already exists' },
          },
        },
      },
      '/api/tables/{tableName}/fields/{colName}': {
        patch: {
          summary: 'Update field metadata',
          description: 'Modify field display name, type, width, visibility, etc. (does not alter the database schema).',
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
          responses: { '200': { description: 'Updated successfully' } },
        },
        delete: {
          summary: 'Delete (hide) field',
          parameters: [
            { name: 'tableName', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'colName', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Operation successful' } },
        },
      },
      '/api/admin/keys': {
        get: { summary: 'List API Keys (with group info)', responses: { '200': { description: 'Key list' } } },
        post: {
          summary: 'Create API Key',
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
                    scope: { type: 'string', enum: ['all', 'groups'], description: 'all = access all tables; groups = access only tables in specified groups' },
                    group_ids: { type: 'array', items: { type: 'integer' }, description: 'List of group IDs to associate when scope=groups' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Created successfully; plaintext key is returned only once' } },
        },
      },
      '/api/admin/keys/{id}': {
        patch: {
          summary: "Update Key's scope and associated groups",
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
          responses: { '200': { description: 'Updated successfully' } },
        },
        delete: {
          summary: 'Revoke API Key',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Revoked successfully' } },
        },
      },
      '/api/groups': {
        get: {
          summary: 'List all groups (with associated tables)',
          responses: { '200': { description: 'Group list' } },
        },
        post: {
          summary: 'Create group',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', description: 'Group name' },
                    sort_order: { type: 'integer', description: 'Sort weight; lower values appear first' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Created successfully' }, '409': { description: 'Group already exists' } },
        },
      },
      '/api/groups/{id}': {
        patch: {
          summary: 'Update group',
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
          responses: { '200': { description: 'Updated successfully' } },
        },
        delete: {
          summary: 'Delete group (tables are not affected)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Deleted successfully' } },
        },
      },
      '/api/groups/{id}/tables': {
        put: {
          summary: 'Set tables in group (full replace)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tables: { type: 'array', items: { type: 'string' }, description: 'List of table names' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Set successfully' } },
        },
      },
    },
  }
}
