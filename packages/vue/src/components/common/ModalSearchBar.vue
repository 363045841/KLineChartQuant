<!--
  模态贴边搜索条：flush 变体 SearchField 加上下边线，尾部默认插槽放动作按钮。
  指标选择、行情数据源、商品选择（搜索/比较/添加）与命令面板共用同一外观；
  命令面板顶部已有 header 分隔，通过 topBorder=false 只保留下边线。
  聚焦只提亮已有边线，不画焦点环、不加外发光。
-->
<template>
  <div class="modal-search-bar" :class="{ 'modal-search-bar--no-top': !topBorder }">
    <SearchField
      ref="field"
      :model-value="modelValue"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :autofocus="autofocus"
      variant="flush"
      @update:model-value="updateValue"
    />
    <slot />
  </div>
</template>

<script setup lang="ts">
  import SearchField from '@vue-src/components/common/SearchField.vue'
  import { useTemplateRef } from 'vue'

  withDefaults(
    defineProps<{
      /** 受控搜索值 */
      modelValue: string
      /** 输入框占位文案 */
      placeholder?: string
      /** 输入框可访问名称 */
      ariaLabel?: string
      /** 挂载后是否聚焦内部输入框，供弹窗展开时使用 */
      autofocus?: boolean
      /** 是否画上边线；顶部已有 header 分隔的弹窗传 false，只保留下边线 */
      topBorder?: boolean
    }>(),
    {
      placeholder: '搜索',
      ariaLabel: '搜索',
      autofocus: false,
      topBorder: true,
    },
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
  }>()

  /** 把输入值回传给调用方的受控状态 */
  function updateValue(value: string): void {
    emit('update:modelValue', value)
  }

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
    padding-inline-end: var(--klc-space-12, 12px);
    border-top: 1px solid var(--klc-color-ui-border);
    border-bottom: 1px solid var(--klc-color-ui-border);
    background: var(--klc-color-ui-surface);
    transition: border-color var(--klc-motion-dur-fast, 160ms)
      var(--klc-motion-ease-out, ease-out);
  }

  /* 搜索框聚焦时只提亮已有上下边线；不画框、不加外发光。 */
  .modal-search-bar:focus-within {
    border-top-color: var(--klc-color-ui-border-strong);
    border-bottom-color: var(--klc-color-ui-border-strong);
  }

  /* 顶部已由上层 header 分隔时只保留下边线。 */
  .modal-search-bar--no-top {
    border-top-width: 0;
  }
</style>
