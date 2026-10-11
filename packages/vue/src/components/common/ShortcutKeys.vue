<!--
  快捷键按键块：把组合串（如 `Ctrl+Shift+Z`）渲染成一排 keycap。
  命令面板、快捷键设置与 tooltip 共用，避免各自散落拆分与样式。
-->
<template>
  <span
    v-if="parts.length > 0"
    class="shortcut-key-group"
    :class="{ 'shortcut-key-group--tooltip': variant === 'tooltip' }"
  >
    <template v-for="(part, index) in parts" :key="index">
      <kbd class="shortcut-key">{{ part }}</kbd>
      <span v-if="index < parts.length - 1" class="shortcut-key__plus">+</span>
    </template>
  </span>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** 已平台化格式化的组合串；为空时不渲染。 */
      shortcut?: string | null
      /** 外观变体：default 用于界面，tooltip 用于深色提示框。 */
      variant?: 'default' | 'tooltip'
    }>(),
    { shortcut: null, variant: 'default' },
  )

  /** 组合串按 + 拆成独立按键块。 */
  const parts = computed(() => (props.shortcut ? props.shortcut.split('+') : []))
</script>

<style scoped src="./shortcut-key.css"></style>

<style scoped>
  .shortcut-key-group--tooltip {
    gap: 3px;
  }

  .shortcut-key-group--tooltip .shortcut-key {
    min-width: 16px;
    height: 18px;
    padding: 0 4px;
    border-color: var(--klc-color-tooltip-border);
    border-radius: var(--klc-radius-xs, 4px);
    background: var(--klc-color-tooltip-bg);
    box-shadow: none;
    color: var(--klc-color-tooltip-text);
    line-height: 16px;
  }

  .shortcut-key-group--tooltip .shortcut-key__plus {
    color: var(--klc-color-tooltip-text);
  }
</style>
