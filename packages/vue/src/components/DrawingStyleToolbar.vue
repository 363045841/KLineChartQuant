<template>
  <div
    class="drawing-style-toolbar"
    @pointerdown.stop
    @pointermove.stop
    @pointerup.stop
  >
    <div class="toolbar-item color-item" title="颜色">
      <span class="color-swatch" :style="{ background: drawing.style.stroke ?? '#2962ff' }"></span>
      <input
        type="color"
        class="color-input"
        :value="drawing.style.stroke ?? '#2962ff'"
        @input="onColorChange(($event.target as HTMLInputElement).value)"
      />
    </div>

    <select
      class="toolbar-select"
      :value="drawing.style.strokeWidth ?? 1"
      @change="onWidthChange(Number(($event.target as HTMLSelectElement).value))"
      title="线宽"
    >
      <option :value="1">1px</option>
      <option :value="2">2px</option>
      <option :value="3">3px</option>
      <option :value="4">4px</option>
    </select>

    <select
      class="toolbar-select"
      :value="drawing.style.strokeStyle ?? 'solid'"
      @change="onLineStyleChange(($event.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted')"
      title="线型"
    >
      <option value="solid">实线</option>
      <option value="dashed">虚线</option>
      <option value="dotted">点线</option>
    </select>

    <button type="button" class="toolbar-btn delete-btn" title="删除" @click="$emit('delete')">
      <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/plugin'

const props = defineProps<{
  drawing: DrawingObject
}>()

const emit = defineEmits<{
  (e: 'updateStyle', style: Partial<DrawingStyle>): void
  (e: 'delete'): void
}>()

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete') {
    e.preventDefault()
    emit('delete')
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

function onColorChange(color: string) {
  emit('updateStyle', { stroke: color })
}

function onWidthChange(width: number) {
  emit('updateStyle', { strokeWidth: width })
}

function onLineStyleChange(style: 'solid' | 'dashed' | 'dotted') {
  emit('updateStyle', { strokeStyle: style })
}
</script>

<style scoped>
.drawing-style-toolbar {
  position: absolute;
  left: 50%;
  top: 8px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  height: 32px;
  background: color-mix(in srgb, var(--klc-color-tag-bg-white) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--klc-color-border-button);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  z-index: 100;
  user-select: none;
  pointer-events: auto;
}

.toolbar-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.color-item {
  position: relative;
  width: 24px;
  height: 24px;
}

.color-swatch {
  display: block;
  width: 100%;
  height: 100%;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 4px;
  cursor: pointer;
}

.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.toolbar-select {
  height: 24px;
  padding: 0 4px;
  border: 1px solid var(--klc-color-axis-line);
  border-radius: 4px;
  background: var(--klc-color-tag-bg-white);
  color: var(--klc-color-foreground);
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.toolbar-select:hover {
  border-color: var(--klc-color-axis-text);
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--klc-color-axis-text);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.toolbar-btn:hover {
  border-color: var(--klc-color-axis-line);
  background: var(--klc-color-grid-minor);
  color: var(--klc-color-foreground);
}

.delete-btn:hover {
  color: #dc2626;
  border-color: #fca5a5;
  background: #fef2f2;
}

.delete-icon {
  width: 14px;
  height: 14px;
}
</style>
