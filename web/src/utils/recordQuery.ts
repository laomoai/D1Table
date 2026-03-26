import type { Filter } from '@/components/FilterBar.vue'

export function buildRecordQueryParams(options: {
  pageSize?: number
  page?: number
  sort?: string
  searchText?: string
  filters?: Filter[]
}): Record<string, string | number> {
  const params: Record<string, string | number> = {}

  if (options.pageSize !== undefined) params.page_size = options.pageSize
  if (options.page !== undefined) params.page = options.page
  if (options.sort) params.sort = options.sort

  const searchText = options.searchText?.trim()
  if (searchText) {
    params['filter[__all]'] = searchText
  }

  for (const filter of options.filters ?? []) {
    if (!filter.field || !filter.value) continue
    if (filter.field === '__all') {
      const op = filter.op === 'nlike' ? 'nlike' : 'like'
      params[`filter[__all__${op}]`] = filter.value
      continue
    }
    params[`filter[${filter.field}${filter.op === 'eq' ? '' : `__${filter.op}`}]`] = filter.value
  }

  return params
}
