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
          <SearchField
            ref="searchFieldRef"
            v-model="search"
            :placeholder="searchPlaceholder"
            :aria-label="searchAriaLabel"
          />
          <AggregationSourceButton @click="emit('manageSources')" />
        </div>
        <slot name="body" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

  import { useClickOutside } from '../composables/useClickOutside'
  import { useFullscreenTeleportTarget } from '../composables/useFullscreenTeleportTarget'
  import { useTeleportedPopup } from '../composables/useTeleportedPopup'

  import AggregationSourceButton from './AggregationSourceButton.vue'
  import SearchField from './common/SearchField.vue'

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

  const { popupStyle, startPositionSync, stopPositionSync } = useTeleportedPopup(
    computed(() => props.anchor),
    panelRef,
    8,
  )

  /** 展开时同步定位并聚焦搜索框，收起时停止监听 */
  watch(
    () => props.show,
    (open) => {
      if (open) {
        startPositionSync()
        nextTick(() => searchFieldRef.value?.focus())
      } else {
        stopPositionSync()
      }
    },
  )

  // 点击弹层与触发元素之外时请求关闭
  useClickOutside(
    () => [props.anchor, panelRef.value],
    () => emit('close'),
    { enabled: () => props.show },
  )

  onBeforeUnmount(() => {
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
    display: flex;
    align-items: center;
    gap: 6px;
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
