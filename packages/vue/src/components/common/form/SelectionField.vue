<!--
  表单里的通栏选择入口：展示当前值或占位，点击交给宿主打开选择弹窗。
  - 只负责外观与状态插槽，不持有选择状态，也不决定弹窗开合；
  - 视觉基于 control-button，尺寸与弹窗表单控件一致；
  - 状态插槽只承载调用方的加载/错误反馈，组件本身不理解业务状态。
-->
<template>
  <button
    type="button"
    class="control-button control-button--field selection-field"
    :class="{ 'is-empty': !value }"
  >
    <span class="selection-field__value">{{ value || placeholder }}</span>
    <span v-if="$slots.status" class="selection-field__status"><slot name="status" /></span>
    <IconChevronDown class="selection-field__chevron" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/control-button.css'
  import IconChevronDown from '~icons/tabler/chevron-down'

  defineProps<{
    /** 当前值；空串时显示占位。 */
    value: string
    /** 无值时的占位文案。 */
    placeholder: string
  }>()
</script>

<style scoped>
  /* 通栏选择字段铺满父容器；参数下拉不声明宽度，按内容自适应。 */
  .selection-field {
    --control-button-width: 100%;
  }

  .selection-field.is-empty {
    color: var(--klc-color-ui-text-soft);
  }

  /* 值吃掉剩余宽度，状态与箭头始终贴右。 */
  .selection-field__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .selection-field__status {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--klc-space-4);
  }

  .selection-field__chevron {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--klc-color-ui-muted);
  }
</style>
