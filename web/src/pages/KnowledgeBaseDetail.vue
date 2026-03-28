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
            <button class="kbd-action-btn" @click="openSettingsModal" title="Edit cover & description">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button class="kbd-action-btn" @click="addChildNote" title="New sub-note (returns to sidebar)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>

        <!-- Root note content preview (collapsible) -->
        <div v-if="rootNote.content" class="kbd-root-content-wrap">
          <div
            ref="contentRef"
            class="kbd-root-content preview-pane"
            :class="{ collapsed: !contentExpanded }"
            v-html="rootContentHtml"
          />
          <div v-if="contentOverflows" class="kbd-content-toggle">
            <button class="kbd-toggle-btn" @click="contentExpanded = !contentExpanded">
              {{ contentExpanded ? 'Collapse' : 'Show more' }}
              <svg :class="{ flipped: contentExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        <!-- Search -->
        <div class="kbd-search-wrap">
          <span class="kbd-search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            v-model="searchQuery"
            type="text"
            class="kbd-search-input"
            placeholder="Search archived notes..."
          />
        </div>

        <!-- Archived children tree -->
        <div class="kbd-section">
          <h2 class="kbd-section-title">Archived Notes <span class="kbd-section-count">{{ filteredRootNodes.length }}</span></h2>
          <div v-if="filteredRootNodes.length === 0" class="kbd-empty-children">{{ searchQuery ? 'No matching notes' : 'No archived notes' }}</div>
          <div v-else class="kbd-children-list">
            <KbTreeItem
              v-for="node in filteredRootNodes"
              :key="node.id"
              :node="node"
              :children-map="archivedChildrenMap"
              :expanded-ids="expandedIds"
              @preview="previewNote"
              @unarchive="unarchiveChild"
              @toggle="toggleExpand"
            />
          </div>
        </div>
      </template>

      <!-- Settings modal -->
      <AppModal v-model:show="showSettings" title="Knowledge Base Settings" width="480px" height="auto">
        <div class="kbd-settings-form">
          <label class="kbd-label">Cover Image</label>
          <ImageUpload :value="settingsCoverJson" @update:value="onCoverChange" />
          <label class="kbd-label" style="margin-top:16px">Description</label>
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
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { notesApi, type ArchivedChild, type ImageValue } from '@/api/client'
import { renderMarkdown } from '@/utils/markdown'
import { openNotePreview } from '@/utils/notePreview'
import IonIcon from '@/components/IonIcon.vue'
import AppModal from '@/components/AppModal.vue'
import KbTreeItem from '@/components/KbTreeItem.vue'
import ImageUpload from '@/components/ImageUpload.vue'
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

// Build tree from flat archived children list
const archivedChildrenMap = computed(() => {
  const map = new Map<string, ArchivedChild[]>()
  for (const c of archivedChildren.value) {
    if (!c.parent_id) continue
    const arr = map.get(c.parent_id) ?? []
    arr.push(c)
    map.set(c.parent_id, arr)
  }
  return map
})

const archivedIds = computed(() => new Set(archivedChildren.value.map(c => c.id)))

const archivedRootNodes = computed(() => {
  return archivedChildren.value.filter(c =>
    !c.parent_id || c.parent_id === rootId.value || !archivedIds.value.has(c.parent_id)
  )
})

// Search
const searchQuery = ref('')

const filteredRootNodes = computed(() => {
  if (!searchQuery.value) return archivedRootNodes.value
  const q = searchQuery.value.toLowerCase()
  // Find all nodes matching search, then include their ancestors up to root
  const matchingIds = new Set<string>()
  for (const c of archivedChildren.value) {
    if (c.title.toLowerCase().includes(q)) {
      matchingIds.add(c.id)
      // Walk up to mark parent chain as visible
      let parentId = c.parent_id
      while (parentId && parentId !== rootId.value) {
        matchingIds.add(parentId)
        const parent = archivedChildren.value.find(n => n.id === parentId)
        parentId = parent?.parent_id ?? null
      }
    }
  }
  return archivedRootNodes.value.filter(n => matchingIds.has(n.id))
})

const expandedIds = ref(new Set<string>())

// Auto-expand non-archived path nodes so the tree is visible by default
watch(archivedChildren, (children) => {
  const s = new Set(expandedIds.value)
  for (const c of children) {
    if (!c.archived_at) s.add(c.id) // path nodes default expanded
  }
  expandedIds.value = s
}, { immediate: true })

function toggleExpand(id: string) {
  const s = new Set(expandedIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  expandedIds.value = s
}

// Content collapse
const contentExpanded = ref(false)
const contentOverflows = ref(false)
const contentRef = ref<HTMLElement | null>(null)

const rootContentHtml = computed(() => {
  if (!rootNote.value?.content) return ''
  return DOMPurify.sanitize(renderMarkdown(rootNote.value.content))
})

function checkContentOverflow() {
  nextTick(() => {
    setTimeout(() => {
      const el = contentRef.value
      if (el) contentOverflows.value = el.scrollHeight > 200
    }, 50)
  })
}

watch(rootContentHtml, checkContentOverflow)
onMounted(checkContentOverflow)

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
const settingsCoverJson = ref<string | null>(null)

function openSettingsModal() {
  settingsDescription.value = (rootNote.value as any)?.description ?? ''
  const cover = (rootNote.value as any)?.cover
  settingsCoverJson.value = cover ? JSON.stringify({ thumb: cover, display: cover, name: 'cover', size: 0 }) : null
  showSettings.value = true
}

function onCoverChange(val: string | null) {
  settingsCoverJson.value = val
}

async function saveSettings() {
  try {
    let coverPath: string | null = null
    if (settingsCoverJson.value) {
      try {
        const img = JSON.parse(settingsCoverJson.value) as ImageValue
        coverPath = img.display
      } catch {}
    }
    await notesApi.updateNote(rootId.value, {
      description: settingsDescription.value || null,
      cover: coverPath,
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
.kbd-page { height: 100%; overflow-y: auto; background: #fff; color: #37352f; }
.kbd-inner { max-width: 960px; margin: 0 auto; padding: 32px 40px 80px; }

.kbd-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; background: none; border-radius: 6px; font-size: 13px; color: #787774; cursor: pointer; margin-bottom: 24px; transition: background 0.12s, color 0.12s; }
.kbd-back:hover { background: #f1f1ef; color: #37352f; }

.kbd-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.kbd-header-icon { font-size: 32px; line-height: 1; flex-shrink: 0; }
.kbd-title { font-size: 28px; font-weight: 700; color: #37352f; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kbd-actions { display: flex; gap: 4px; flex-shrink: 0; }
.kbd-action-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: 6px; background: transparent; color: #787774; cursor: pointer; transition: background 0.15s, color 0.15s; }
.kbd-action-btn:hover { background: #f1f1ef; color: #37352f; }

/* Collapsible root content */
.kbd-root-content-wrap { margin-bottom: 32px; }
.kbd-root-content { padding: 20px 24px; background: #f9f9f8; border-radius: 8px; font-size: 15px; line-height: 1.7; overflow: hidden; transition: max-height 0.3s ease; }
.kbd-root-content.collapsed { max-height: 200px; }
.kbd-content-toggle { text-align: center; margin-top: -1px; padding-top: 8px; }
.kbd-toggle-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border: 1px solid #e9e9e7; border-radius: 16px; background: #fff; font-size: 12px; color: #787774; cursor: pointer; transition: all 0.15s; }
.kbd-toggle-btn:hover { background: #f7f7f5; color: #37352f; }
.kbd-toggle-btn svg { transition: transform 0.2s; }
.kbd-toggle-btn svg.flipped { transform: rotate(180deg); }

/* Preview pane markdown */
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

/* Search */
.kbd-search-wrap { position: relative; margin-bottom: 20px; }
.kbd-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #787774; display: flex; align-items: center; pointer-events: none; }
.kbd-search-input { width: 100%; box-sizing: border-box; padding: 8px 14px 8px 34px; background: #f7f7f5; border: 1px solid transparent; border-radius: 6px; font-size: 13px; color: #37352f; outline: none; transition: background 0.15s, border-color 0.15s, box-shadow 0.15s; }
.kbd-search-input::placeholder { color: #9b9a97; }
.kbd-search-input:hover { background: #efefed; }
.kbd-search-input:focus { background: #fff; border-color: #e9e9e7; box-shadow: inset 0 0 0 1px rgba(35, 131, 226, 0.5), 0 0 0 2px rgba(35, 131, 226, 0.2); }

/* Section */
.kbd-section { margin-top: 8px; }
.kbd-section-title { font-size: 16px; font-weight: 600; color: #37352f; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }
.kbd-section-count { font-size: 12px; font-weight: 500; color: #787774; background: #f1f1ef; padding: 2px 8px; border-radius: 10px; }
.kbd-empty-children { padding: 40px; text-align: center; color: #9b9a97; font-size: 14px; }
.kbd-children-list { display: flex; flex-direction: column; }

/* Settings modal */
.kbd-settings-form { display: flex; flex-direction: column; }
.kbd-label { font-size: 14px; font-weight: 500; color: #37352f; margin-bottom: 6px; }
.kbd-textarea { width: 100%; padding: 8px 12px; border: 1px solid #e9e9e7; border-radius: 6px; font-size: 14px; outline: none; box-sizing: border-box; color: #37352f; resize: vertical; font-family: inherit; }
.kbd-textarea:focus { border-color: #2383e2; box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.2); }

.kbd-settings-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.kbd-btn { padding: 8px 20px; border: 1px solid #e9e9e7; border-radius: 6px; background: #fff; font-size: 14px; color: #37352f; cursor: pointer; transition: all 0.15s; }
.kbd-btn:hover { background: #f7f7f5; }
.kbd-btn.primary { background: #2383e2; color: #fff; border-color: #2383e2; }
.kbd-btn.primary:hover { background: #1b6ec2; }
</style>
