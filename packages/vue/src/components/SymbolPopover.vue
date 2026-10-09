<!--
  公共商品选择弹窗外壳：统一承载屏幕居中布局、tab 栏与搜索框。
  调用方通过 #tabs 提供数据源 tab、通过 #body 提供列表内容，弹层样式在本组件内统一。
-->
<template>
  <BaseModal
    :show="show"
    :title="dialogLabel"
    width="min(560px, calc(100vw - 32px))"
    max-height="calc(100dvh - 32px)"
    overlay-padding="var(--klc-space-16, 16px)"
    body-padding="0"
    @close="emit('close')"
  >
    <template #tabs>
      <div class="symbol-popover__filters">
        <slot name="tabs" />
      </div>
      <div class="symbol-popover__search">
        <SearchField
          ref="searchField"
          v-model="search"
          :placeholder="searchPlaceholder"
          :aria-label="searchAriaLabel"
          autofocus
        />
        <AggregationSourceButton @click="emit('manageSources')" />
      </div>
    </template>
    <slot name="body" />
  </BaseModal>
</template>

<script setup lang="ts">
  import { nextTick, useTemplateRef, watch } from 'vue'
  import AggregationSourceButton from './AggregationSourceButton.vue'
  import BaseModal from './BaseModal.vue'
  import SearchField from './common/SearchField.vue'

  const props = withDefaults(
    defineProps<{
      /** 弹层是否展开 */
      show: boolean
      /**
       * 触发元素。弹层已改为原生模态 dialog，关闭后焦点自动回到打开前的元素；
       * 保留该属性以兼容旧调用方。
       */
      anchor?: HTMLElement | null
      /** 弹层可访问名称 */
      dialogLabel: string
      /** 搜索框占位文案 */
      searchPlaceholder?: string
      /** 搜索框 aria-label */
      searchAriaLabel?: string
    }>(),
    {
      anchor: null,
      searchPlaceholder: '搜索',
      searchAriaLabel: '搜索',
    },
  )

  const search = defineModel<string>('search', { default: '' })

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'manageSources'): void
  }>()

  const searchField = useTemplateRef<InstanceType<typeof SearchField>>('searchField')

  // showModal() 后把焦点放到搜索框（dialog 默认聚焦第一个可聚焦元素，即关闭按钮）。
  watch(
    () => props.show,
    (open) => {
      if (open) void nextTick(() => requestAnimationFrame(() => searchField.value?.focus()))
    },
    { immediate: true },
  )
</script>

<style scoped>
  .symbol-popover__filters {
    display: flex;
    flex-direction: column;
  }

  .symbol-popover__filters:empty {
    display: none;
  }

  .symbol-popover__filters :deep(.base-tabs) {
    padding: 0 var(--klc-space-12, 12px);
    border-bottom: 0;
  }

  .symbol-popover__filters :deep(.base-tabs__tab) {
    padding-top: var(--klc-space-8, 8px);
    padding-bottom: var(--klc-space-8, 8px);
  }

  .symbol-popover__filters :deep(.base-tabs__indicator) {
    bottom: 6px;
  }

  .symbol-popover__search {
    display: flex;
    align-items: center;
    min-height: 42px;
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-surface);
  }

  .symbol-popover__search :deep(.search-field) {
    height: 42px;
    padding: 0 var(--klc-space-12, 12px);
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .symbol-popover__search :deep(.source-button) {
    margin-right: var(--klc-space-12, 12px);
  }
</style>
