<template>
  <Teleport to="body">
    <div v-if="noteId" class="note-preview-overlay" @click.self="close">
      <div class="note-preview-panel">
        <!-- Toolbar -->
        <div class="note-preview-toolbar">
          <div class="toolbar-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
            <input
              type="range"
              class="font-slider"
              min="12"
              max="22"
              :value="fontSize"
              @input="fontSize = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="font-size-label">{{ fontSize }}px</span>
          </div>
          <div class="toolbar-right">
            <button class="toolbar-btn" @click="goEdit" title="Edit in full editor">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="toolbar-btn" @click="close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Title -->
        <div v-if="note" class="note-preview-title">{{ note.title || 'Untitled' }}</div>

        <!-- Loading -->
        <div v-if="isLoading" class="note-preview-loading">
          <n-spin size="small" />
        </div>

        <!-- Content -->
        <div
          v-else-if="note"
          class="note-preview-content preview-pane"
          :style="{ fontSize: fontSize + 'px' }"
          v-html="renderedHtml"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin } from 'naive-ui'
import { notesApi, type Note } from '@/api/client'
import { renderMarkdown } from '@/utils/markdown'
import { notePreviewId, closeNotePreview } from '@/utils/notePreview'
import DOMPurify from 'dompurify'

const router = useRouter()

const noteId = notePreviewId
const note = ref<Note | null>(null)
const isLoading = ref(false)
const fontSize = ref(15)

const renderedHtml = computed(() => {
  if (!note.value?.content) return ''
  return DOMPurify.sanitize(renderMarkdown(note.value.content))
})

watch(noteId, async (id) => {
  if (!id) {
    note.value = null
    return
  }
  isLoading.value = true
  try {
    note.value = await notesApi.getNote(id)
  } catch {
    note.value = null
  } finally {
    isLoading.value = false
  }
})

function close() {
  closeNotePreview()
}

function goEdit() {
  const id = noteId.value
  close()
  if (id) router.push(`/notes/${id}`)
}
</script>

<style scoped>
.note-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
}

.note-preview-panel {
  width: 70%;
  max-height: 85vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.note-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #e9e9e7;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #787774;
}

.font-slider {
  width: 100px;
  height: 4px;
  accent-color: #37352f;
  cursor: pointer;
}

.font-size-label {
  font-size: 12px;
  color: #9b9a97;
  min-width: 32px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #787774;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toolbar-btn:hover {
  background: #f1f1ef;
  color: #37352f;
}

.note-preview-title {
  padding: 20px 24px 0;
  font-size: 24px;
  font-weight: 700;
  color: #37352f;
  flex-shrink: 0;
}

.note-preview-loading {
  display: flex;
  justify-content: center;
  padding: 60px;
}

.note-preview-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 40px;
  line-height: 1.7;
  color: #37352f;
}

/* Reuse preview-pane markdown styles */
.preview-pane :deep(h1) { font-size: 1.875em; font-weight: 700; margin: 0.8em 0 0.4em; border-bottom: 1px solid #e9e9e7; padding-bottom: 0.2em; }
.preview-pane :deep(h2) { font-size: 1.5em; font-weight: 600; margin: 0.7em 0 0.3em; }
.preview-pane :deep(h3) { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.2em; }
.preview-pane :deep(p) { margin: 0.5em 0; }
.preview-pane :deep(ul), .preview-pane :deep(ol) { padding-left: 1.5em; margin: 0.4em 0; }
.preview-pane :deep(blockquote) { border-left: 3px solid #e9e9e7; padding-left: 16px; margin: 0.6em 0; color: #787774; }
.preview-pane :deep(pre) { background: #f7f7f5; border-radius: 4px; padding: 12px 16px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; overflow-x: auto; margin: 0.6em 0; }
.preview-pane :deep(code) { background: rgba(135, 131, 120, 0.15); border-radius: 3px; padding: 0.2em 0.4em; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em; }
.preview-pane :deep(pre code) { background: none; padding: 0; }
.preview-pane :deep(table) { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
.preview-pane :deep(th), .preview-pane :deep(td) { border: 1px solid #e9e9e7; padding: 8px 12px; text-align: left; }
.preview-pane :deep(th) { background: #f7f7f5; font-weight: 600; }
.preview-pane :deep(mark) { background: #fff3bf; padding: 0.1em 0; }
.preview-pane :deep(hr) { border: none; border-top: 1px solid #e9e9e7; margin: 1.2em 0; }
.preview-pane :deep(img) { max-width: 100%; border-radius: 4px; }
.preview-pane :deep(a) { color: #2383e2; text-decoration: none; }
.preview-pane :deep(a:hover) { text-decoration: underline; }
.preview-pane :deep(.table-ref) { display: inline-flex; align-items: center; gap: 2px; padding: 1px 8px 1px 4px; background: rgba(55, 53, 47, 0.06); border: 1px solid #e9e9e7; border-radius: 4px; font-size: 0.9em; color: #37352f; text-decoration: none; font-weight: 500; }
.preview-pane :deep(.table-ref:hover) { background: rgba(55, 53, 47, 0.1); }
.preview-pane :deep(.task-list) { list-style: none; padding-left: 0; }
.preview-pane :deep(.task-item) { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.preview-pane :deep(.task-item input) { margin: 0; }
.preview-pane :deep(.md-embed) { border: 1px solid #e9e9e7; border-radius: 6px; margin: 0.6em 0; overflow: hidden; }
.preview-pane :deep(.md-embed-header) { padding: 8px 12px; background: #f7f7f5; border-bottom: 1px solid #e9e9e7; font-size: 13px; font-weight: 600; color: #37352f; }
.preview-pane :deep(.md-embed-badge) { font-size: 10px; background: rgba(55, 53, 47, 0.08); padding: 1px 6px; border-radius: 8px; color: #787774; font-weight: 500; margin-left: 6px; }
.preview-pane :deep(.md-embed-hint) { padding: 12px; font-size: 12px; color: #a3a19d; }
</style>
