<template>
  <div class="kbd-page">
    <div class="kbd-inner">
      <!-- Back button -->
      <button class="kbd-back" @click="router.push('/knowledge-base')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Knowledge Base
      </button>

      <!-- Loading -->
      <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

      <template v-else-if="rootNote">
        <!-- Root note header -->
        <div class="kbd-header">
          <div class="kbd-header-icon">
            <span v-if="rootNote.icon && !rootNote.icon.startsWith('ion:')">{{ rootNote.icon }}</span>
            <IonIcon v-else-if="rootNote.icon" :name="rootNote.icon.slice(4)" :size="32" />
            <svg v-else width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9b9a97" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <h1 class="kbd-title">{{ rootNote.title }}</h1>
          <div class="kbd-actions">
            <button class="kbd-action-btn" @click="showSettings = true" title="Edit cover & description">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button class="kbd-action-btn" @click="addChildNote" title="New sub-note (returns to sidebar)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <!-- Root note content preview -->
        <div v-if="rootNote.content" class="kbd-root-content preview-pane" v-html="rootContentHtml" />

        <!-- Archived children -->
        <div class="kbd-section">
          <h2 class="kbd-section-title">Archived Notes <span class="kbd-section-count">{{ archivedChildren.length }}</span></h2>
          <div v-if="archivedChildren.length === 0" class="kbd-empty-children">No archived notes</div>
          <div v-else class="kbd-children-list">
            <div
              v-for="child in archivedChildren"
              :key="child.id"
              class="kbd-child-item"
            >
              <div class="kbd-child-left" @click="previewNote(child.id)">
                <span class="kbd-child-icon">
                  <span v-if="child.icon && !child.icon.startsWith('ion:')">{{ child.icon }}</span>
                  <IonIcon v-else-if="child.icon" :name="child.icon.slice(4)" :size="16" />
                  <IonIcon v-else name="DocumentOutline" :size="16" />
                </span>
                <span class="kbd-child-title">{{ child.title }}</span>
                <span class="kbd-child-date">{{ formatDate(child.archived_at) }}</span>
              </div>
              <div class="kbd-child-actions">
                <button class="kbd-child-btn" @click="unarchiveChild(child.id)" title="Restore to sidebar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Settings modal -->
      <AppModal v-model:show="showSettings" title="Knowledge Base Settings" width="480px" height="auto">
        <div class="kbd-settings-form">
          <label class="kbd-label">Description</label>
          <textarea
            v-model="settingsDescription"
            class="kbd-textarea"
            placeholder="A brief description of this knowledge base..."
            rows="3"
          />
          <div class="kbd-settings-footer">
            <button class="kbd-btn" @click="showSettings = false">Cancel</button>
            <button class="kbd-btn primary" @click="saveSettings">Save</button>
          </div>
        </div>
      </AppModal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { notesApi, type Note } from '@/api/client'
import { renderMarkdown } from '@/utils/markdown'
import { openNotePreview } from '@/utils/notePreview'
import IonIcon from '@/components/IonIcon.vue'
import AppModal from '@/components/AppModal.vue'
import DOMPurify from 'dompurify'

const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const message = useMessage()

const rootId = computed(() => route.params.rootId as string)

const { data: rootNote, isLoading } = useQuery({
  queryKey: computed(() => ['notes', rootId.value]),
  queryFn: () => notesApi.getNote(rootId.value),
})

const { data: archivedChildrenData } = useQuery({
  queryKey: computed(() => ['notes', rootId.value, 'archived-children']),
  queryFn: () => notesApi.getArchivedChildren(rootId.value),
})

const archivedChildren = computed(() => archivedChildrenData.value ?? [])

const rootContentHtml = computed(() => {
  if (!rootNote.value?.content) return ''
  return DOMPurify.sanitize(renderMarkdown(rootNote.value.content))
})

function formatDate(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString()
}

function previewNote(noteId: string) {
  openNotePreview(noteId)
}

async function unarchiveChild(noteId: string) {
  try {
    await notesApi.unarchiveNote(noteId)
    message.success('Restored to sidebar')
    queryClient.invalidateQueries({ queryKey: ['notes'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}

async function addChildNote() {
  try {
    const result = await notesApi.createNote({ title: 'Untitled', parent_id: rootId.value })
    queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] })
    router.push(`/notes/${result.id}`)
  } catch (err) {
    message.error((err as Error).message)
  }
}

// Settings
const showSettings = ref(false)
const settingsDescription = ref('')

function openSettings() {
  settingsDescription.value = rootNote.value?.content ? '' : ''
  showSettings.value = true
}

async function saveSettings() {
  try {
    await notesApi.updateNote(rootId.value, {
      description: settingsDescription.value || null,
    })
    queryClient.invalidateQueries({ queryKey: ['notes', rootId.value] })
    queryClient.invalidateQueries({ queryKey: ['notes', 'archived-roots'] })
    showSettings.value = false
    message.success('Settings saved')
  } catch (err) {
    message.error((err as Error).message)
  }
}
</script>

<style scoped>
.kbd-page {
  height: 100%;
  overflow-y: auto;
  background: #fff;
  color: #37352f;
}

.kbd-inner {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

.kbd-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 13px;
  color: #787774;
  cursor: pointer;
  margin-bottom: 24px;
  transition: background 0.12s, color 0.12s;
}

.kbd-back:hover {
  background: #f1f1ef;
  color: #37352f;
}

.kbd-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.kbd-header-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.kbd-title {
  font-size: 28px;
  font-weight: 700;
  color: #37352f;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kbd-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.kbd-action-btn {
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

.kbd-action-btn:hover {
  background: #f1f1ef;
  color: #37352f;
}

.kbd-root-content {
  padding: 20px 24px;
  background: #f9f9f8;
  border-radius: 8px;
  margin-bottom: 32px;
  font-size: 15px;
  line-height: 1.7;
}

/* Reuse preview-pane markdown styles */
.preview-pane :deep(h1) { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
.preview-pane :deep(h2) { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.2em; }
.preview-pane :deep(h3) { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; }
.preview-pane :deep(p) { margin: 0.4em 0; }
.preview-pane :deep(ul), .preview-pane :deep(ol) { padding-left: 1.5em; margin: 0.3em 0; }
.preview-pane :deep(blockquote) { border-left: 3px solid #e9e9e7; padding-left: 16px; margin: 0.5em 0; color: #787774; }
.preview-pane :deep(pre) { background: #f0f0ee; border-radius: 4px; padding: 12px 16px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; overflow-x: auto; }
.preview-pane :deep(code) { background: rgba(135, 131, 120, 0.15); border-radius: 3px; padding: 0.2em 0.4em; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em; }
.preview-pane :deep(pre code) { background: none; padding: 0; }
.preview-pane :deep(a) { color: #2383e2; text-decoration: none; }
.preview-pane :deep(a:hover) { text-decoration: underline; }

.kbd-section {
  margin-top: 8px;
}

.kbd-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #37352f;
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.kbd-section-count {
  font-size: 12px;
  font-weight: 500;
  color: #787774;
  background: #f1f1ef;
  padding: 2px 8px;
  border-radius: 10px;
}

.kbd-empty-children {
  padding: 40px;
  text-align: center;
  color: #9b9a97;
  font-size: 14px;
}

.kbd-children-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kbd-child-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 6px;
  transition: background 0.12s;
}

.kbd-child-item:hover {
  background: #f7f7f5;
}

.kbd-child-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.kbd-child-icon {
  display: flex;
  align-items: center;
  color: #787774;
  flex-shrink: 0;
}

.kbd-child-title {
  font-size: 14px;
  color: #37352f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kbd-child-date {
  font-size: 12px;
  color: #9b9a97;
  flex-shrink: 0;
}

.kbd-child-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s;
}

.kbd-child-item:hover .kbd-child-actions {
  opacity: 1;
}

.kbd-child-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #787774;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.kbd-child-btn:hover {
  background: #e9e9e7;
  color: #37352f;
}

/* Settings modal */
.kbd-settings-form {
  display: flex;
  flex-direction: column;
}

.kbd-label {
  font-size: 14px;
  font-weight: 500;
  color: #37352f;
  margin-bottom: 6px;
}

.kbd-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  color: #37352f;
  resize: vertical;
  font-family: inherit;
}

.kbd-textarea:focus {
  border-color: #2383e2;
  box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.2);
}

.kbd-settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.kbd-btn {
  padding: 8px 20px;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  color: #37352f;
  cursor: pointer;
  transition: all 0.15s;
}

.kbd-btn:hover { background: #f7f7f5; }
.kbd-btn.primary { background: #2383e2; color: #fff; border-color: #2383e2; }
.kbd-btn.primary:hover { background: #1b6ec2; }
</style>
