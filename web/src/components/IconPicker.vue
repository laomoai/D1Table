<template>
  <div class="icon-picker">
    <!-- Tabs -->
    <div class="picker-tabs">
      <button :class="['picker-tab', { active: tab === 'emoji' }]" @click="tab = 'emoji'">Emoji</button>
      <button :class="['picker-tab', { active: tab === 'icons' }]" @click="tab = 'icons'">Icons</button>
    </div>

    <!-- Search (shared) -->
    <input
      v-model="search"
      class="icon-search"
      :placeholder="tab === 'emoji' ? 'Search emoji...' : 'Search icons...'"
      @click.stop
    />

    <!-- Emoji tab -->
    <div v-if="tab === 'emoji'" ref="emojiScrollRef" class="emoji-scroll-area">
      <!-- No search: grouped by category -->
      <template v-if="!search.trim()">
        <div v-for="group in emojiGroups" :key="group.id" class="emoji-group">
          <div class="emoji-group-label" :ref="el => setGroupRef(group.id, el as HTMLElement)">{{ group.label }}</div>
          <div class="emoji-grid">
            <button
              v-for="e in group.emojis"
              :key="e.hexcode"
              class="icon-btn emoji-btn"
              :class="{ selected: currentIcon === e.unicode }"
              :title="e.label"
              @click="$emit('select', e.unicode)"
            >{{ e.unicode }}</button>
          </div>
        </div>
      </template>
      <!-- Search results -->
      <template v-else>
        <div v-if="!filteredEmojis.length" class="picker-empty">No emoji found</div>
        <div v-else class="emoji-grid">
          <button
            v-for="e in filteredEmojis"
            :key="e.hexcode"
            class="icon-btn emoji-btn"
            :class="{ selected: currentIcon === e.unicode }"
            :title="e.label"
            @click="$emit('select', e.unicode)"
          >{{ e.unicode }}</button>
        </div>
      </template>
    </div>

    <!-- Category nav bar (emoji only, no search) -->
    <div v-if="tab === 'emoji' && !search.trim()" class="emoji-category-bar">
      <button
        v-for="group in emojiGroups"
        :key="group.id"
        class="category-btn"
        :class="{ active: activeCategoryId === group.id }"
        :title="group.label"
        @click="scrollToGroup(group.id)"
      >{{ group.icon }}</button>
    </div>

    <!-- Icons tab -->
    <div v-if="tab === 'icons'" class="ion-icon-grid">
      <button
        v-for="icon in filteredIcons"
        :key="icon.name"
        class="icon-btn ion-btn"
        :class="{ selected: currentIcon === 'ion:' + icon.name }"
        :title="icon.label"
        @click="$emit('select', 'ion:' + icon.name)"
      >
        <n-icon :component="icon.component" size="18" />
      </button>
    </div>

    <div class="picker-footer">
      <button class="remove-btn" @click="$emit('select', null)">Remove icon</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, onMounted, type Component } from 'vue'
import { NIcon } from 'naive-ui'
import * as AllIcons from '@vicons/ionicons5'
import type { CompactEmoji } from 'emojibase'

defineProps<{ currentIcon?: string | null }>()
defineEmits<{ (e: 'select', icon: string | null): void }>()

const tab = ref<'emoji' | 'icons'>('emoji')
const search = ref('')

// ── Emoji data (lazy loaded) ─────────────────────────────────
const GROUP_LABELS: Record<number, { label: string; icon: string }> = {
  0: { label: 'Smileys & Emotion', icon: '😀' },
  1: { label: 'People & Body', icon: '👋' },
  3: { label: 'Animals & Nature', icon: '🐵' },
  4: { label: 'Food & Drink', icon: '🍇' },
  5: { label: 'Travel & Places', icon: '🌍' },
  6: { label: 'Activities', icon: '🎃' },
  7: { label: 'Objects', icon: '👓' },
  8: { label: 'Symbols', icon: '🔣' },
  9: { label: 'Flags', icon: '🏁' },
}

const allEmojis = shallowRef<CompactEmoji[]>([])

onMounted(async () => {
  const data = (await import('emojibase-data/en/compact.json')).default
  // Filter out group 2 (Component - skin tones) and entries without group
  allEmojis.value = data.filter((e: CompactEmoji) => e.group !== undefined && e.group !== 2)
})

interface EmojiGroup {
  id: number
  label: string
  icon: string
  emojis: CompactEmoji[]
}

const emojiGroups = computed<EmojiGroup[]>(() => {
  const groups: EmojiGroup[] = []
  const byGroup = new Map<number, CompactEmoji[]>()
  for (const e of allEmojis.value) {
    const g = e.group!
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(e)
  }
  for (const [id, info] of Object.entries(GROUP_LABELS)) {
    const gid = Number(id)
    const emojis = byGroup.get(gid)
    if (emojis?.length) {
      groups.push({ id: gid, label: info.label, icon: info.icon, emojis })
    }
  }
  return groups
})

const filteredEmojis = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return []
  return allEmojis.value.filter(e =>
    e.label.toLowerCase().includes(q) ||
    (e.tags && e.tags.some(t => t.toLowerCase().includes(q)))
  )
})

// ── Emoji category scroll tracking ──────────────────────────
const emojiScrollRef = ref<HTMLElement | null>(null)
const activeCategoryId = ref(0)
const groupRefs = new Map<number, HTMLElement>()

function setGroupRef(id: number, el: HTMLElement | null) {
  if (el) groupRefs.set(id, el)
  else groupRefs.delete(id)
}

function scrollToGroup(id: number) {
  const el = groupRefs.get(id)
  if (el && emojiScrollRef.value) {
    activeCategoryId.value = id
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}

// ── Ionicons ─────────────────────────────────────────────────
const allOutlineIcons = Object.entries(AllIcons)
  .filter(([name]) => name.endsWith('Outline'))
  .map(([name, component]) => ({
    name,
    component: component as Component,
    label: name.replace('Outline', '').replace(/([A-Z])/g, ' $1').trim(),
  }))

const filteredIcons = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return allOutlineIcons
  return allOutlineIcons.filter(({ label }) => label.toLowerCase().includes(q))
})
</script>

<style scoped>
.icon-picker {
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  user-select: none;
}

.picker-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e9e9e7;
  padding-bottom: 6px;
}

.picker-tab {
  padding: 4px 12px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #787774;
}
.picker-tab:hover { background: #f0f0ef; color: #37352f; }
.picker-tab.active { background: #f0f0ef; color: #37352f; font-weight: 600; }

.icon-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}
.icon-search:focus { border-color: #aaa; }

/* Emoji scroll area */
.emoji-scroll-area {
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 280px;
}

.emoji-group-label {
  font-size: 11px;
  font-weight: 600;
  color: #787774;
  padding: 6px 2px 4px;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

/* Category nav bar */
.emoji-category-bar {
  display: flex;
  gap: 2px;
  border-top: 1px solid #e9e9e7;
  padding-top: 6px;
  justify-content: center;
}

.category-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.1s, background 0.1s;
}
.category-btn:hover { background: #f0f0ef; opacity: 0.8; }
.category-btn.active { opacity: 1; background: #f0f0ef; }

.picker-empty {
  padding: 20px;
  text-align: center;
  color: #a3a19d;
  font-size: 13px;
}

.ion-icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  overflow-y: auto;
  max-height: 280px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 4px;
}
.icon-btn:hover { background: #f0f0ef; }
.icon-btn.selected { background: #e8f0fe; outline: 1.5px solid #4285f4; }

.emoji-btn { font-size: 18px; }
.ion-btn { color: #37352f; }

.picker-footer {
  border-top: 1px solid #e9e9e7;
  padding-top: 6px;
}

.remove-btn {
  width: 100%;
  padding: 5px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #787774;
}
.remove-btn:hover { background: #f0f0ef; color: #37352f; }
</style>
