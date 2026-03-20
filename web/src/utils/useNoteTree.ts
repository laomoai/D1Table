import { computed, ref, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { notesApi, type NoteListItem } from '@/api/client'

export interface NoteTreeNode {
  note: NoteListItem
  depth: number
  hasChildren: boolean
}

/**
 * Shared composable for building note tree structures.
 * Used by NotesPage (sidebar) and RowExpand (note picker).
 */
export function useNoteTree() {
  const { data: treeData, isLoading: treeLoading } = useQuery({
    queryKey: ['notes', 'tree'],
    queryFn: notesApi.getTree,
  })

  const childrenMap = computed(() => {
    const map = new Map<string, NoteListItem[]>()
    for (const n of treeData.value ?? []) {
      if (n.parent_id) {
        const arr = map.get(n.parent_id) ?? []
        arr.push(n)
        map.set(n.parent_id, arr)
      }
    }
    return map
  })

  const rootNotes = computed(() =>
    (treeData.value ?? []).filter(n => !n.parent_id)
  )

  /** Build a flat list with depth for collapsible tree display */
  function buildTreeList(expandedIds: Ref<Set<string>>): Ref<NoteTreeNode[]> {
    return computed(() => {
      const cm = childrenMap.value
      const result: NoteTreeNode[] = []
      function walk(parentId: string | null, depth: number) {
        for (const child of (parentId ? cm.get(parentId) : rootNotes.value) ?? []) {
          const hasChildren = !!cm.get(child.id)?.length
          result.push({ note: child, depth, hasChildren })
          if (hasChildren && expandedIds.value.has(child.id)) {
            walk(child.id, depth + 1)
          }
        }
      }
      walk(null, 0)
      return result
    })
  }

  /** Search notes by title, returns flat list */
  function searchNotes(query: Ref<string>): Ref<NoteTreeNode[]> {
    return computed(() => {
      const q = query.value.toLowerCase()
      if (!q) return []
      const cm = childrenMap.value
      return (treeData.value ?? [])
        .filter(n => n.title.toLowerCase().includes(q))
        .map(n => ({ note: n, depth: 0, hasChildren: !!cm.get(n.id)?.length }))
    })
  }

  /** Get note title by ID (from cached tree data, no extra API call) */
  function getNoteTitle(noteId: string): string {
    const note = (treeData.value ?? []).find(n => n.id === noteId)
    return note?.title || 'Untitled'
  }

  return {
    treeData,
    treeLoading,
    childrenMap,
    rootNotes,
    buildTreeList,
    searchNotes,
    getNoteTitle,
  }
}
