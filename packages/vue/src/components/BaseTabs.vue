<!-- 共享下划线 Tabs：图表设置 / Agent 设置 / 颜色预设复用，统一 tab 样式与滑动指示器。 -->
<template>
  <nav ref="rootRef" class="base-tabs" role="tablist" :aria-label="ariaLabel">
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
  import { nextTick, onMounted, ref, watch } from 'vue'

  const props = defineProps<{
    /** 当前激活 tab 的 id。 */
    modelValue: T
    /** tab 列表，id 为泛型以保留调用方的联合类型。 */
    tabs: ReadonlyArray<{ id: T; label: string }>
    /** tablist 的可访问名称。 */
    ariaLabel?: string
  }>()
  const emit = defineEmits<{ 'update:modelValue': [id: T] }>()

  const rootRef = ref<HTMLElement | null>(null)
  const indicatorStyle = ref<{ left: string; width: string }>({ left: '0px', width: '0px' })

  /** 把下划线指示器对齐到当前激活 tab 的位置与宽度。 */
  function syncIndicator(): void {
    const active = rootRef.value?.querySelector<HTMLElement>('.base-tabs__tab.is-active')
    if (!active) return
    indicatorStyle.value = { left: `${active.offsetLeft}px`, width: `${active.offsetWidth}px` }
  }

  watch(
    () => props.modelValue,
    () => {
      void nextTick(syncIndicator)
    },
  )

  onMounted(() => {
    void nextTick(syncIndicator)
  })
</script>

<style scoped>
  .base-tabs {
    position: relative;
    display: flex;
    gap: 2px;
    padding: 0 20px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .base-tabs::-webkit-scrollbar {
    display: none;
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
