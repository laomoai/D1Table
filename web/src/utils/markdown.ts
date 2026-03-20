import { marked } from 'marked'

// ── Markdown → HTML（预览用）──────────────────────────────────

// ==highlight== 语法
const highlightExtension = {
  name: 'highlight',
  level: 'inline' as const,
  start(src: string) { return src.indexOf('==') },
  tokenizer(src: string) {
    const match = src.match(/^==([^=]+)==/)
    if (match) return { type: 'highlight', raw: match[0], text: match[1] }
    return undefined
  },
  renderer(token: any) { return `<mark>${token.text}</mark>` },
}

// <!-- d1t:embed tableName limit title --> 嵌入表数据
const embedExtension = {
  name: 'tableEmbed',
  level: 'block' as const,
  start(src: string) { return src.indexOf('<!-- d1t:embed') },
  tokenizer(src: string) {
    const match = src.match(/^<!-- d1t:embed\s+(\S+)\s+(\d+)\s*(.*?)\s*-->\n?/)
    if (match) {
      return {
        type: 'tableEmbed', raw: match[0],
        tableName: match[1], limit: parseInt(match[2], 10),
        tableTitle: match[3] || match[1],
      }
    }
    return undefined
  },
  renderer(token: any) {
    return `<div class="md-embed">
      <div class="md-embed-header">📊 ${token.tableTitle || token.tableName} <span class="md-embed-badge">Live Data</span></div>
      <div class="md-embed-hint">Table: ${token.tableName} (limit ${token.limit})</div>
    </div>`
  },
}

// 任务列表
const taskListExtension = {
  name: 'taskListItem',
  level: 'block' as const,
  start(src: string) { return src.match(/^- \[[ x]\] /m)?.index },
  tokenizer(src: string) {
    const match = src.match(/^(?:- \[[ x]\] .+(?:\n|$))+/)
    if (match) {
      const items = match[0].trim().split('\n').map(line => {
        const m = line.match(/^- \[([ x])\] (.*)/)
        return m ? { checked: m[1] === 'x', text: m[2] } : null
      }).filter(Boolean) as { checked: boolean; text: string }[]
      return { type: 'taskListItem', raw: match[0], items }
    }
    return undefined
  },
  renderer(token: any) {
    const items = token.items.map((item: { checked: boolean; text: string }) =>
      `<li class="task-item"><input type="checkbox" ${item.checked ? 'checked' : ''} disabled /> <span${item.checked ? ' style="text-decoration:line-through;color:#a3a19d"' : ''}>${item.text}</span></li>`
    ).join('')
    return `<ul class="task-list">${items}</ul>`
  },
}

// @[title](table:tableName) 表引用链接
const tableRefExtension = {
  name: 'tableRef',
  level: 'inline' as const,
  start(src: string) { return src.indexOf('@[') },
  tokenizer(src: string) {
    const match = src.match(/^@\[([^\]]*)\]\(table:([^)]+)\)/)
    if (match) {
      return {
        type: 'tableRef', raw: match[0],
        title: match[1], tableName: match[2],
      }
    }
    return undefined
  },
  renderer(token: any) {
    const title = token.title || token.tableName
    return `<a class="table-ref" href="/tables/${token.tableName}" data-table="${token.tableName}">📊 ${title}</a>`
  },
}

marked.use({
  extensions: [highlightExtension, taskListExtension, embedExtension, tableRefExtension],
  gfm: true,
  breaks: false,
})

export function renderMarkdown(md: string): string {
  if (!md) return ''
  return (marked.parse(md, { async: false }) as string).trim()
}
