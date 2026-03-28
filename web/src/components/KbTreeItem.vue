<template>
  <div class="kb-tree-item">
    <div class="kb-tree-row" :class="{ 'is-path-node': !node.archived_at }" :style="{ paddingLeft: (depth * 20) + 'px' }">
      <span
        v-if="hasChildren"
        class="kb-tree-arrow"
        :class="{ expanded: expandedIds.has(node.id) }"
        @click.stop="emit('toggle', node.id)"
      >›</span>
      <span v-else class="kb-tree-arrow-placeholder" />

      <div class="kb-tree-left" @click="node.archived_at ? emit('preview', node.id) : emit('toggle', node.id)">
        <span class="kb-tree-icon">
          <span v-if="node.icon && !node.icon.startsWith('ion:')">{{ node.icon }}</span>
          <IonIcon v-else-if="node.icon" :name="node.icon.slice(4)" :size="16" />
          <IonIcon v-else :name="hasChildren ? 'FolderOutline' : 'DocumentOutline'" :size="16" />
        </span>
        <span class="kb-tree-title">{{ node.title }}</span>
        <span v-if="node.archived_at" class="kb-tree-date">{{ formatDate(node.archived_at) }}</span>
        <span v-else class="kb-tree-path-badge">active</span>
      </div>

      <div v-if="node.archived_at" class="kb-tree-actions">
        <button class="kb-tree-btn" @click.stop="emit('unarchive', node.id)" title="Restore to sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
      </div>
    </div>

    <div v-if="hasChildren && expandedIds.has(node.id)" class="kb-tree-children">
      <KbTreeItem
        v-for="child in children"
        :key="child.id"
        :node="child"
        :children-map="childrenMap"
        :expanded-ids="expandedIds"
        :depth="depth + 1"
        @preview="emit('preview', $event)"
        @unarchive="emit('unarchive', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ArchivedChild } from '@/api/client'
import IonIcon from './IonIcon.vue'

const props = withDefaults(defineProps<{
  node: ArchivedChild
  childrenMap: Map<string, ArchivedChild[]>
  expandedIds: Set<string>
  depth?: number
}>(), { depth: 0 })

const emit = defineEmits<{
  preview: [id: string]
  unarchive: [id: string]
  toggle: [id: string]
}>()

const children = computed(() => props.childrenMap.get(props.node.id) ?? [])
const hasChildren = computed(() => children.value.length > 0)

function formatDate(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString()
}
</script>

<style scoped>
.kb-tree-row {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: 6px;
  transition: background 0.12s;
  gap: 4px;
}
.kb-tree-row:hover { background: #f7f7f5; }

.kb-tree-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 14px;
  color: #9b9a97;
  cursor: pointer;
  transition: transform 0.15s;
  flex-shrink: 0;
  user-select: none;
}
.kb-tree-arrow.expanded { transform: rotate(90deg); }
.kb-tree-arrow-placeholder { width: 18px; flex-shrink: 0; }

.kb-tree-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.kb-tree-icon {
  display: flex;
  align-items: center;
  color: #787774;
  flex-shrink: 0;
}

.kb-tree-title {
  font-size: 14px;
  color: #37352f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-tree-date {
  font-size: 11px;
  color: #9b9a97;
  flex-shrink: 0;
}

.kb-tree-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.12s;
  flex-shrink: 0;
}

.kb-tree-row:hover .kb-tree-actions { opacity: 1; }

.kb-tree-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #787774;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.kb-tree-btn:hover { background: #e9e9e7; color: #37352f; }

.is-path-node .kb-tree-title { color: #9b9a97; }
.is-path-node .kb-tree-icon { opacity: 0.5; }

.kb-tree-path-badge {
  font-size: 10px;
  color: #9b9a97;
  background: #f1f1ef;
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
