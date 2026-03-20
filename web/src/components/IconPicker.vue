<template>
  <div class="icon-picker">
    <!-- Tabs -->
    <div class="picker-tabs">
      <button :class="['picker-tab', { active: tab === 'emoji' }]" @click="tab = 'emoji'">Emoji</button>
      <button :class="['picker-tab', { active: tab === 'icons' }]" @click="tab = 'icons'">Icons</button>
    </div>

    <!-- Emoji tab -->
    <div v-if="tab === 'emoji'" class="emoji-grid">
      <button
        v-for="e in EMOJI_LIST"
        :key="e"
        class="icon-btn emoji-btn"
        :class="{ selected: currentIcon === e }"
        @click="$emit('select', e)"
      >{{ e }}</button>
    </div>

    <!-- Icons tab -->
    <template v-else>
      <input
        v-model="search"
        class="icon-search"
        placeholder="Search icons..."
        @click.stop
      />
      <div class="ion-icon-grid">
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
    </template>

    <div class="picker-footer">
      <button class="remove-btn" @click="$emit('select', null)">Remove icon</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Component } from 'vue'
import { NIcon } from 'naive-ui'
import * as AllIcons from '@vicons/ionicons5'

defineProps<{ currentIcon?: string | null }>()
defineEmits<{ (e: 'select', icon: string | null): void }>()

const tab = ref<'emoji' | 'icons'>('emoji')
const search = ref('')

const EMOJI_LIST = [
  '📊','📈','📉','📋','📄','📁','📂','🗂️','📌','📍','🔖','🏷️',
  '💼','📱','💻','🖥️','⌨️','📠','☎️','🔧','⚙️','🛠️','🔨',
  '👥','👤','👋','🤝','💪','🙌','🧑‍💼',
  '🏠','🏢','🏪','🏭','🏛️','🏗️',
  '🎯','🏆','🥇','🎓','📚','📖','🔬','🔭','🔍',
  '⭐','❤️','💙','💚','💛','🧡','💜',
  '✅','❌','⚠️','ℹ️','🔔','🔕','🔑','🔒','🔓','💡',
  '♻️','🌍','🌱','🌸','☀️','🌙','⚡','🌈','🌊',
  '✈️','🚀','🚗','🚢','🚂','🛒',
  '🎮','🎵','🎬','📷','🎨','🎭',
  '💰','💵','💳','🏦','💹',
  '📅','📆','⏰','🕐','⌚',
  '🍎','🍕','☕','🍺','🎂',
  '🐶','🐱','🦁','🐝','🦋',
]

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
  width: 320px;
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

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 280px;
}

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

.ion-icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  overflow-y: auto;
  max-height: 240px;
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
