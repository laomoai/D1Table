<template>
  <CellValue
    :value="params.value"
    :field-type="params.fieldType"
    :select-options="params.selectOptions"
  />
</template>

<script setup lang="ts">
import CellValue from '../CellValue.vue'
import type { FieldType, SelectOption } from '@/api/client'

defineProps<{
  params: {
    value: unknown
    fieldType: FieldType
    selectOptions: SelectOption[] | null
  }
}>()
</script>
