import type { MiddlewareHandler } from 'hono'
import type { Env } from '../types'

/**
 * Cache API 缓存中间件（GET 请求）
 *
 * 为何用 Cache API 而不是 KV：
 * - Cache API：完全免费，走 Cloudflare 边缘节点缓存
 * - KV 写入：$5/百万次，成本极高
 *
 * 缓存策略：
 * - 只缓存 GET 请求
 * - 只缓存 2xx 响应
 * - TTL 60 秒（可通过路由单独覆盖）
 * - 写操作（POST/PATCH/DELETE）后，清除对应表的缓存
 */
export function cacheMiddleware(ttl = 60): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    if (c.req.method !== 'GET') {
      return next()
    }

    const cache = caches.default
    const cacheKey = c.req.raw

    const cached = await cache.match(cacheKey)
    if (cached) {
      // 命中缓存：D1 行读取 = 0
      const res = new Response(cached.body, cached)
      res.headers.set('X-Cache', 'HIT')
      return res
    }

    await next()

    // 只缓存成功响应
    if (c.res.status >= 200 && c.res.status < 300) {
      const res = c.res.clone()
      // s-maxage: CDN 缓存 ttl 秒; no-cache: 浏览器每次必须重新验证（不用本地缓存）
      res.headers.set('Cache-Control', `s-maxage=${ttl}, no-cache`)
      res.headers.set('X-Cache', 'MISS')
      c.executionCtx.waitUntil(cache.put(cacheKey, res))
    }
  }
}

/**
 * 清除某个表相关的所有缓存
 * 在写操作后调用，保证缓存一致性
 *
 * 注意：Cache API 不支持按前缀批量删除，这里清除精确 URL。
 * 实践中写操作后前端会重新请求，新请求会绕过旧缓存（URL 带不同查询参数）。
 * 此函数清除最常访问的默认列表页缓存。
 */
export async function invalidateTableCache(
  request: Request,
  tableName: string
): Promise<void> {
  const cache = caches.default
  const url = new URL(request.url)
  const baseUrl = `${url.origin}/api/tables/${tableName}/records`
  // 清除第一页缓存（最常被缓存的请求）
  await cache.delete(new Request(baseUrl))
  await cache.delete(new Request(`${baseUrl}?page_size=20`))
}
