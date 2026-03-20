<template>
  <div class="notes-page">
    <!-- Notes sidebar list -->
    <div class="notes-sidebar">
      <div class="notes-sidebar-header">
        <span class="notes-sidebar-title">Notes</span>
        <div class="notes-header-actions">
          <button class="notes-action-btn" @click="showImportExport = true" title="Import / Export">⇅</button>
          <button class="notes-add-btn" @click="createNewNote" title="New Note">+</button>
        </div>
      </div>

      <div class="notes-search">
        <input
          v-model="searchQuery"
          class="notes-search-input"
          placeholder="Search notes..."
        />
      </div>

      <div class="notes-list">
        <n-spin v-if="treeLoading" size="small" style="padding: 20px; display: flex; justify-content: center;" />
        <div v-else-if="filteredNotes.length === 0" class="notes-empty">
          {{ searchQuery ? 'No matching notes' : 'No notes yet' }}
        </div>
        <template v-else>
          <NoteTreeItem
            v-for="note in filteredNotes"
            :key="note.id"
            :note="note"
            :children="childrenMap.get(note.id) ?? []"
            :children-map="childrenMap"
            :active-id="activeNoteId"
            :expanded-ids="expandedFolders"
            :drop-target-id="dropState.id"
            :drop-position="dropState.position"
            @select="selectNote"
            @toggle="toggleFolder"
            @create-child="createChildNote"
            @delete="confirmDeleteNote"
            @reorder="handleReorder"
            @update:drop-state="dropState = $event"
          />
        </template>
      </div>
    </div>

    <!-- Editor area -->
    <div class="notes-editor-area">
      <n-spin v-if="activeNoteId && !noteReady" style="padding: 60px; display: flex; justify-content: center;" />
      <template v-else-if="activeNoteId && noteReady && activeNote">
        <div class="note-header">
          <div class="note-title-row">
            <button class="note-icon-btn" @click="showIconPicker = true" :title="activeNote.icon ? 'Change icon' : 'Add icon'">
              <span v-if="activeNote.icon && !activeNote.icon.startsWith('ion:')" class="note-icon-emoji">{{ activeNote.icon }}</span>
              <IonIcon v-else-if="activeNote.icon" :name="activeNote.icon.slice(4)" :size="22" />
              <span v-else class="note-icon-placeholder">📄</span>
            </button>
            <input
              v-model="noteTitle"
              class="note-title-input"
              placeholder="Untitled"
              @blur="saveTitle"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>
          <div class="note-meta">
            <span v-if="activeNote.updated_at" class="note-time">
              Updated {{ formatTime(activeNote.updated_at) }}
            </span>
            <span v-if="saving" class="note-saving">Saving...</span>
            <span v-else-if="lastSaved" class="note-saved">Saved</span>
          </div>
        </div>
        <NoteEditor
          ref="noteEditorRef"
          v-model="noteContent"
          @blur="saveContent"
          @export="exportCurrentNote"
          @insert-table-ref="showTablePicker = true"
        />
        <!-- Sub-pages listing -->
        <div v-if="activeSubPages.length > 0" class="subpages-section">
          <div class="subpages-header">
            <span class="subpages-title">📂 Sub-pages ({{ activeSubPages.length }})</span>
            <button class="subpages-add" @click="createChildNote(activeNoteId!)">+ Add</button>
          </div>
          <div class="subpages-list">
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
import { ref, computed, watch, nextTick, defineAsyncComponent, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery, useQueryClient, useMutation } from '@tanstack/vue-query'
import { NSpin, useMessage, useDialog } from 'naive-ui'
import { api, notesApi, type NoteListItem, type TableMeta } from '@/api/client'
import NoteEditor from '@/components/NoteEditor.vue'
import NoteTreeItem from '@/components/NoteTreeItem.vue'
import AppModal from '@/components/AppModal.vue'
import IonIcon from '@/components/IonIcon.vue'

const IconPicker = defineAsyncComponent(() => import('@/components/IconPicker.vue'))

const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const queryClient = useQueryClient()
const showIconPicker = ref(false)
const showImportExport = ref(false)
const showTablePicker = ref(false)
const tablePickerSearch = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const importMode = ref<'new-single' | 'new-batch' | 'append'>('new-single')
const importProgress = ref('')
const noteEditorRef = ref<InstanceType<typeof NoteEditor> | null>(null)

// ── Notes tree ──────────────────────────────────────────────
const { data: treeData, isLoading: treeLoading } = useQuery({
  queryKey: ['notes', 'tree'],
  queryFn: notesApi.getTree,
})

const rootNotes = computed(() =>
  (treeData.value ?? []).filter(n => !n.parent_id)
)

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

// ── Search ──────────────────────────────────────────────────
const searchQuery = ref('')

const filteredNotes = computed(() => {
  if (!searchQuery.value.trim()) return rootNotes.value
  const q = searchQuery.value.toLowerCase()
  return (treeData.value ?? []).filter(n =>
    n.title.toLowerCase().includes(q)
  )
})

// ── Drag reorder ────────────────────────────────────────────
const dropState = ref<{ id: string | null; position: 'above' | 'child' | null }>({ id: null, position: null })

async function handleReorder({ dragId, dropId, mode }: { dragId: string; dropId: string; mode: 'above' | 'child' }) {
  const allNotes = treeData.value ?? []
  const dropNote = allNotes.find(n => n.id === dropId)
  if (!dropNote) return

  try {
    if (mode === 'child') {
      // Make dragged note a child of the drop target
      await notesApi.updateNote(dragId, { parent_id: dropId, sort_order: 0 })
      expandedFolders.value.add(dropId)
    } else {
      // Place before the drop target at same level
      const siblings = allNotes.filter(n => n.parent_id === dropNote.parent_id)
      const dropIndex = siblings.indexOf(dropNote)
      const newOrder = dropIndex > 0
        ? Math.floor((siblings[dropIndex - 1].sort_order + dropNote.sort_order) / 2)
        : dropNote.sort_order - 1

      const updates: Record<string, unknown> = { sort_order: newOrder, parent_id: dropNote.parent_id ?? null }
      await notesApi.updateNote(dragId, updates)
    }
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

// ── Folder expand/collapse ──────────────────────────────────
const expandedFolders = ref(new Set<string>())

function toggleFolder(id: string) {
  if (expandedFolders.value.has(id)) {
    expandedFolders.value.delete(id)
  } else {
    expandedFolders.value.add(id)
  }
}

// ── Active note state ────────────────────────────────────────
const activeNoteId = ref<string | null>(null)
const noteTitle = ref('')
const noteContent = ref('')
const saving = ref(false)
const lastSaved = ref(false)
// Snapshot of content as loaded from server — used to detect real changes
let savedContent = ''
let savedTitle = ''
// Auto-save timer
let saveTimer: ReturnType<typeof setTimeout> | null = null
// Whether we've loaded the note and are ready for editing
const noteReady = ref(false)

const { data: activeNote, isLoading: noteLoading } = useQuery({
  queryKey: computed(() => ['notes', activeNoteId.value]),
  queryFn: () => notesApi.getNote(activeNoteId.value!),
  enabled: computed(() => !!activeNoteId.value),
})

// When query returns data, populate editor — but only if it matches current note
watch(activeNote, (note) => {
  if (!note || note.id !== activeNoteId.value) return
  noteTitle.value = note.title
  noteContent.value = note.content
  savedTitle = note.title
  savedContent = note.content
  lastSaved.value = false
  nextTick(() => { noteReady.value = true })
})

/**
 * Central function for switching notes. All paths go through here:
 * - sidebar click, route change, create new, click subpage
 */
async function switchToNote(id: string | null) {
  if (id === activeNoteId.value) return

  // 1. Cancel pending auto-save timer
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }

  // 2. Save current note if there are unsaved changes
  if (activeNoteId.value && noteReady.value) {
    await flushSave()
  }

  // 3. Reset state and switch
  noteReady.value = false
  noteTitle.value = ''
  noteContent.value = ''
  savedContent = ''
  savedTitle = ''
  lastSaved.value = false
  activeNoteId.value = id
}

// Sidebar click
function selectNote(id: string) {
  switchToNote(id)
}

// Route param change (e.g. from table cell click)
watch(() => route.params.noteId, (id) => {
  if (id && typeof id === 'string') switchToNote(id)
})

// Initialize from route on mount
if (route.params.noteId) {
  activeNoteId.value = route.params.noteId as string
}

// ── Save logic (no race conditions) ─────────────────────────
/** Flush any pending changes immediately. Returns a promise. */
async function flushSave(): Promise<void> {
  if (!activeNoteId.value || !noteReady.value) return
  const id = activeNoteId.value

  // Save title if changed
  if (noteTitle.value.trim() && noteTitle.value.trim() !== savedTitle) {
    try {
      await notesApi.updateNote(id, { title: noteTitle.value.trim() })
      savedTitle = noteTitle.value.trim()
      queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    } catch (err) {
      message.error((err as Error).message)
    }
  }

  // Save content if changed
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
  try {
    await notesApi.updateNote(activeNoteId.value, { title: noteTitle.value.trim() })
    savedTitle = noteTitle.value.trim()
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    lastSaved.value = true
  } catch (err) {
    message.error((err as Error).message)
  }
  saving.value = false
}

async function saveContent() {
  if (!activeNoteId.value || !noteReady.value) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (noteContent.value === savedContent) return
  saving.value = true
  try {
    await notesApi.updateNote(activeNoteId.value, { content: noteContent.value })
    savedContent = noteContent.value
    queryClient.setQueryData(['notes', activeNoteId.value], (old: any) =>
      old ? { ...old, content: noteContent.value, updated_at: Math.floor(Date.now() / 1000) } : old
    )
    lastSaved.value = true
  } catch (err) {
    message.error((err as Error).message)
  }
  saving.value = false
}

// Auto-save: debounce content changes
watch(noteContent, () => {
  if (!activeNoteId.value || !noteReady.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveContent(), 1500)
})

// Cleanup on unmount
onBeforeUnmount(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  // Synchronously flush save if there are pending changes
  if (activeNoteId.value && noteReady.value && noteContent.value !== savedContent) {
    notesApi.updateNote(activeNoteId.value, { content: noteContent.value }).catch(() => {})
  }
})

// ── CRUD ──────────────────────────────────────────────────────
async function createNewNote() {
  try {
    const result = await notesApi.createNote({ title: 'Untitled' })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    switchToNote(result.id)
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function createChildNote(parentId: string) {
  try {
    const result = await notesApi.createNote({ title: 'Untitled', parent_id: parentId })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    expandedFolders.value.add(parentId)
    switchToNote(result.id)
  } catch (err) {
    message.error((err as Error).message)
  }
}

function confirmDeleteNote(id: string) {
  dialog.warning({
    title: 'Delete Note',
    content: 'This note and all its sub-notes will be permanently deleted.',
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await notesApi.deleteNote(id)
        queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
        if (activeNoteId.value === id) {
          noteReady.value = false
          activeNoteId.value = null
        }
        message.success('Note deleted')
      } catch (err) {
        message.error((err as Error).message)
      }
    },
  })
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

  // Fetch all note contents
  importProgress.value = 'Fetching notes...'
  const fullNotes: { title: string; content: string }[] = []
  for (const n of notes) {
    try {
      const full = await notesApi.getNote(n.id)
      fullNotes.push({ title: full.title, content: full.content })
    } catch { /* skip failed */ }
  }

  if (fullNotes.length === 1) {
    // Single note — just download .md
    const n = fullNotes[0]
    downloadFile(`${n.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`, n.content)
  } else {
    // Multiple notes — create a simple concatenated download
    // For a real zip we'd need a library; let's download individually
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
    // Append file content to current note at cursor
    const file = files[0]
    const content = await file.text()
    if (noteEditorRef.value) {
      noteEditorRef.value.insertAtEnd(content)
      // Trigger save
      await saveContent()
    }
    showImportExport.value = false
    message.success(`Appended content from ${file.name}`)
    return
  }

  // Import as new notes
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
/* Sidebar */
.notes-sidebar {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #e9e9e7;
  display: flex;
  flex-direction: column;
  background: #fbfbfa;
}
.notes-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}
.notes-sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #37352f;
}
.notes-add-btn {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  width: 26px;
  height: 26px;
  font-size: 16px;
  color: #787774;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}
.notes-add-btn:hover {
  background: rgba(55, 53, 47, 0.08);
  color: #37352f;
}
.notes-search {
  padding: 4px 12px 8px;
}
.notes-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  font-size: 13px;
  color: #37352f;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
}
.notes-search-input:focus {
  border-color: #b3b0ab;
}
.notes-search-input::placeholder {
  color: #b3b0ab;
}
.notes-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px;
}
.notes-empty {
  padding: 20px 16px;
  text-align: center;
  font-size: 13px;
  color: #a3a19d;
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
.note-icon-btn:hover {
  background: rgba(55, 53, 47, 0.06);
}
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
.note-title-input::placeholder {
  color: #c4c4c0;
}
.note-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e9e9e7;
}
.note-time {
  font-size: 12px;
  color: #a3a19d;
}
.note-saving {
  font-size: 12px;
  color: #b3b0ab;
}
.note-saved {
  font-size: 12px;
  color: #a3a19d;
}
.notes-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #a3a19d;
}
.placeholder-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}
.notes-placeholder p {
  font-size: 14px;
  margin: 0;
}
/* Sub-pages section */
.subpages-section {
  border-top: 1px solid #e9e9e7;
  padding: 12px 24px 16px;
  flex-shrink: 0;
}
.subpages-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.subpages-title {
  font-size: 13px;
  font-weight: 600;
  color: #787774;
}
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
.subpages-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
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
/* Header actions */
.notes-header-actions {
  display: flex;
  gap: 4px;
}
.notes-action-btn {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  width: 26px;
  height: 26px;
  font-size: 14px;
  color: #787774;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.1s;
}
.notes-action-btn:hover {
  background: rgba(55, 53, 47, 0.08);
  color: #37352f;
}
/* Import/Export modal */
.ie-section {
  padding-bottom: 16px;
}
.ie-section + .ie-section {
  border-top: 1px solid #e9e9e7;
  padding-top: 16px;
}
.ie-title {
  font-size: 14px;
  font-weight: 600;
  color: #37352f;
  margin: 0 0 4px;
}
.ie-desc {
  font-size: 13px;
  color: #787774;
  margin: 0 0 10px;
}
.ie-actions {
  display: flex;
  gap: 8px;
}
.ie-btn {
  padding: 6px 14px;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  color: #37352f;
  cursor: pointer;
  transition: all 0.1s;
}
.ie-btn:hover { background: #f7f7f5; }
.ie-btn.primary {
  background: #37352f;
  color: #fff;
  border-color: #37352f;
}
.ie-btn.primary:hover { background: #2f2d28; }
.ie-progress {
  margin-top: 12px;
  padding: 8px 12px;
  background: #f0f4ff;
  border-radius: 4px;
  font-size: 13px;
  color: #4f6ef7;
}
</style>
