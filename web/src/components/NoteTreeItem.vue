<template>
  <div class="note-tree-item">
    <div
      class="note-item"
      :class="{
        active: activeId === note.id,
        'drop-above': dropPosition === 'above' && dropTargetId === note.id,
        'drop-child': dropPosition === 'child' && dropTargetId === note.id,
      }"
      draggable="true"
      @click="emit('select', note.id)"
      @dragstart="onDragStart"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="note-drag-handle" title="Drag to reorder">⋮⋮</span>
      <span
        v-if="hasChildren"
        class="note-arrow"
        :class="{ expanded: expandedIds.has(note.id) }"
        @click.stop="emit('toggle', note.id)"
      >›</span>
      <span v-else class="note-arrow-placeholder" />
      <span class="note-icon">
        <span v-if="note.icon && !note.icon.startsWith('ion:')">{{ note.icon }}</span>
        <span v-else-if="hasChildren">📁</span>
        <span v-else>📄</span>
      </span>
      <span class="note-title">{{ note.title || 'Untitled' }}</span>
      <div class="note-actions">
        <button class="note-action-btn" title="Add sub-note" @click.stop="emit('create-child', note.id)">+</button>
        <button class="note-action-btn delete" title="Delete" @click.stop="emit('delete', note.id)">×</button>
      </div>
    </div>
    <div v-if="hasChildren && expandedIds.has(note.id)" class="note-children">
      <NoteTreeItem
        v-for="child in children"
        :key="child.id"
        :note="child"
        :children="childrenMap.get(child.id) ?? []"
        :children-map="childrenMap"
        :active-id="activeId"
        :expanded-ids="expandedIds"
        :drop-target-id="dropTargetId"
        :drop-position="dropPosition"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @create-child="emit('create-child', $event)"
        @delete="emit('delete', $event)"
        @reorder="emit('reorder', $event)"
        @update:drop-state="emit('update:drop-state', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoteListItem } from '@/api/client'

const props = defineProps<{
  note: NoteListItem
  children: NoteListItem[]
  childrenMap: Map<string, NoteListItem[]>
  activeId: string | null
  expandedIds: Set<string>
  dropTargetId?: string | null
  dropPosition?: 'above' | 'child' | null
}>()

const emit = defineEmits<{
  select: [id: string]
  toggle: [id: string]
  'create-child': [id: string]
  delete: [id: string]
  reorder: [payload: { dragId: string; dropId: string; mode: 'above' | 'child' }]
  'update:drop-state': [state: { id: string | null; position: 'above' | 'child' | null }]
}>()

const hasChildren = computed(() => props.children.length > 0)

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.note.id)
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  const ratio = y / rect.height
  // Top 1/3 = above, bottom 2/3 = child
  const position: 'above' | 'child' = ratio < 0.35 ? 'above' : 'child'
  emit('update:drop-state', { id: props.note.id, position })
}

function onDragLeave() {
  emit('update:drop-state', { id: null, position: null })
}

function onDrop(e: DragEvent) {
  const dragId = e.dataTransfer?.getData('text/plain')
  if (!dragId || dragId === props.note.id) {
    emit('update:drop-state', { id: null, position: null })
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  const mode: 'above' | 'child' = (y / rect.height) < 0.35 ? 'above' : 'child'
  emit('reorder', { dragId, dropId: props.note.id, mode })
  emit('update:drop-state', { id: null, position: null })
}
</script>

<style scoped>
.note-tree-item { user-select: none; }
.note-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 4px 5px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
  color: #37352f;
  border: 2px solid transparent;
}
.note-item:hover {
  background: rgba(55, 53, 47, 0.06);
}
.note-item.active {
  background: rgba(55, 53, 47, 0.1);
  font-weight: 500;
}
/* Drop above — line indicator at top */
.note-item.drop-above {
  border-top: 2px solid #2383e2;
  border-radius: 0;
}
/* Drop as child — highlight whole item */
.note-item.drop-child {
  background: rgba(35, 131, 226, 0.1);
  border: 2px solid rgba(35, 131, 226, 0.3);
}
.note-drag-handle {
  width: 14px;
  font-size: 10px;
  color: transparent;
  cursor: grab;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: -2px;
  transition: color 0.1s;
}
.note-item:hover .note-drag-handle { color: #c4c4c0; }
.note-drag-handle:hover { color: #787774 !important; }
.note-drag-handle:active { cursor: grabbing; }
.note-arrow {
  font-size: 11px;
  color: #a3a19d;
  cursor: pointer;
  width: 14px;
  text-align: center;
  transition: transform 0.12s;
  flex-shrink: 0;
}
.note-arrow.expanded { transform: rotate(90deg); }
.note-arrow-placeholder { width: 14px; flex-shrink: 0; }
.note-icon { font-size: 13px; flex-shrink: 0; }
.note-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.note-actions { display: none; gap: 2px; flex-shrink: 0; }
.note-item:hover .note-actions { display: flex; }
.note-action-btn {
  background: none; border: none;
  padding: 0 3px; font-size: 14px;
  color: #a3a19d; cursor: pointer;
  border-radius: 2px; line-height: 1;
}
.note-action-btn:hover { color: #37352f; background: rgba(55,53,47,0.08); }
.note-action-btn.delete:hover { color: #e03e3e; }
.note-children { padding-left: 16px; }
</style>
