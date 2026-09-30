<!-- 共享下划线 Tabs：图表设置 / Agent 设置 / 色彩预设 / 商品选择弹层复用，统一 tab 样式与滑动指示器；标签溢出时支持滚轮与拖拽横向浏览。 -->
<template>
  <nav
    ref="rootRef"
    class="base-tabs"
    :class="{ 'base-tabs--compact': size === 'compact' }"
    role="tablist"
    :aria-label="ariaLabel"
    @mousedown="onMouseDown"
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
  import { onUnmounted, ref } from 'vue'

  import { useSlidingTabIndicator } from '../composables/useSlidingTabIndicator.js'

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
    }>(),
    {
      size: 'default',
    },
  )
  const emit = defineEmits<{ 'update:modelValue': [id: T] }>()

  const rootRef = ref<HTMLElement | null>(null)
  const { indicatorStyle } = useSlidingTabIndicator(rootRef, () => [props.modelValue, props.tabs])

  let draggingEl: HTMLElement | null = null
  let startX = 0
  let startScrollLeft = 0

  /** 标签溢出时容器才有可滚动距离，未溢出时把滚轮让回页面。 */
  function maxScrollLeft(el: HTMLElement): number {
    return el.scrollWidth - el.clientWidth
  }

  /** 监听挂在 document 上，指针移出标签条后仍能继续拖动。 */
  function onDocumentMouseMove(event: MouseEvent) {
    if (!draggingEl) return
    event.preventDefault()
    draggingEl.scrollLeft = startScrollLeft - (event.pageX - startX)
  }

  /** 结束拖拽并恢复默认光标与文字选择行为。 */
  function stopDrag() {
    if (!draggingEl) return
    draggingEl.style.cursor = ''
    draggingEl.style.userSelect = ''
    draggingEl = null
    document.removeEventListener('mousemove', onDocumentMouseMove)
    document.removeEventListener('mouseup', stopDrag)
  }

  /** 左键按下时进入拖拽；标签未溢出则不拦截。 */
  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return
    const el = event.currentTarget as HTMLElement
    if (maxScrollLeft(el) <= 0) return
    draggingEl = el
    startX = event.pageX
    startScrollLeft = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
    document.addEventListener('mousemove', onDocumentMouseMove)
    document.addEventListener('mouseup', stopDrag)
  }

  /** 把滚轮增量映射到 scrollLeft；已到边界时放行，避免吞掉页面滚动。 */
  function onWheel(event: WheelEvent) {
    if (event.ctrlKey) return
    const el = event.currentTarget as HTMLElement
    const max = maxScrollLeft(el)
    if (max <= 0) return
    const delta = event.deltaX || event.deltaY
    if (delta === 0) return
    const next = Math.max(0, Math.min(max, el.scrollLeft + delta))
    if (next === el.scrollLeft) return
    event.preventDefault()
    el.scrollLeft = next
  }

  onUnmounted(stopDrag)
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

  .base-tabs__tab {
    flex: 0 0 auto;
    padding: var(--klc-spacing-sm) calc(var(--klc-spacing-sm) + 2px);
    border: 0;
    border-bottom: 2px solid transparent;
    color: var(--klc-color-ui-muted);
    background: transparent;
    font: inherit;
    font-size: var(--klc-typography-font-size-md);
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
    font-size: calc(var(--klc-typography-font-size-md) + 1px);
    line-height: 32px;
  }

  .base-tabs__indicator {
    position: absolute;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--klc-color-ui-accent);
    transition:
      left var(--klc-motion-duration-moderate) ease,
      width var(--klc-motion-duration-moderate) ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .base-tabs__indicator {
      transition: none;
    }
  }
</style>
