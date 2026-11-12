<!--
  空状态：统一图标、正文、提示与可访问角色的排版。
  各面板不再手写 xxx__empty 的 div/p；需要图标用 #icon，需要补充说明用 #hint。
-->
<template>
  <component :is="as" class="base-empty-state" :class="[`base-empty-state--${size}`]" :role="role">
    <span v-if="$slots.icon" class="base-empty-state__icon">
      <slot name="icon" />
    </span>
    <div class="base-empty-state__body"><slot /></div>
    <p v-if="$slots.hint" class="base-empty-state__hint"><slot name="hint" /></p>
  </component>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      /** 渲染标签；列表内用 li，其余用 div。 */
      as?: 'div' | 'li' | 'section'
      /** compact 用于列表内联空态，default 用于整块内容区。 */
      size?: 'compact' | 'default'
      /** 可访问角色；纯装饰空态可不传。 */
      role?: 'status' | 'alert'
    }>(),
    { as: 'div', size: 'default', role: undefined },
  )
</script>

<style scoped>
  .base-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--klc-space-8, 8px);
    padding-block: var(--klc-space-24, 24px);
    padding-inline: 0;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    text-align: center;
  }

  .base-empty-state--compact {
    gap: var(--klc-space-4, 4px);
    padding-block: var(--klc-space-16, 16px);
  }

  .base-empty-state__body {
    margin: 0;
    color: var(--klc-color-ui-muted);
    font-size: inherit;
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .base-empty-state__hint {
    margin: 0;
    color: var(--klc-color-axis-text);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .base-empty-state__icon {
    display: flex;
    color: var(--klc-color-ui-muted);
    opacity: 0.5;
  }

  .base-empty-state__icon :slotted(svg) {
    width: 24px;
    height: 24px;
  }
</style>
