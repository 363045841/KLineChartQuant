<!--
  表单字段：标签 + 控件 + 提示/错误的统一排版。
  提示与错误的 id 通过默认插槽作用域交给控件，消费方自己绑 aria-describedby。
-->
<template>
  <div class="base-field">
    <label v-if="label" class="base-field__label" :for="forId">{{ label }}</label>
    <slot :hint-id="hintId" :error-id="errorId" />
    <span v-if="hint" :id="hintId" class="base-field__hint">{{ hint }}</span>
    <span v-if="error" :id="errorId" class="base-field__error" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
  import { useId } from 'vue'

  withDefaults(
    defineProps<{
      /** 字段名称；为空时不渲染 label（用于纯控件行）。 */
      label?: string
      /** label 的 for，指向控件 id。 */
      forId?: string
      /** 控件下方的补充说明。 */
      hint?: string
      /** 校验错误；存在时以 alert 呈现。 */
      error?: string
    }>(),
    { label: '', forId: undefined, hint: '', error: '' },
  )

  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
</script>

<style scoped>
  .base-field {
    display: flex;
    flex-direction: column;
    gap: var(--klc-space-8, 8px);
    min-width: 0;
  }

  .base-field__label {
    color: var(--klc-color-ui-text-secondary);
    font-size: var(--klc-text-12-font-size, 12px);
    font-weight: var(--klc-text-label-12-font-weight, 500);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .base-field__hint {
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .base-field__error {
    color: var(--klc-color-danger, #e04a4a);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }
</style>
