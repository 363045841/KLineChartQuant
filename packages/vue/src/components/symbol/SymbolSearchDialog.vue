<!--
  公共商品选择弹窗外壳：统一承载屏幕居中布局、tab 栏与搜索框。
  调用方通过 #tabs 提供数据源 tab、通过 #body 提供列表内容，弹层样式在本组件内统一。
-->
<template>
  <BaseModal
    :open="show"
    :title="dialogLabel"
    size="md"
    @update:open="!$event && emit('close')"
  >
    <template #tabs>
      <div v-if="$slots.tabs" class="symbol-popover__filters">
        <slot name="tabs" />
      </div>
      <ModalSearchBar
        v-model="search"
        :placeholder="searchPlaceholder"
        :aria-label="searchAriaLabel"
      >
        <AggregationSourceButton v-if="manageSources" @click="emit('manageSources')" />
      </ModalSearchBar>
    </template>
    <slot name="body" />
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseModal from '@vue-src/components/common/dialog/BaseModal.vue'
  import ModalSearchBar from '@vue-src/components/common/dialog/ModalSearchBar.vue'
  import AggregationSourceButton from './AggregationSourceButton.vue'

  withDefaults(
    defineProps<{
      /** 弹层是否展开 */
      show: boolean
      /** 弹层可访问名称 */
      dialogLabel: string
      /** 搜索框占位文案 */
      searchPlaceholder?: string
      /** 搜索框 aria-label */
      searchAriaLabel?: string
      /** 是否显示数据源管理入口 */
      manageSources?: boolean
    }>(),
    {
      searchPlaceholder: '搜索',
      searchAriaLabel: '搜索',
      manageSources: true,
    },
  )

  const search = defineModel<string>('search', { required: true })

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'manageSources'): void
  }>()

</script>

<style scoped>
  .symbol-popover__filters {
    display: flex;
    flex-direction: column;
  }
</style>
