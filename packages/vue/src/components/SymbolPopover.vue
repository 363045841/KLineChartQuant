<!--
  公共商品选择弹窗外壳：统一承载屏幕居中布局、tab 栏与搜索框。
  调用方通过 #tabs 提供数据源 tab、通过 #body 提供列表内容，弹层样式在本组件内统一。
-->
<template>
  <Teleport :to="teleportTarget">
    <Transition name="symbol-popover">
      <div v-if="show" class="symbol-popover-overlay" @pointerdown.self="close">
      <div
        ref="panelRef"
        class="symbol-popover"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogLabel"
        @keydown.esc.stop.prevent="close"
        @keydown.tab="trapFocus"
      >
        <header class="symbol-popover__header">
          <span>{{ dialogLabel }}</span>
          <BaseTooltip content="关闭" placement="bottom">
            <button type="button" class="symbol-popover__close" aria-label="关闭" @click="close">
              <IconX aria-hidden="true" />
            </button>
          </BaseTooltip>
        </header>
        <div class="symbol-popover__filters">
          <slot name="tabs" />
        </div>
        <div class="symbol-popover__search">
          <SearchField
            ref="searchFieldRef"
            v-model="search"
            :placeholder="searchPlaceholder"
            :aria-label="searchAriaLabel"
          />
          <AggregationSourceButton @click="emit('manageSources')" />
        </div>
        <div class="symbol-popover__body"><slot name="body" /></div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue'

  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget.js'

  import AggregationSourceButton from './AggregationSourceButton.vue'
  import SearchField from './common/SearchField.vue'
  import BaseTooltip from './common/BaseTooltip.vue'
  import IconX from '~icons/tabler/x'

  const props = withDefaults(
    defineProps<{
      /** 弹层是否展开 */
      show: boolean
      /** 触发元素，用于弹层定位与点击外部判定 */
      anchor: HTMLElement | null
      /** 弹层可访问名称 */
      dialogLabel: string
      /** 搜索框占位文案 */
      searchPlaceholder?: string
      /** 搜索框 aria-label */
      searchAriaLabel?: string
    }>(),
    {
      searchPlaceholder: '搜索',
      searchAriaLabel: '搜索',
    },
  )

  const search = defineModel<string>('search', { default: '' })

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'manageSources'): void
  }>()

  const panelRef = ref<HTMLElement | null>(null)
  const searchFieldRef = ref<InstanceType<typeof SearchField> | null>(null)
  const teleportTarget = useFullscreenTeleportTarget()

  /** 展开时同步定位并聚焦搜索框，收起时停止监听 */
  function close(): void {
    emit('close')
    props.anchor?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function trapFocus(event: KeyboardEvent): void {
    const targets = panelRef.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
    )
    if (!targets?.length) return
    const first = targets[0]
    const last = targets[targets.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  watch(
    () => props.show,
    (open) => {
      if (open) {
        nextTick(() => searchFieldRef.value?.focus())
      }
    },
  )

</script>

<style scoped>
  /* 两种商品列表共用元信息徽标，保持字体、底色与间距一致。 */
  .symbol-popover__body :deep(.symbol-meta-badge) {
    flex: 0 0 auto;
    box-sizing: border-box;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-muted);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .symbol-popover-overlay {
    position: fixed;
    inset: 0;
    z-index: 1010;
    display: grid;
    place-items: center;
    padding: 16px;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.35);
  }

  .symbol-popover {
    z-index: 1010;
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .symbol-popover__filters {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .symbol-popover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    min-height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid var(--klc-color-ui-border);
    font-size: 13px;
    font-weight: 600;
  }

  .symbol-popover__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    color: var(--klc-color-ui-muted);
    background: transparent;
    cursor: pointer;
  }

  .symbol-popover__close:hover {
    background: var(--klc-color-ui-hover);
  }

  .symbol-popover__close svg {
    width: 15px;
    height: 15px;
  }

  .symbol-popover__filters :deep(.base-tabs) {
    padding: 0 12px;
    border-bottom: 0;
  }

  .symbol-popover__filters :deep(.base-tabs__tab) {
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .symbol-popover__filters :deep(.base-tabs__indicator) {
    bottom: 6px;
  }

  .symbol-popover__body {
    min-height: 0;
    overflow-y: auto;
  }

  .symbol-popover__search {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 0;
    min-height: 42px;
    padding: 0;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-surface);
  }

  .symbol-popover__search :deep(.search-field) {
    height: 42px;
    padding: 0 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .symbol-popover__search :deep(.source-button) {
    margin-right: 12px;
  }

  .symbol-popover-enter-active,
  .symbol-popover-leave-active {
    transition:
      opacity 0.15s ease;
  }

  .symbol-popover-enter-from,
  .symbol-popover-leave-to {
    opacity: 0;
  }

  @media (max-width: 768px), (max-height: 640px) {
    .symbol-popover {
      width: min(560px, calc(100vw - 32px));
    }
  }
</style>
