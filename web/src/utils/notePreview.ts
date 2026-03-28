import { ref } from 'vue'

export const notePreviewId = ref<string | null>(null)

export function openNotePreview(id: string) {
  notePreviewId.value = id
}

export function closeNotePreview() {
  notePreviewId.value = null
}
