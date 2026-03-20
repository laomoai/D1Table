<template>
  <div class="note-editor" :class="{ readonly: !editable, 'preview-only': viewMode === 'preview' }">
    <!-- Toolbar -->
    <div v-if="editable" class="editor-bar">
      <div class="view-tabs">
        <button class="view-tab" :class="{ active: viewMode === 'split' }" @click="viewMode = 'split'" title="Split view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
            <rect x="1" y="1" width="12" height="12" rx="1"/><line x1="7" y1="1" x2="7" y2="13"/>
          </svg>
        </button>
        <button class="view-tab" :class="{ active: viewMode === 'editor' }" @click="viewMode = 'editor'" title="Editor only">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
            <rect x="1" y="1" width="12" height="12" rx="1"/>
            <line x1="3.5" y1="4" x2="10.5" y2="4"/><line x1="3.5" y1="7" x2="10.5" y2="7"/><line x1="3.5" y1="10" x2="8" y2="10"/>
          </svg>
        </button>
        <button class="view-tab" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'" title="Preview only">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3">
            <circle cx="7" cy="7" r="3"/><path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"/>
          </svg>
        </button>
      </div>
      <div class="bar-actions">
        <button class="bar-btn" title="Insert table reference" @click="emit('insert-table-ref')">
          <span style="font-size:13px">📊</span>
          <span class="bar-btn-label">Table</span>
        </button>
        <button class="bar-btn" title="Import file to this note" @click="triggerAppendImport">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 1v8m0 0L4.5 6.5M7 9l2.5-2.5"/><path d="M2 10v2h10v-2"/>
          </svg>
          <span class="bar-btn-label">Import</span>
        </button>
        <button class="bar-btn" title="Export this note" @click="emit('export')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 9V1m0 0L4.5 3.5M7 1l2.5 2.5"/><path d="M2 10v2h10v-2"/>
          </svg>
          <span class="bar-btn-label">Export</span>
        </button>
      </div>
      <div class="bar-info">
        <span class="bar-stat">Ln {{ cursorLine }}, Col {{ cursorCol }}</span>
        <span class="bar-stat">{{ wordCount }} words</span>
      </div>
      <input ref="appendFileInput" type="file" accept=".md,.markdown,.txt" style="display:none" @change="handleAppendImport" />
    </div>

    <!-- Content area -->
    <div class="editor-body">
      <!-- CodeMirror editor -->
      <div v-show="viewMode !== 'preview'" class="editor-pane" ref="editorContainer" :style="editorPaneStyle"></div>
      <!-- Drag splitter -->
      <div v-if="viewMode === 'split'" class="splitter" @mousedown="startDrag"></div>
      <!-- Preview -->
      <div v-show="viewMode !== 'editor'" class="preview-pane" v-html="previewHtml" :style="previewPaneStyle" @click="handlePreviewClick"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(defineProps<{
  modelValue?: string
  editable?: boolean
}>(), {
  modelValue: '',
  editable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'blur': []
  'export': []
  'insert-table-ref': []
}>()

const router = useRouter()
const appendFileInput = ref<HTMLInputElement | null>(null)

const editorContainer = ref<HTMLElement | null>(null)
const editorView = shallowRef<EditorView | null>(null)
const viewMode = ref<'split' | 'editor' | 'preview'>('split')
const cursorLine = ref(1)
const cursorCol = ref(1)

// ── Splitter drag ──────────────────────────────────────────
const splitRatio = ref(0.5) // 0..1, editor share

const editorPaneStyle = computed(() => {
  if (viewMode.value !== 'split') return {}
  return { flex: `0 0 ${splitRatio.value * 100}%` }
})
const previewPaneStyle = computed(() => {
  if (viewMode.value !== 'split') return {}
  return { flex: '1' }
})

function startDrag(e: MouseEvent) {
  e.preventDefault()
  const body = document.querySelector('.editor-body') as HTMLElement
  if (!body) return
  const rect = body.getBoundingClientRect()

  function onMove(ev: MouseEvent) {
    const ratio = (ev.clientX - rect.left) / rect.width
    splitRatio.value = Math.max(0.2, Math.min(0.8, ratio))
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Prevent feedback loop
let isExternalUpdate = false

const previewHtml = computed(() => renderMarkdown(props.modelValue))
const wordCount = computed(() => {
  const text = props.modelValue.trim()
  if (!text) return 0
  return text.split(/\s+/).length
})

// CodeMirror theme
const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px' },
  '.cm-content': {
    fontFamily: "'SF Mono', 'Fira Code', Monaco, 'Cascadia Code', monospace",
    padding: '16px 0',
    lineHeight: '1.7',
  },
  '.cm-line': { padding: '0 20px' },
  '.cm-gutters': {
    background: '#fbfbfa',
    color: '#c4c4c0',
    border: 'none',
    minWidth: '40px',
  },
  '.cm-activeLineGutter': { background: '#f0f0ee', color: '#787774' },
  '.cm-activeLine': { background: 'rgba(55, 53, 47, 0.03)' },
  '.cm-selectionMatch': { background: '#fff3bf' },
  '.cm-cursor': { borderLeftColor: '#37352f' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'rgba(35, 131, 226, 0.15)',
  },
  '.cm-scroller': { overflow: 'auto' },
})

function createEditor() {
  if (!editorContainer.value) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !isExternalUpdate) {
      const value = update.state.doc.toString()
      emit('update:modelValue', value)
    }
    if (update.selectionSet) {
      const pos = update.state.selection.main.head
      const line = update.state.doc.lineAt(pos)
      cursorLine.value = line.number
      cursorCol.value = pos - line.from + 1
    }
  })

  const blurHandler = EditorView.domEventHandlers({
    blur() { emit('blur') },
  })

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      bracketMatching(),
      highlightSelectionMatches(),
      history(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      editorTheme,
      updateListener,
      blurHandler,
      EditorView.lineWrapping,
      EditorState.readOnly.of(!props.editable),
    ],
  })

  editorView.value = new EditorView({
    state,
    parent: editorContainer.value,
  })
}

onMounted(() => {
  nextTick(() => createEditor())
})

onBeforeUnmount(() => {
  editorView.value?.destroy()
})

// Sync external value changes
watch(() => props.modelValue, (val) => {
  if (!editorView.value) return
  const current = editorView.value.state.doc.toString()
  if (val !== current) {
    isExternalUpdate = true
    editorView.value.dispatch({
      changes: { from: 0, to: current.length, insert: val },
    })
    isExternalUpdate = false
  }
})

watch(() => props.editable, () => {
  // Recreate editor when editable changes
  editorView.value?.destroy()
  nextTick(() => createEditor())
})

/** Intercept internal links in preview pane and use Vue Router */
function handlePreviewClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('a')
  if (!target) return
  const href = target.getAttribute('href')
  if (!href) return
  // Internal links: start with / but not //
  if (href.startsWith('/') && !href.startsWith('//')) {
    e.preventDefault()
    router.push(href)
  }
}

function triggerAppendImport() {
  if (appendFileInput.value) {
    appendFileInput.value.value = ''
    appendFileInput.value.click()
  }
}

async function handleAppendImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const content = await file.text()
  insertAtEnd(content)
}

/** Append text at cursor or end */
function appendContent(text: string) {
  if (!editorView.value) return
  const state = editorView.value.state
  const pos = state.selection.main.head
  editorView.value.dispatch({
    changes: { from: pos, insert: text },
  })
}

/** Insert text at the end */
function insertAtEnd(text: string) {
  if (!editorView.value) return
  const len = editorView.value.state.doc.length
  const sep = len > 0 ? '\n\n' : ''
  editorView.value.dispatch({
    changes: { from: len, insert: sep + text },
  })
}

defineExpose({
  getContent: () => editorView.value?.state.doc.toString() ?? props.modelValue,
  focus: () => editorView.value?.focus(),
  appendContent,
  insertAtEnd,
})
</script>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
/* Toolbar */
.editor-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid #e9e9e7;
  flex-shrink: 0;
  background: #fbfbfa;
}
.view-tabs {
  display: flex;
  gap: 2px;
  background: rgba(55, 53, 47, 0.04);
  border-radius: 4px;
  padding: 2px;
}
.view-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: none;
  border-radius: 3px;
  cursor: pointer;
  color: #a3a19d;
  transition: all 0.1s;
}
.view-tab:hover { color: #37352f; background: rgba(55, 53, 47, 0.08); }
.view-tab.active { color: #37352f; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.bar-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
  margin-right: 12px;
}
.bar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  color: #a3a19d;
  font-size: 11px;
  transition: all 0.1s;
}
.bar-btn:hover { color: #37352f; background: rgba(55, 53, 47, 0.08); }
.bar-btn-label { font-weight: 500; }
.bar-info {
  display: flex;
  gap: 12px;
}
.bar-stat {
  font-size: 11px;
  color: #b3b0ab;
  font-family: 'SF Mono', Monaco, monospace;
}
/* Content area */
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.editor-pane {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.splitter {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
  transition: background 0.15s;
}
.splitter::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: 2px;
  width: 1px;
  background: #e9e9e7;
}
.splitter:hover {
  background: rgba(35, 131, 226, 0.15);
}
.splitter:hover::after {
  background: #2383e2;
}
.editor-pane :deep(.cm-editor) {
  height: 100%;
}
.preview-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
  font-size: 15px;
  line-height: 1.7;
  color: #37352f;
}
/* Preview only — no border */
.preview-only .preview-pane {
  border-left: none;
}
/* Preview styles */
.preview-pane :deep(h1) { font-size: 1.875em; font-weight: 700; margin: 0.8em 0 0.4em; border-bottom: 1px solid #e9e9e7; padding-bottom: 0.2em; }
.preview-pane :deep(h2) { font-size: 1.5em; font-weight: 600; margin: 0.7em 0 0.3em; }
.preview-pane :deep(h3) { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.2em; }
.preview-pane :deep(p) { margin: 0.5em 0; }
.preview-pane :deep(ul), .preview-pane :deep(ol) { padding-left: 1.5em; margin: 0.4em 0; }
.preview-pane :deep(blockquote) {
  border-left: 3px solid #e9e9e7;
  padding-left: 16px;
  margin: 0.6em 0;
  color: #787774;
}
.preview-pane :deep(pre) {
  background: #f7f7f5;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
  overflow-x: auto;
  margin: 0.6em 0;
}
.preview-pane :deep(code) {
  background: rgba(135, 131, 120, 0.15);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.9em;
}
.preview-pane :deep(pre code) { background: none; padding: 0; }
.preview-pane :deep(table) { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
.preview-pane :deep(th), .preview-pane :deep(td) {
  border: 1px solid #e9e9e7;
  padding: 8px 12px;
  text-align: left;
}
.preview-pane :deep(th) { background: #f7f7f5; font-weight: 600; }
.preview-pane :deep(mark) { background: #fff3bf; padding: 0.1em 0; }
.preview-pane :deep(hr) { border: none; border-top: 1px solid #e9e9e7; margin: 1.2em 0; }
.preview-pane :deep(img) { max-width: 100%; border-radius: 4px; }
.preview-pane :deep(a) { color: #2383e2; text-decoration: none; }
.preview-pane :deep(a:hover) { text-decoration: underline; }
/* Table reference link */
.preview-pane :deep(.table-ref) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px 1px 4px;
  background: rgba(55, 53, 47, 0.06);
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  font-size: 0.9em;
  color: #37352f;
  text-decoration: none;
  font-weight: 500;
  transition: background 0.1s;
}
.preview-pane :deep(.table-ref:hover) {
  background: rgba(55, 53, 47, 0.1);
  text-decoration: none;
}
/* Task list */
.preview-pane :deep(.task-list) { list-style: none; padding-left: 0; }
.preview-pane :deep(.task-item) { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.preview-pane :deep(.task-item input) { margin: 0; }
/* Embed block */
.preview-pane :deep(.md-embed) {
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  margin: 0.6em 0;
  overflow: hidden;
}
.preview-pane :deep(.md-embed-header) {
  padding: 8px 12px;
  background: #f7f7f5;
  border-bottom: 1px solid #e9e9e7;
  font-size: 13px;
  font-weight: 600;
  color: #37352f;
}
.preview-pane :deep(.md-embed-badge) {
  font-size: 10px;
  background: rgba(55, 53, 47, 0.08);
  padding: 1px 6px;
  border-radius: 8px;
  color: #787774;
  font-weight: 500;
  margin-left: 6px;
}
.preview-pane :deep(.md-embed-hint) {
  padding: 12px;
  font-size: 12px;
  color: #a3a19d;
}
/* Readonly mode */
.readonly .editor-pane { display: none; }
.readonly .preview-pane { border-left: none; }
</style>
