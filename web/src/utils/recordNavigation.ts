import type { Router } from 'vue-router'

export function getLinkedRecordPath(tableName: string, recordId: string | number): string {
  const id = String(recordId)
  if (tableName === '_notes') return `/notes/${id}`
  return `/tables/${tableName}?highlight=${encodeURIComponent(id)}`
}

export function navigateToLinkedRecord(router: Router, tableName: string, recordId: string | number) {
  return router.push(getLinkedRecordPath(tableName, recordId))
}
