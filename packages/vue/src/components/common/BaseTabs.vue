<!-- 共享下划线 Tabs：所有弹窗的 tab 栏共用同一套字号、内边距与指示器位置；标签溢出时支持滚轮与拖拽横向浏览。弹窗内标签文字与内容左缘对齐，见 --base-tabs-tab-pad-inline。 -->
<template>
  <nav
    ref="rootRef"
    class="base-tabs"
    :class="`base-tabs--${variant}`"
    role="tablist"
    :aria-label="ariaLabel"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @keydown="onKeydown"
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
      <slot name="tab" :tab="tab">{{ tab.label }}</slot>
    </button>
    <span class="base-tabs__indicator" aria-hidden="true" :style="indicatorStyle" />
  </nav>
</template>

<script setup lang="ts" generic="T extends string">
  import { useSlidingTabIndicator } from '@vue-src/composables/ui/useSlidingTabIndicator.js'
  import { onUnmounted, ref } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** 当前激活 tab 的 id。 */
      modelValue: T
      /** tab 列表，id 为泛型以保留调用方的联合类型。 */
      tabs: ReadonlyArray<{ id: T; label: string }>
      /** tablist 的可访问名称。 */
      ariaLabel?: string
      /** 外观变体：default 为弹窗下划线 Tab，compact 用于面板工具栏，segmented 为分段滑块。 */
      variant?: 'default' | 'compact' | 'segmented'
    }>(),
    { ariaLabel: undefined, variant: 'default' },
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

  /** 方向键在标签间移动并同步选中，符合 tablist 的键盘约定。 */
  function onKeydown(event: KeyboardEvent): void {
    const indexDelta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (indexDelta === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    if (props.tabs.length === 0) return
    const current = Math.max(
      0,
      props.tabs.findIndex((tab) => tab.id === props.modelValue),
    )
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? props.tabs.length - 1
          : (current + indexDelta + props.tabs.length) % props.tabs.length
    const next = props.tabs[nextIndex]
    if (!next) return
    emit('update:modelValue', next.id)
    rootRef.value?.querySelectorAll<HTMLElement>('.base-tabs__tab')[nextIndex]?.focus()
  }

  onUnmounted(stopDrag)
</script>

<style scoped>
  .base-tabs {
    /* 标签自身的内边距：容器内边距要扣掉它，才能让标签文字压在弹窗内容左缘上。 */
    --base-tabs-tab-pad-inline: calc(var(--klc-spacing-sm, 8px) + var(--klc-space-2, 2px));
    position: relative;
    display: flex;
    gap: 2px;
    /* 弹窗内 = inset − 标签内边距（文字落在 inset）；弹窗外 fallback 30px 等于原 20px 容器内边距。 */
    padding: 0
      max(
        0px,
        calc(var(--base-modal-content-inset, 30px) - var(--base-tabs-tab-pad-inline))
      );
    border-bottom: 1px solid var(--klc-color-ui-border);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .base-tabs::-webkit-scrollbar {
    display: none;
  }

  /* 面板工具栏里的紧凑变体：无底部边线，标签只保留纵向命中区。 */
  .base-tabs--compact {
    gap: var(--klc-space-16, 16px);
    padding-inline: 0;
    border-bottom: 0;
  }

  .base-tabs--compact .base-tabs__tab {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    min-height: 32px;
    padding: var(--klc-space-8, 8px) 0;
  }

  /* 分段变体：等宽标签 + 强调色滑块，用于弹窗头部视图切换。 */
  .base-tabs--segmented {
    gap: 0;
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-hover);
  }

  .base-tabs--segmented .base-tabs__tab {
    position: relative;
    z-index: 1;
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-8, 8px);
    height: var(--klc-density-default, 32px);
    padding: 0 var(--klc-space-12, 12px);
    border-bottom: 0;
    font-size: var(--klc-typography-font-size-md);
  }

  .base-tabs--segmented .base-tabs__tab.is-active {
    color: var(--klc-color-ui-on-accent);
  }

  .base-tabs--segmented .base-tabs__indicator {
    top: 0;
    bottom: 0;
    z-index: 0;
    height: auto;
    border-radius: calc(var(--klc-radius-md, 8px) - 1px);
    background: var(--klc-color-ui-accent);
  }

  .base-tabs__tab {
    flex: 0 0 auto;
    padding: var(--klc-spacing-sm, 8px) var(--base-tabs-tab-pad-inline);
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

  .base-tabs__indicator {
    position: absolute;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--klc-color-ui-accent);
    transition:
      left var(--klc-motion-dur-base) var(--klc-motion-ease-standard),
      width var(--klc-motion-dur-base) var(--klc-motion-ease-standard);
  }

</style>
