<template>
  <CanvasToolbar>
    <div class="color-item" title="颜色">
      <span class="color-swatch" :style="{ background: drawing.style.stroke ?? '#2962ff' }"></span>
      <input
        type="color"
        class="color-input"
        :value="drawing.style.stroke ?? '#2962ff'"
        @input="onColorChange(($event.target as HTMLInputElement).value)"
      />
    </div>

    <Dropdown
      :model-value="String(drawing.style.strokeWidth ?? 1)"
      :options="widthOptions"
      size="sm"
      title="线宽"
      @update:model-value="onWidthChange(Number($event))"
    />

    <Dropdown
      :model-value="drawing.style.strokeStyle ?? 'solid'"
      :options="styleOptions"
      size="sm"
      title="线型"
      @update:model-value="onLineStyleChange($event as 'solid' | 'dashed' | 'dotted')"
    />

    <button
      type="button"
      class="toolbar-btn toolbar-btn--delete"
      title="删除"
      @click="$emit('delete')"
    >
      <svg
        class="delete-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    </button>
  </CanvasToolbar>
</template>

<script setup lang="ts">
  import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/plugin'
  import { onMounted, onUnmounted } from 'vue'

  import Dropdown from './Dropdown.vue'
  import CanvasToolbar from './common/CanvasToolbar.vue'

  const widthOptions = [
    { label: '1px', value: '1' },
    { label: '2px', value: '2' },
    { label: '3px', value: '3' },
    { label: '4px', value: '4' },
  ]

  const styleOptions = [
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ]

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
  .color-item {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .color-item:hover {
    background: var(--klc-color-grid-minor);
  }

  .color-swatch {
    display: block;
    width: 16px;
    height: 16px;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    pointer-events: none;
  }

  .color-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
</style>
