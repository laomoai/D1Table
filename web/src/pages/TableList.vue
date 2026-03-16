<template>
  <div style="padding: 32px;">
    <n-h2>Tables</n-h2>
    <n-spin v-if="isLoading" />
    <n-empty v-else-if="!tables?.length" description="No tables yet" />
    <n-grid v-else :cols="3" :x-gap="16" :y-gap="16">
      <n-gi v-for="t in tables" :key="t.name">
        <n-card
          hoverable
          style="cursor: pointer;"
          @click="router.push(`/tables/${t.name}`)"
        >
          <template #header>
            <n-icon :component="TableIcon" style="margin-right: 6px;" />
            {{ t.name }}
          </template>
          <n-text depth="3" style="font-size: 13px;">
            {{ t.row_count !== null ? `${t.row_count} records` : 'Unknown row count' }}
          </n-text>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { NH2, NCard, NGrid, NGi, NText, NSpin, NEmpty, NIcon } from 'naive-ui'
import { GridOutline as TableIcon } from '@vicons/ionicons5'
import { api } from '@/api/client'

const router = useRouter()

const { data: tables, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: api.getTables,
})
</script>
