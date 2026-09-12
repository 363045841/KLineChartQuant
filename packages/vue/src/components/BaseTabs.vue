<!-- 共享下划线 Tabs：图表设置 / Agent 设置 / 色彩预设 / 商品选择弹层复用，统一 tab 样式与滑动指示器。 -->
<template>
  <nav
    ref="rootRef"
    class="base-tabs"
    :class="{ 'base-tabs--compact': size === 'compact', 'base-tabs--draggable': draggable }"
    role="tablist"
    :aria-label="ariaLabel"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
    @wheel="onWheel"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="base-tabs__tab"
      :class="{ 'is-active': tab.id === modelValue }"
      :aria-selected="tab.id === modelValue"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
    <span class="base-tabs__indicator" aria-hidden="true" :style="indicatorStyle" />
  </nav>
</template>

<script setup lang="ts" generic="T extends string">
  import { ref } from 'vue'

  import { useSlidingTabIndicator } from '../composables/useSlidingTabIndicator'

  const props = withDefaults(
    defineProps<{
      /** 当前激活 tab 的 id。 */
      modelValue: T
      /** tab 列表，id 为泛型以保留调用方的联合类型。 */
      tabs: ReadonlyArray<{ id: T; label: string }>
      /** tablist 的可访问名称。 */
      ariaLabel?: string
      /** 紧凑尺寸，用于商品选择弹层等密集布局。 */
      size?: 'default' | 'compact'
      /** 允许拖拽与滚轮横向滚动溢出的标签。 */
      draggable?: boolean
    }>(),
    {
      size: 'default',
      draggable: false,
    },
  )
  const emit = defineEmits<{ 'update:modelValue': [id: T] }>()

  const rootRef = ref<HTMLElement | null>(null)
  const { indicatorStyle } = useSlidingTabIndicator(rootRef, () => [props.modelValue, props.tabs])

  let isDragging = false
  let startX = 0
  let startScrollLeft = 0

  /** 记录拖拽起点，用于横向浏览被遮挡的标签。 */
  function onMouseDown(event: MouseEvent) {
    if (!props.draggable) return
    const el = event.currentTarget as HTMLElement
    isDragging = true
    startX = event.pageX - el.getBoundingClientRect().left
    startScrollLeft = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  /** 按住标签条左右拖动时同步其滚动位置。 */
  function onMouseMove(event: MouseEvent) {
    if (!isDragging) return
    const el = event.currentTarget as HTMLElement
    event.preventDefault()
    const distance = event.pageX - el.getBoundingClientRect().left - startX
    el.scrollLeft = startScrollLeft - distance
  }

  /** 结束拖拽并恢复默认光标与文字选择行为。 */
  function onMouseUp(event: MouseEvent) {
    if (!isDragging) return
    isDragging = false
    const el = event.currentTarget as HTMLElement
    el.style.cursor = ''
    el.style.userSelect = ''
  }

  /** 将滚轮增量映射到 scrollLeft，支持滚轮与触控板横向手势浏览标签。 */
  function onWheel(event: WheelEvent) {
    if (!props.draggable || event.ctrlKey) return
    const el = event.currentTarget as HTMLElement
    const delta = event.deltaX || event.deltaY
    if (delta === 0) return
    event.preventDefault()
    el.scrollLeft += delta
  }
</script>

<style scoped>
  .base-tabs {
    position: relative;
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .base-tabs::-webkit-scrollbar {
    display: none;
  }

  .base-tabs--draggable {
    cursor: grab;
  }

  .base-tabs__tab {
    flex: 0 0 auto;
    padding: 8px 10px;
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--klc-color-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }

  .base-tabs__tab:hover,
  .base-tabs__tab:focus-visible {
    color: var(--klc-color-ui-text);
    outline: 0;
  }

  .base-tabs__tab.is-active {
    color: var(--klc-color-ui-text);
    font-weight: 600;
  }

  /* 紧凑尺寸：商品选择弹层内的聚合源标签 */
  .base-tabs--compact {
    gap: 0;
    margin: 0 -4px;
    padding: 0 4px;
    border-bottom-color: var(--klc-color-border-button);
  }

  .base-tabs--compact .base-tabs__tab {
    padding: 0 12px;
    border-bottom: 0;
    font-size: 13px;
    line-height: 32px;
  }

  .base-tabs__indicator {
    position: absolute;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--klc-color-ui-accent);
    transition:
      left 0.2s ease,
      width 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .base-tabs__indicator {
      transition: none;
    }
  }
</style>
