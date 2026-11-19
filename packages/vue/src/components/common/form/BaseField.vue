<!-- 统一字段排版与可访问关联。默认插槽把 controlAttrs 绑定到实际表单控件。 -->
<template>
  <div class="base-field">
    <label class="base-field__label" :for="id">{{ label }}</label>
    <slot :control-attrs="controlAttrs" />
    <span v-if="hint" :id="hintId" class="base-field__hint">{{ hint }}</span>
    <span v-if="error" :id="errorId" class="base-field__error" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed, useId } from 'vue'

  const props = defineProps<{ label: string; hint?: string; error?: string }>()

  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const controlAttrs = computed(() => ({
    id,
    'aria-describedby': [props.hint && hintId, props.error && errorId].filter(Boolean).join(' ') || undefined,
    'aria-invalid': props.error ? true : undefined,
  }))
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
