import { Hono } from 'hono'
import type { Env, AuthVariables } from '../types'

const upload = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

// POST /api/upload/image — 接收 thumb + display 两个 Blob，存入 R2
upload.post('/image', async (c) => {
  if (c.get('keyType') === 'readonly') {
    return c.json({ error: { message: 'Read-only key cannot upload files' } }, 403)
  }

  const form = await c.req.formData()
  const thumb = form.get('thumb') as File | null
  const display = form.get('display') as File | null
  const name = (form.get('name') as string | null) ?? 'image'

  if (!thumb || !display) {
    return c.json({ error: { message: 'Missing thumb or display' } }, 400)
  }

  // 用 crypto.randomUUID() 生成唯一路径
  const uuid = crypto.randomUUID()
  const thumbKey = `images/${uuid}/thumb.webp`
  const displayKey = `images/${uuid}/display.webp`

  await Promise.all([
    c.env.BUCKET.put(thumbKey, await thumb.arrayBuffer(), {
      httpMetadata: { contentType: 'image/webp' },
    }),
    c.env.BUCKET.put(displayKey, await display.arrayBuffer(), {
      httpMetadata: { contentType: 'image/webp' },
    }),
  ])

  return c.json({
    data: { thumb: thumbKey, display: displayKey, name, size: display.size },
  })
})

// DELETE /api/upload/image — 删除 R2 中的图片（thumb + display）
upload.delete('/image', async (c) => {
  if (c.get('keyType') === 'readonly') {
    return c.json({ error: { message: 'Read-only key cannot delete files' } }, 403)
  }

  const { thumb, display } = await c.req.json<{ thumb: string; display: string }>()
  if (!thumb || !display) {
    return c.json({ error: { message: 'Missing keys' } }, 400)
  }

  await Promise.all([
    c.env.BUCKET.delete(thumb),
    c.env.BUCKET.delete(display),
  ])

  return c.json({ data: { success: true } })
})

export default upload
