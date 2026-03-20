<template>
  <div style="padding: 32px;">
    <n-h2>Tables</n-h2>
    <n-spin v-if="isLoading" />
    <n-empty v-else-if="!tables?.length" description="No tables yet" />
    <n-grid v-else :cols="3" :x-gap="16" :y-gap="16">
      <n-gi v-for="t in tables" :key="t.name">
        <n-card hoverable @click="onCardClick(t, $event)" style="cursor:pointer;">
          <div class="card-inner">
            <!-- 图标区：独立可点击，打开选择器 -->
            <n-popover
              :show="iconPickerTable === t.name"
              trigger="manual"
              placement="bottom-start"
              :show-arrow="false"
              :content-style="{ padding: 0 }"
              @clickoutside="iconPickerTable = null"
            >
              <template #trigger>
                <div class="card-icon-area" @click.stop="togglePicker(t.name)" title="Click to change icon">
                  <span v-if="t.icon && !t.icon.startsWith('ion:')" class="card-icon-emoji">{{ t.icon }}</span>
                  <ion-icon v-else-if="t.icon" :name="t.icon.slice(4)" :size="32" />
                  <n-icon v-else :component="TableIcon" :size="28" class="card-icon-default" />
                </div>
              </template>
              <icon-picker
                v-if="iconPickerTable === t.name"
                :current-icon="t.icon"
                @select="onIconSelect(t.name, $event)"
              />
            </n-popover>

            <!-- 信息区：点击进入表格 -->
            <div class="card-info">
              <div class="card-title">{{ t.title || t.name }}</div>
              <div class="card-count">{{ t.row_count !== null ? `${t.row_count} records` : '—' }}</div>
            </div>
          </div>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NH2, NCard, NGrid, NGi, NSpin, NEmpty, NIcon, NPopover } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { GridOutline as TableIcon } from '@vicons/ionicons5'
import { api, type TableMeta } from '@/api/client'
import IonIcon from '@/components/IonIcon.vue'

const IconPicker = defineAsyncComponent(() => import('@/components/IconPicker.vue'))

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()

const { data: tables, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})

const iconPickerTable = ref<string | null>(null)

function onCardClick(t: TableMeta, e: MouseEvent) {
  if ((e.target as Element).closest('.card-icon-area')) return
  router.push(`/tables/${t.name}`)
}

function togglePicker(tableName: string) {
  iconPickerTable.value = iconPickerTable.value === tableName ? null : tableName
}

async function onIconSelect(tableName: string, icon: string | null) {
  iconPickerTable.value = null
  try {
    await api.updateTableIcon(tableName, icon)
    queryClient.invalidateQueries({ queryKey: ['tables'] })
  } catch (err) {
    message.error((err as Error).message)
  }
}
</script>

<style scoped>
.card-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.card-icon-area {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: #f3f3f1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #37352f;
  transition: background 0.15s;
}
.card-icon-area:hover { background: #e9e9e7; }

.card-icon-emoji { font-size: 28px; line-height: 1; }
.card-icon-default { opacity: 0.3; }

.card-info {
  flex: 1;
  min-width: 0;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #37352f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-count {
  font-size: 13px;
  color: #9b9b97;
  margin-top: 3px;
}
</style>
