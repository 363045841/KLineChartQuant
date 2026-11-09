<!--
  共享胶囊：展示短标签或已选指标，可选关闭按钮。
  - soft：默认的填充胶囊；outline：描边胶囊；
  - 关闭按钮只发出 remove 事件，由调用方决定移除语义。
-->
<template>
  <span class="base-chip" :class="[`base-chip--${variant}`, `base-chip--${size}`]">
    <span class="base-chip__label"><slot /></span>
    <button
      v-if="removable"
      type="button"
      class="base-chip__remove"
      :aria-label="removeLabel"
      @click="emit('remove')"
    >
      <IconTablerX aria-hidden="true" />
    </button>
  </span>
</template>

<script setup lang="ts">
  import IconTablerX from '~icons/tabler/x'

  withDefaults(
    defineProps<{
      /** 是否显示关闭按钮。 */
      removable?: boolean
      /** 关闭按钮的可访问名称。 */
      removeLabel?: string
      /** 尺寸；sm 用于紧凑的元信息标签。 */
      size?: 'sm' | 'md'
      /** 外观：soft 填充，outline 描边。 */
      variant?: 'soft' | 'outline'
    }>(),
    { removable: false, removeLabel: '移除', size: 'md', variant: 'soft' },
  )

  const emit = defineEmits<{ remove: [] }>()
</script>

<style scoped>
  .base-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-space-4, 4px);
    max-width: 100%;
    height: 22px;
    padding: 0 var(--klc-space-8, 8px) 0 10px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: 1;
    white-space: nowrap;
  }

  .base-chip--outline {
    border-color: var(--klc-color-ui-border);
    background: transparent;
    color: var(--klc-color-ui-muted);
  }

  .base-chip--sm {
    height: 18px;
    padding: 0 7px;
    font-size: var(--klc-text-11-font-size, 11px);
  }

  .base-chip__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .base-chip__remove {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-inline-end: calc(-1 * var(--klc-space-4, 4px));
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .base-chip__remove:hover {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }

  .base-chip__remove:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 1px;
  }

  .base-chip__remove svg {
    width: 12px;
    height: 12px;
  }
</style>
