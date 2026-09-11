<!--
  公共商品选择弹层外壳：统一承载 Teleport 定位、tab 栏与搜索框。
  调用方通过 #tabs 提供数据源 tab、通过 #body 提供列表内容，弹层样式在本组件内统一。
-->
<template>
  <Teleport :to="teleportTarget">
    <Transition name="symbol-popover">
      <div
        v-if="show"
        ref="panelRef"
        class="symbol-popover"
        :style="popupStyle"
        role="dialog"
        :aria-label="dialogLabel"
      >
        <slot name="tabs" />
        <div class="symbol-popover__search">
          <span class="symbol-popover__search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.6" />
              <line
                x1="10.5"
                y1="10.5"
                x2="14.5"
                y2="14.5"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <input
            ref="inputRef"
            v-model="search"
            class="symbol-popover__input"
            type="text"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            spellcheck="false"
            :aria-label="searchAriaLabel"
          />
          <button
            v-if="search"
            type="button"
            class="symbol-popover__clear"
            aria-label="清空搜索"
            @click="clearSearch"
          >
            <svg
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
          <AggregationSourceButton @click="emit('manageSources')" />
        </div>
        <slot name="body" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup'

  import AggregationSourceButton from './AggregationSourceButton.vue'

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
  const inputRef = ref<HTMLInputElement | null>(null)
  const teleportTarget = useFullscreenTeleportTarget()

  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    computed(() => props.anchor),
    panelRef,
    8,
  )

  /** 清空搜索并回焦输入框 */
  function clearSearch() {
    search.value = ''
    inputRef.value?.focus()
  }

  /** 展开时同步定位并聚焦搜索框，收起时停止监听 */
  watch(
    () => props.show,
    (open) => {
      if (open) {
        startPositionSync()
        nextTick(() => inputRef.value?.focus())
      } else {
        stopPositionSync()
      }
    },
  )

  /** 点击弹层与触发元素之外时请求关闭 */
  function onDocumentPointerDown(event: MouseEvent) {
    if (!props.show) return
    const path = event.composedPath()
    if (props.anchor && path.includes(props.anchor)) return
    if (panelRef.value && path.includes(panelRef.value)) return
    emit('close')
  }

  onMounted(() => document.addEventListener('mousedown', onDocumentPointerDown))
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentPointerDown)
    stopPositionSync()
  })
</script>

<style scoped>
  .symbol-popover {
    z-index: 110;
    width: min(360px, calc(100vw - 24px));
    padding: 14px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-surface);
    color: var(--klc-color-ui-text);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .symbol-popover__search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 32px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-control-background);
  }

  .symbol-popover__search-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    color: var(--klc-color-ui-muted);
  }

  .symbol-popover__input {
    flex: 1 1 0;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 13px;
    line-height: 1;
  }

  .symbol-popover__input::placeholder {
    color: var(--klc-color-ui-muted);
    opacity: 0.7;
  }

  .symbol-popover__clear {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .symbol-popover__clear:hover {
    border-color: var(--klc-color-ui-border);
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .symbol-popover__clear svg {
    width: 14px;
    height: 14px;
  }

  .symbol-popover-enter-active,
  .symbol-popover-leave-active {
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .symbol-popover-enter-from,
  .symbol-popover-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }

  @media (max-width: 768px), (max-height: 640px) {
    .symbol-popover {
      width: min(320px, calc(100vw - 16px));
      padding: 12px;
      gap: 8px;
    }
  }
</style>
