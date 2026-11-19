<!--
  模态贴边搜索条：flush 变体 SearchField 加下边线，尾部默认插槽放动作按钮。
  指标选择、行情数据源、商品选择（搜索/比较/添加）与命令面板共用同一外观；
  整条不画底色，直接落在弹窗表面上，只用下边线分隔；聚焦时外观不变。
-->
<template>
  <div class="modal-search-bar">
    <SearchField
      ref="field"
      class="modal-search-bar__field"
      v-model="model"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :autofocus="autofocus"
      variant="flush"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
  import SearchField from '@vue-src/components/common/form/SearchField.vue'
  import { useTemplateRef } from 'vue'

  withDefaults(
    defineProps<{
      /** 输入框占位文案 */
      placeholder?: string
      /** 输入框可访问名称 */
      ariaLabel?: string
      /** 挂载后是否聚焦内部输入框，供弹窗展开时使用 */
      autofocus?: boolean
    }>(),
    {
      placeholder: '搜索',
      ariaLabel: '搜索',
      autofocus: true,
    },
  )

  const model = defineModel<string>({ required: true })

  const field = useTemplateRef<InstanceType<typeof SearchField>>('field')

  /** 把焦点交给内部输入框，供弹层展开等调用方主动触发。 */
  function focus(): void {
    field.value?.focus()
  }

  defineExpose({ focus })
</script>

<style scoped>
  .modal-search-bar {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-height: 42px;
    padding-inline-end: var(--base-modal-content-inset, var(--klc-space-12, 12px));
    border-bottom: 1px solid var(--klc-color-ui-border);
  }

  /* 搜索框铺满整行，尾部动作按钮保持自身宽度。 */
  .modal-search-bar__field {
    flex: 1 1 auto;
    min-width: 0;
  }

</style>
