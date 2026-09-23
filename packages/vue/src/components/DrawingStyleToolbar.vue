<template>
  <CanvasToolbar>
    <div v-if="canEdit('stroke')" class="color-item" title="颜色">
      <span
        class="color-swatch"
        :style="{ background: style.stroke ?? DEFAULT_DRAWING_STROKE }"
      ></span>
      <input
        type="color"
        class="color-input"
        :value="style.stroke ?? DEFAULT_DRAWING_STROKE"
        @input="onColorChange(($event.target as HTMLInputElement).value)"
      />
    </div>

    <Dropdown
      v-if="canEdit('strokeWidth')"
      :model-value="String(style.strokeWidth ?? 1)"
      :options="widthOptions"
      size="sm"
      title="线宽"
      @update:model-value="onWidthChange(Number($event))"
    />

    <Dropdown
      v-if="canEdit('strokeStyle')"
      :model-value="style.strokeStyle ?? 'solid'"
      :options="styleOptions"
      size="sm"
      title="线型"
      @update:model-value="onLineStyleChange($event as 'solid' | 'dashed' | 'dotted')"
    />

    <span v-if="drawings.length > 1" class="selection-count">已选 {{ drawings.length }}</span>

    <div
      v-if="lineLabelPosition"
      class="label-position"
      :class="{ 'toolbar-separated': drawings.length > 0 }"
      role="group"
      aria-label="文本位置"
    >
      <button
        v-for="option in positionOptions"
        :key="option.value"
        type="button"
        class="toolbar-btn label-position__button"
        :class="{ 'is-active': lineLabelPosition === option.value }"
        :title="option.label"
        :aria-label="option.label"
        :aria-pressed="lineLabelPosition === option.value"
        @mousedown.prevent
        @click="emit('updateLineLabelPosition', option.value)"
      >
        <component :is="option.icon" aria-hidden="true" />
      </button>
    </div>

    <button
      v-if="drawings.length === 1"
      type="button"
      class="toolbar-btn toolbar-btn--settings"
      title="图元设置"
      aria-label="图元设置"
      @click="emit('openSettings', drawings[0]!.id)"
    >
      <IconTablerSettings class="settings-icon" aria-hidden="true" />
    </button>

    <button
      v-if="drawings.length > 0"
      type="button"
      class="toolbar-btn toolbar-btn--lock"
      :class="{ 'is-locked': allLocked }"
      :title="allLocked ? '解锁' : '锁定'"
      :aria-label="allLocked ? '解锁' : '锁定'"
      @click="onToggleLock"
    >
      <IconTablerLock v-if="allLocked" class="lock-icon" aria-hidden="true" />
      <IconTablerLockOpen v-else class="lock-icon" aria-hidden="true" />
    </button>

    <!-- 锁定只冻结几何拖动与删除；样式等编辑照常可用。 -->
    <button
      v-if="drawings.length > 0"
      type="button"
      class="toolbar-btn toolbar-btn--delete"
      title="删除"
      :disabled="allLocked"
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
  import { DEFAULT_DRAWING_STROKE } from '@363045841yyt/klinechart-core'
  import type { DrawingLabelPosition, DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'
  import { computed, onMounted, onUnmounted } from 'vue'
  import IconTablerAlignLeft from '~icons/tabler/align-left'
  import IconTablerAlignCenter from '~icons/tabler/align-center'
  import IconTablerAlignRight from '~icons/tabler/align-right'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerLockOpen from '~icons/tabler/lock-open'
  import IconTablerSettings from '~icons/tabler/settings'
  import CanvasToolbar from './common/CanvasToolbar.vue'
  import Dropdown from './Dropdown.vue'

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

  const positionOptions = [
    { value: 'start', label: '起点', icon: IconTablerAlignLeft },
    { value: 'center', label: '居中', icon: IconTablerAlignCenter },
    { value: 'end', label: '终点', icon: IconTablerAlignRight },
  ] as const

  const props = defineProps<{
    drawings: ReadonlyArray<DrawingObject>
    editableStyleKeys: ReadonlyArray<keyof DrawingStyle>
    lineLabelPosition?: DrawingLabelPosition
  }>()

  const emit = defineEmits<{
    (e: 'updateStyle', style: Partial<DrawingStyle>): void
    (e: 'delete'): void
    (e: 'toggleLock', locked: boolean): void
    (e: 'updateLineLabelPosition', position: DrawingLabelPosition): void
    (e: 'openSettings', drawingId: string): void
  }>()

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'Delete') {
      e.preventDefault()
      emit('delete')
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeyDown))
  onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

  /** 批量编辑展示首个图元的当前值；写入仅限 Core 确认的字段交集。 */
  const style = computed(() => props.drawings[0]?.style ?? {})
  function canEdit(key: keyof DrawingStyle): boolean {
    return props.editableStyleKeys.includes(key)
  }

  /** 全部选中图元均已锁定；混合选中视为未完全锁定。 */
  const allLocked = computed(
    () => props.drawings.length > 0 && props.drawings.every((drawing) => drawing.locked === true),
  )

  function onToggleLock() {
    emit('toggleLock', !allLocked.value)
  }

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
    background: var(--klc-color-ui-hover);
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

  .selection-count {
    padding: 0 4px;
    color: var(--klc-color-ui-text-soft);
    font-size: 12px;
    white-space: nowrap;
  }

  .label-position {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .label-position .toolbar-btn.label-position__button {
    flex: 0 0 26px;
    width: 26px;
    padding: 0;
    box-sizing: border-box;
  }

  .label-position__button :deep(svg) {
    flex: none;
    width: 18px;
    height: 18px;
  }

  .label-position__button.is-active {
    color: var(--klc-color-ui-accent);
    background: color-mix(in srgb, var(--klc-color-ui-accent) 16%, transparent);
  }
</style>
