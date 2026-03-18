<template>
  <div class="image-upload">
    <!-- 已有图片 -->
    <div v-if="imageVal" class="image-preview">
      <img
        :src="`/api/files/${imageVal.display}`"
        class="preview-img"
        :alt="imageVal.name"
      />
      <div class="preview-overlay">
        <span class="preview-name">{{ imageVal.name }}</span>
        <span class="preview-size">{{ formatSize(imageVal.size) }}</span>
        <div class="preview-actions">
          <button class="preview-btn" @click="triggerPicker" title="Replace">Replace</button>
          <button class="preview-btn preview-btn--del" @click="handleRemove" title="Remove">Remove</button>
        </div>
      </div>
    </div>

    <!-- 上传区域 -->
    <div
      v-else
      class="drop-zone"
      :class="{ 'drop-zone--over': isDragging, 'drop-zone--loading': uploading }"
      @click="triggerPicker"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div v-if="uploading" class="upload-status">
        <n-spin size="small" />
        <span>Uploading...</span>
      </div>
      <div v-else class="upload-hint">
        <span class="upload-icon">🖼</span>
        <span>Click or drag image here</span>
        <span class="upload-sub">Supports JPG, PNG, GIF, WebP · Paste with Ctrl+V</span>
      </div>
    </div>

    <!-- 隐藏的 file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      style="display:none"
      @change="onFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { NSpin } from 'naive-ui'
import { api, type ImageValue } from '@/api/client'

const props = defineProps<{
  value: string | null  // JSON string of ImageValue
}>()

const emit = defineEmits<{
  'update:value': [val: string | null]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const uploading = ref(false)

const imageVal = computed<ImageValue | null>(() => {
  if (!props.value) return null
  try { return JSON.parse(props.value) } catch { return null }
})

// ── 触发文件选择 ───────────────────────────────────────────────
function triggerPicker() {
  fileInputRef.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
  // 重置 input，允许选同一个文件
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// ── 拖拽 ──────────────────────────────────────────────────────
function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) processFile(file)
}

// ── 粘贴（全局监听）──────────────────────────────────────────
function onPaste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.items ?? [])
    .find(i => i.type.startsWith('image/'))
    ?.getAsFile()
  if (file) processFile(file)
}

onMounted(() => document.addEventListener('paste', onPaste))
onBeforeUnmount(() => document.removeEventListener('paste', onPaste))

// ── 核心：压缩 + 上传 ─────────────────────────────────────────
async function processFile(file: File) {
  uploading.value = true
  try {
    const { thumb, display } = await compressImage(file)
    const result = await api.uploadImage(thumb, display, file.name)
    emit('update:value', JSON.stringify(result))
  } catch (err) {
    console.error('Upload failed:', err)
  } finally {
    uploading.value = false
  }
}

// ── 删除 ──────────────────────────────────────────────────────
async function handleRemove() {
  if (!imageVal.value) return
  try {
    await api.deleteImage(imageVal.value.thumb, imageVal.value.display)
  } catch { /* 删除失败不阻塞 UI */ }
  emit('update:value', null)
}

// ── 图片压缩（Canvas）────────────────────────────────────────
async function compressImage(file: File): Promise<{ thumb: Blob; display: Blob }> {
  const bitmap = await createImageBitmap(file)

  // Display：最大 2048px，保持比例
  const MAX = 2048
  let dw = bitmap.width
  let dh = bitmap.height
  if (dw > MAX || dh > MAX) {
    const r = Math.min(MAX / dw, MAX / dh)
    dw = Math.round(dw * r)
    dh = Math.round(dh * r)
  }
  const displayCanvas = document.createElement('canvas')
  displayCanvas.width = dw
  displayCanvas.height = dh
  displayCanvas.getContext('2d')!.drawImage(bitmap, 0, 0, dw, dh)

  // Thumb：200×200 居中裁剪
  const T = 200
  const scale = Math.max(T / bitmap.width, T / bitmap.height)
  const sw = T / scale
  const sh = T / scale
  const sx = (bitmap.width - sw) / 2
  const sy = (bitmap.height - sh) / 2
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = T
  thumbCanvas.height = T
  thumbCanvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, T, T)

  bitmap.close()

  const [display, thumb] = await Promise.all([
    canvasToBlob(displayCanvas, 'image/webp', 0.85),
    canvasToBlob(thumbCanvas, 'image/webp', 0.75),
  ])
  return { display, thumb }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), type, quality)
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style scoped>
.image-upload { width: 100%; }

/* 已有图片预览 */
.image-preview {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #f0f2f5;
  cursor: pointer;
}
.preview-img {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  display: block;
}
.preview-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
  padding: 20px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.image-preview:hover .preview-overlay { opacity: 1; }
.preview-name { font-size: 12px; color: #fff; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-size { font-size: 11px; color: rgba(255,255,255,0.7); }
.preview-actions { display: flex; gap: 6px; margin-top: 4px; }
.preview-btn {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.4);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.1s;
}
.preview-btn:hover { background: rgba(255,255,255,0.35); }
.preview-btn--del { color: #ffb3b3; border-color: rgba(255,100,100,0.4); }
.preview-btn--del:hover { background: rgba(255,80,80,0.3); }

/* 上传区域 */
.drop-zone {
  border: 1.5px dashed #d0d3da;
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: #fafbfc;
}
.drop-zone:hover, .drop-zone--over {
  border-color: #4f6ef7;
  background: #f0f2ff;
}
.drop-zone--loading { cursor: default; pointer-events: none; }
.upload-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.upload-icon { font-size: 24px; line-height: 1; margin-bottom: 4px; }
.upload-hint span { font-size: 13px; color: #666; }
.upload-sub { font-size: 11px !important; color: #aaa !important; }
.upload-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  font-size: 13px;
}
</style>
