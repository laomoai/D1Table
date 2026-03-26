<template>
  <div class="notes-page">
    <!-- Editor area (full width) -->
    <div class="notes-editor-area">
      <n-spin v-if="activeNoteId && !noteReady" style="padding: 60px; display: flex; justify-content: center;" />
      <template v-else-if="activeNoteId && noteReady && activeNote">
        <div class="note-header">
          <div class="note-title-row">
            <button class="note-icon-btn" @click="showIconPicker = true" :disabled="!!activeNote.is_locked" :title="activeNote.icon ? 'Change icon' : 'Add icon'">
              <span v-if="activeNote.icon && !activeNote.icon.startsWith('ion:')" class="note-icon-emoji">{{ activeNote.icon }}</span>
              <IonIcon v-else-if="activeNote.icon" :name="activeNote.icon.slice(4)" :size="22" />
              <span v-else class="note-icon-placeholder">📄</span>
            </button>
            <input
              v-model="noteTitle"
              class="note-title-input"
              placeholder="Untitled"
              :readonly="!!activeNote.is_locked"
              @blur="saveTitle"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>
          <div class="note-meta">
            <button class="note-lock-btn" @click="toggleNoteLock" :title="activeNote.is_locked ? 'Unlock note' : 'Lock note'">
              {{ activeNote.is_locked ? '🔒' : '🔓' }}
            </button>
            <button class="note-action-btn" @click="showImportExport = true" title="Import / Export">⇅</button>
            <span v-if="activeNote.updated_at" class="note-time">
              Updated {{ formatTime(activeNote.updated_at) }}
            </span>
            <span v-if="saveError" class="note-error">{{ saveError }}</span>
            <span v-else-if="saving" class="note-saving">Saving...</span>
            <span v-else-if="lastSaved" class="note-saved">Saved</span>
          </div>
        </div>
        <NoteEditor
          ref="noteEditorRef"
          v-model="noteContent"
          :editable="!activeNote.is_locked"
          @blur="saveContent"
          @export="exportCurrentNote"
          @insert-table-ref="showTablePicker = true"
        />
        <!-- Sub-pages listing -->
        <div v-if="activeSubPages.length > 0" class="subpages-section" :style="subpagesSectionStyle">
          <div class="subpages-resize-handle" @mousedown="startSubpagesResize" />
          <div class="subpages-header">
            <span class="subpages-title">📂 Sub-pages ({{ activeSubPages.length }})</span>
            <div class="subpages-header-actions">
              <button class="subpages-add" @click="createChildNote(activeNoteId!)">+ Add</button>
              <button class="subpages-minimize-btn" @click="toggleSubpagesMinimized" :title="subpagesMinimized ? 'Expand' : 'Minimize'">
                {{ subpagesMinimized ? '▲' : '▼' }}
              </button>
            </div>
          </div>
          <div v-show="!subpagesMinimized" class="subpages-list">
            <div
              v-for="sub in activeSubPages"
              :key="sub.id"
              class="subpage-item"
              @click="selectNote(sub.id)"
            >
              <span class="subpage-icon">{{ sub.icon || '📄' }}</span>
              <span class="subpage-name">{{ sub.title || 'Untitled' }}</span>
              <span class="subpage-time">{{ formatTime(sub.updated_at) }}</span>
              <span class="subpage-arrow">→</span>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="notes-placeholder">
        <div class="placeholder-icon">📝</div>
        <p>Select a note or create a new one</p>
      </div>
    </div>

    <!-- Icon picker modal -->
    <AppModal v-model:show="showIconPicker" title="Choose Icon" width="360px" height="auto">
      <IconPicker
        :current-icon="activeNote?.icon ?? null"
        @select="onIconSelect"
      />
    </AppModal>

    <!-- Table reference picker -->
    <AppModal v-model:show="showTablePicker" title="Insert Table Reference" width="400px" height="auto">
      <div class="tp-search">
        <input v-model="tablePickerSearch" class="tp-input" placeholder="Search tables..." />
      </div>
      <div class="tp-list">
        <div v-if="!filteredTables.length" class="tp-empty">No tables found</div>
        <div
          v-for="t in filteredTables"
          :key="t.name"
          class="tp-item"
          @click="insertTableRef(t)"
        >
          <span class="tp-icon">{{ t.icon && !t.icon.startsWith('ion:') ? t.icon : '📊' }}</span>
          <div class="tp-info">
            <span class="tp-name">{{ t.title || t.name }}</span>
            <span class="tp-meta">{{ t.name }} · {{ t.row_count ?? 0 }} rows</span>
          </div>
        </div>
      </div>
    </AppModal>

    <!-- Import / Export modal -->
    <AppModal v-model:show="showImportExport" title="Import / Export" width="480px" height="auto">
      <div class="ie-section">
        <h4 class="ie-title">Export</h4>
        <p class="ie-desc">Download notes as Markdown (.md) files</p>
        <div class="ie-actions">
          <button v-if="activeNoteId" class="ie-btn" @click="exportCurrentNote">Export current note</button>
          <button class="ie-btn primary" @click="exportAllNotes">Export all notes (.zip)</button>
        </div>
      </div>
      <div class="ie-section">
        <h4 class="ie-title">Import as new notes</h4>
        <p class="ie-desc">Each file becomes a new note</p>
        <div class="ie-actions">
          <button class="ie-btn" @click="triggerImport('new-single')">Single file</button>
          <button class="ie-btn primary" @click="triggerImport('new-batch')">Multiple files</button>
        </div>
      </div>
      <input ref="fileInputRef" type="file" accept=".md,.markdown,.txt" style="display:none" @change="handleImport" />
      <div v-if="importProgress" class="ie-progress">
        {{ importProgress }}
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, defineAsyncComponent, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { api, notesApi, type NoteListItem, type TableMeta } from '@/api/client'
const NoteEditor = defineAsyncComponent(() => import('@/components/NoteEditor.vue'))
import AppModal from '@/components/AppModal.vue'
import IonIcon from '@/components/IonIcon.vue'

const IconPicker = defineAsyncComponent(() => import('@/components/IconPicker.vue'))

const route = useRoute()
const router = useRouter()
const message = useMessage()
const queryClient = useQueryClient()
const showIconPicker = ref(false)
const showImportExport = ref(false)
const showTablePicker = ref(false)
const tablePickerSearch = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const importMode = ref<'new-single' | 'new-batch' | 'append'>('new-single')
const importProgress = ref('')
const noteEditorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

// ── Notes tree (for sub-pages) ───────────────────────────────
const { data: treeData } = useQuery({
  queryKey: ['notes', 'tree'],
  queryFn: notesApi.getTree,
})

const childrenMap = computed(() => {
  const map = new Map<string, NoteListItem[]>()
  for (const n of treeData.value ?? []) {
    if (n.parent_id) {
      const arr = map.get(n.parent_id) ?? []
      arr.push(n)
      map.set(n.parent_id, arr)
    }
  }
  return map
})

// ── Tables (for table picker) ────────────────────────────────
const { data: allTables } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const filteredTables = computed(() => {
  const q = tablePickerSearch.value.toLowerCase()
  return (allTables.value ?? []).filter(t =>
    !q || (t.title || t.name).toLowerCase().includes(q)
  )
})

function insertTableRef(t: TableMeta) {
  showTablePicker.value = false
  const ref = `@[${t.title || t.name}](table:${t.name})`
  if (noteEditorRef.value) {
    noteEditorRef.value.appendContent(ref)
  }
}

// ── Sub-pages for active note ────────────────────────────────
const activeSubPages = computed(() => {
  if (!activeNoteId.value) return []
  return childrenMap.value.get(activeNoteId.value) ?? []
})

// ── Active note state ────────────────────────────────────────
const activeNoteId = ref<string | null>(null)
const noteTitle = ref('')
const noteContent = ref('')
const saving = ref(false)
const lastSaved = ref(false)
const saveError = ref<string | null>(null)
let savedContent = ''
let savedTitle = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
const noteReady = ref(false)

const { data: activeNote } = useQuery({
  queryKey: computed(() => ['notes', activeNoteId.value]),
  queryFn: () => notesApi.getNote(activeNoteId.value!),
  enabled: computed(() => !!activeNoteId.value),
  refetchInterval: 5000,
})

watch(activeNote, (note) => {
  if (!note || note.id !== activeNoteId.value) return
  if (!noteReady.value) {
    noteTitle.value = note.title
    noteContent.value = note.content
    savedTitle = note.title
    savedContent = note.content
    lastSaved.value = false
    nextTick(() => { noteReady.value = true })
    return
  }
  // Auto-refresh: sync external changes only when local content is unchanged
  const hasLocalTitleChange = noteTitle.value.trim() !== savedTitle
  const hasLocalContentChange = noteContent.value !== savedContent
  if (!hasLocalTitleChange && note.title !== savedTitle) {
    noteTitle.value = note.title
    savedTitle = note.title
  }
  if (!hasLocalContentChange && note.content !== savedContent) {
    noteContent.value = note.content
    savedContent = note.content
  }
})

async function switchToNote(id: string | null) {
  if (id === activeNoteId.value) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (activeNoteId.value && noteReady.value) {
    await flushSave()
  }
  noteReady.value = false
  noteTitle.value = ''
  noteContent.value = ''
  savedContent = ''
  savedTitle = ''
  lastSaved.value = false
  activeNoteId.value = id
  const targetPath = id ? `/notes/${id}` : '/notes'
  if (route.path !== targetPath) {
    router.replace(targetPath)
  }
}

function selectNote(id: string) {
  switchToNote(id)
}

watch(() => route.params.noteId, (id) => {
  if (id && typeof id === 'string' && id !== activeNoteId.value) switchToNote(id)
})

if (route.params.noteId) {
  activeNoteId.value = route.params.noteId as string
}

// ── Save logic ───────────────────────────────────────────────
async function flushSave(): Promise<void> {
  if (!activeNoteId.value || !noteReady.value) return
  const id = activeNoteId.value

  if (noteTitle.value.trim() && noteTitle.value.trim() !== savedTitle) {
    try {
      await notesApi.updateNote(id, { title: noteTitle.value.trim() })
      savedTitle = noteTitle.value.trim()
      queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    } catch (err) {
      message.error((err as Error).message)
    }
  }

  if (noteContent.value !== savedContent) {
    try {
      await notesApi.updateNote(id, { content: noteContent.value })
      savedContent = noteContent.value
      queryClient.setQueryData(['notes', id], (old: any) =>
        old ? { ...old, content: noteContent.value, updated_at: Math.floor(Date.now() / 1000) } : old
      )
    } catch (err) {
      message.error((err as Error).message)
    }
  }
}

async function saveTitle() {
  if (!activeNoteId.value || !noteReady.value || !noteTitle.value.trim()) return
  if (noteTitle.value.trim() === savedTitle) return
  saving.value = true
  saveError.value = null
  try {
    await notesApi.updateNote(activeNoteId.value, { title: noteTitle.value.trim() })
    savedTitle = noteTitle.value.trim()
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    lastSaved.value = true
  } catch (err) {
    saveError.value = `Save failed: ${(err as Error).message}`
  }
  saving.value = false
}

async function saveContent() {
  if (!activeNoteId.value || !noteReady.value) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (noteContent.value === savedContent) return
  saving.value = true
  saveError.value = null
  try {
    await notesApi.updateNote(activeNoteId.value, { content: noteContent.value })
    savedContent = noteContent.value
    queryClient.setQueryData(['notes', activeNoteId.value], (old: any) =>
      old ? { ...old, content: noteContent.value, updated_at: Math.floor(Date.now() / 1000) } : old
    )
    lastSaved.value = true
  } catch (err) {
    saveError.value = `Save failed: ${(err as Error).message}`
  }
  saving.value = false
}

let lastSaveTime = 0
watch(noteContent, () => {
  if (!activeNoteId.value || !noteReady.value) return
  if (saveTimer) clearTimeout(saveTimer)
  const elapsed = Date.now() - lastSaveTime
  const delay = Math.max(1500, 3000 - elapsed)
  saveTimer = setTimeout(() => {
    lastSaveTime = Date.now()
    saveContent()
  }, delay)
})

onBeforeUnmount(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (activeNoteId.value && noteReady.value && noteContent.value !== savedContent) {
    notesApi.updateNote(activeNoteId.value, { content: noteContent.value }).catch(() => {})
  }
})

// ── CRUD ─────────────────────────────────────────────────────
async function createChildNote(parentId: string) {
  try {
    const result = await notesApi.createNote({ title: 'Untitled', parent_id: parentId })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    switchToNote(result.id)
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function toggleNoteLock() {
  if (!activeNoteId.value || !activeNote.value) return
  try {
    await notesApi.updateNote(activeNoteId.value, { is_locked: !activeNote.value.is_locked })
    queryClient.invalidateQueries({ queryKey: ['notes', activeNoteId.value] })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function onIconSelect(icon: string | null) {
  if (!activeNoteId.value) return
  showIconPicker.value = false
  try {
    await notesApi.updateNote(activeNoteId.value, { icon })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    queryClient.invalidateQueries({ queryKey: ['notes', activeNoteId.value] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString()
}

// ── Sub-pages resize & minimize ──────────────────────────────
const SUBPAGES_HEIGHT_KEY = 'notes-subpages-height'
const SUBPAGES_MINIMIZED_KEY = 'notes-subpages-minimized'
const subpagesHeight = ref(parseInt(localStorage.getItem(SUBPAGES_HEIGHT_KEY) || '0', 10) || 0)
const subpagesMinimized = ref(localStorage.getItem(SUBPAGES_MINIMIZED_KEY) === 'true')

const subpagesSectionStyle = computed(() => {
  if (subpagesMinimized.value) return { flexShrink: 0 }
  if (subpagesHeight.value > 0) {
    return { height: `${subpagesHeight.value}px`, flexShrink: 0 }
  }
  // Default: 20% of parent
  return { height: '20%', flexShrink: 0 }
})

function toggleSubpagesMinimized() {
  subpagesMinimized.value = !subpagesMinimized.value
  localStorage.setItem(SUBPAGES_MINIMIZED_KEY, String(subpagesMinimized.value))
}

function startSubpagesResize(e: MouseEvent) {
  if (subpagesMinimized.value) return
  e.preventDefault()
  const editorArea = (e.target as HTMLElement).closest('.notes-editor-area') as HTMLElement
  if (!editorArea) return
  const startY = e.clientY
  const section = (e.target as HTMLElement).closest('.subpages-section') as HTMLElement
  const startHeight = section.getBoundingClientRect().height

  function onMove(ev: MouseEvent) {
    const delta = startY - ev.clientY
    const newHeight = Math.max(60, Math.min(editorArea.getBoundingClientRect().height * 0.7, startHeight + delta))
    subpagesHeight.value = Math.round(newHeight)
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (subpagesHeight.value > 0) {
      localStorage.setItem(SUBPAGES_HEIGHT_KEY, String(subpagesHeight.value))
    }
  }
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── Import / Export ──────────────────────────────────────────
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportCurrentNote() {
  if (!activeNoteId.value || !activeNote.value) return
  const note = activeNote.value
  const filename = `${note.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`
  downloadFile(filename, note.content)
  message.success(`Exported: ${filename}`)
}

async function exportAllNotes() {
  const notes = treeData.value
  if (!notes?.length) { message.warning('No notes to export'); return }

  importProgress.value = 'Fetching notes...'
  const fullNotes: { title: string; content: string }[] = []
  for (const n of notes) {
    try {
      const full = await notesApi.getNote(n.id)
      fullNotes.push({ title: full.title, content: full.content })
    } catch { /* skip failed */ }
  }

  if (fullNotes.length === 1) {
    const n = fullNotes[0]
    downloadFile(`${n.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`, n.content)
  } else {
    for (const n of fullNotes) {
      downloadFile(`${n.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`, n.content)
    }
  }

  importProgress.value = ''
  showImportExport.value = false
  message.success(`Exported ${fullNotes.length} note(s)`)
}

function triggerImport(mode: 'new-single' | 'new-batch' | 'append') {
  importMode.value = mode
  nextTick(() => {
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
      fileInputRef.value.multiple = mode === 'new-batch'
      fileInputRef.value.click()
    }
  })
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  if (importMode.value === 'append') {
    const file = files[0]
    const content = await file.text()
    if (noteEditorRef.value) {
      noteEditorRef.value.insertAtEnd(content)
      await saveContent()
    }
    showImportExport.value = false
    message.success(`Appended content from ${file.name}`)
    return
  }

  importProgress.value = `Importing ${files.length} file(s)...`
  let imported = 0

  for (const file of Array.from(files)) {
    try {
      const content = await file.text()
      const h1Match = content.match(/^#\s+(.+)/m)
      const title = h1Match ? h1Match[1].trim() : file.name.replace(/\.(md|markdown|txt)$/i, '')

      await notesApi.createNote({ title, content })
      imported++
      importProgress.value = `Imported ${imported} of ${files.length}...`
    } catch (err) {
      message.error(`Failed to import ${file.name}: ${(err as Error).message}`)
    }
  }

  queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
  importProgress.value = ''
  showImportExport.value = false
  message.success(`Imported ${imported} note(s)`)
}
</script>

<style scoped>
.notes-page {
  display: flex;
  height: 100%;
  overflow: hidden;
}
/* Editor area */
.notes-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.note-header {
  padding: 20px 24px 0;
  flex-shrink: 0;
}
.note-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.note-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 24px;
  line-height: 1;
  transition: background 0.1s;
  flex-shrink: 0;
}
.note-icon-btn:hover { background: rgba(55, 53, 47, 0.06); }
.note-icon-emoji { font-size: 24px; }
.note-icon-placeholder { opacity: 0.4; font-size: 24px; }
.note-title-input {
  flex: 1;
  border: none;
  font-size: 28px;
  font-weight: 700;
  color: #37352f;
  outline: none;
  padding: 0;
  background: none;
  min-width: 0;
}
.note-title-input::placeholder { color: #c4c4c0; }
.note-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e9e9e7;
}
.note-lock-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0.6;
  transition: opacity 0.1s;
}
.note-lock-btn:hover { opacity: 1; }
.note-action-btn {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 13px;
  color: #787774;
  cursor: pointer;
  transition: all 0.1s;
}
.note-action-btn:hover { background: rgba(55,53,47,0.06); color: #37352f; }
.note-time { font-size: 12px; color: #a3a19d; }
.note-error { font-size: 12px; color: #e03e3e; font-weight: 500; }
.note-saving { font-size: 12px; color: #b3b0ab; }
.note-saved { font-size: 12px; color: #a3a19d; }
.notes-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #a3a19d;
}
.placeholder-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.notes-placeholder p { font-size: 14px; margin: 0; }
/* Sub-pages section */
.subpages-section {
  border-top: 1px solid #e9e9e7;
  padding: 0 24px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.subpages-resize-handle {
  height: 6px;
  cursor: row-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.subpages-resize-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 2px;
  transform: translateX(-50%);
  width: 32px;
  height: 3px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s;
}
.subpages-resize-handle:hover::after {
  background: #c4c4c0;
}
.subpages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.subpages-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.subpages-title { font-size: 13px; font-weight: 600; color: #787774; }
.subpages-add {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 11px;
  color: #787774;
  cursor: pointer;
  transition: all 0.1s;
}
.subpages-add:hover { background: rgba(55,53,47,0.06); color: #37352f; }
.subpages-minimize-btn {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 10px;
  color: #787774;
  cursor: pointer;
  transition: all 0.1s;
  line-height: 1;
}
.subpages-minimize-btn:hover { background: rgba(55,53,47,0.06); color: #37352f; }
.subpages-list { display: flex; flex-direction: column; gap: 2px; overflow-y: auto; flex: 1; min-height: 0; }
.subpage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
  color: #37352f;
}
.subpage-item:hover { background: rgba(55,53,47,0.06); }
.subpage-icon { font-size: 13px; flex-shrink: 0; }
.subpage-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subpage-time { font-size: 11px; color: #a3a19d; flex-shrink: 0; }
.subpage-arrow { color: #c4c4c0; font-size: 12px; flex-shrink: 0; }
/* Table picker */
.tp-search { margin-bottom: 12px; }
.tp-input {
  width: 100%; padding: 8px 12px; border: 1px solid #e9e9e7;
  border-radius: 4px; font-size: 13px; outline: none; color: #37352f;
}
.tp-input:focus { border-color: #b3b0ab; }
.tp-list { max-height: 300px; overflow-y: auto; }
.tp-empty { padding: 20px; text-align: center; color: #a3a19d; font-size: 13px; }
.tp-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 4px; cursor: pointer;
  transition: background 0.1s;
}
.tp-item:hover { background: rgba(55, 53, 47, 0.06); }
.tp-icon { font-size: 16px; flex-shrink: 0; }
.tp-info { display: flex; flex-direction: column; min-width: 0; }
.tp-name { font-size: 13px; font-weight: 500; color: #37352f; }
.tp-meta { font-size: 11px; color: #a3a19d; }
/* Import/Export modal */
.ie-section { padding-bottom: 16px; }
.ie-section + .ie-section { border-top: 1px solid #e9e9e7; padding-top: 16px; }
.ie-title { font-size: 14px; font-weight: 600; color: #37352f; margin: 0 0 4px; }
.ie-desc { font-size: 13px; color: #787774; margin: 0 0 10px; }
.ie-actions { display: flex; gap: 8px; }
.ie-btn {
  padding: 6px 14px; border: 1px solid #e9e9e7; border-radius: 4px;
  background: #fff; font-size: 13px; color: #37352f; cursor: pointer; transition: all 0.1s;
}
.ie-btn:hover { background: #f7f7f5; }
.ie-btn.primary { background: #37352f; color: #fff; border-color: #37352f; }
.ie-btn.primary:hover { background: #2f2d28; }
.ie-progress {
  margin-top: 12px; padding: 8px 12px; background: #f0f4ff;
  border-radius: 4px; font-size: 13px; color: #4f6ef7;
}
</style>
