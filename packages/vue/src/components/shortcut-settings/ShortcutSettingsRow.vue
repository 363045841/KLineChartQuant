<!--
  快捷键设置的单行：命令图标与名称 + 录入控件 + 清除按钮。
  键盘录入与冲突处理由父级 ShortcutSettings 负责，本组件只负责展示与转发事件。
-->
<template>
  <div class="shortcut-settings__row">
    <div class="shortcut-settings__label">
      <span class="shortcut-settings__icon">
        <component :is="icon" v-if="icon" aria-hidden="true" />
      </span>
      <span class="shortcut-settings__text">
        <span class="shortcut-settings__title">{{ title.zh }}</span>
        <span class="shortcut-settings__description">{{ title.en }}</span>
      </span>
    </div>

    <button
      type="button"
      class="shortcut-settings__capture"
      :class="{ 'is-capturing': capturing }"
      :data-shortcut-id="id"
      :aria-label="`${title.zh}快捷键`"
      :title="`设置${title.zh}快捷键`"
      @click="emit('begin')"
      @keydown="emit('keydown', $event)"
      @blur="emit('blur')"
    >
      <span v-if="capturing" class="shortcut-settings__placeholder">按下组合键</span>
      <ShortcutKeys v-else-if="value" :shortcut="value" />
      <span v-else class="shortcut-settings__placeholder">设置快捷键</span>
    </button>

    <button
      v-if="value"
      type="button"
      class="shortcut-settings__clear"
      :aria-label="`清除${title.zh}快捷键`"
      title="清除快捷键"
      @click="emit('clear')"
    >
      <IconTablerX aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
  import type { CommandTitle } from '@363045841yyt/klinechart-core'
  import type { Component } from 'vue'
  import IconTablerX from '~icons/tabler/x'
  import ShortcutKeys from '../common/ShortcutKeys.vue'

  defineProps<{
    /** 命令 id，作为录入按钮的定位标识。 */
    id: string
    /** 命令双语标题。 */
    title: CommandTitle
    /** 当前快捷键展示串；空串表示未设置。 */
    value: string
    /** 是否处于录入态。 */
    capturing: boolean
    /** 命令功能图标；未登记时为 null。 */
    icon: Component | null
  }>()

  const emit = defineEmits<{
    /** 点击进入录入态。 */
    begin: []
    /** 录入态下的按键事件。 */
    keydown: [event: KeyboardEvent]
    /** 失焦退出录入态。 */
    blur: []
    /** 清除当前快捷键。 */
    clear: []
  }>()
</script>

<style scoped>
  .shortcut-settings__row {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8, 8px);
    min-height: 52px;
  }

  .shortcut-settings__label {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    gap: 6px;
    min-width: 0;
  }

  .shortcut-settings__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 16px;
    width: 16px;
    color: var(--klc-color-ui-muted);
  }

  .shortcut-settings__icon svg {
    width: 14px;
    height: 14px;
  }

  .shortcut-settings__title {
    overflow: hidden;
    color: var(--klc-color-ui-text);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shortcut-settings__description {
    overflow: hidden;
    color: var(--klc-color-ui-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shortcut-settings__capture {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 140px;
    min-height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .shortcut-settings__capture:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  .shortcut-settings__capture.is-capturing {
    padding: 5px 8px;
    border: 1px dashed var(--klc-color-ui-accent);
    border-radius: var(--klc-radius-sm, 6px);
    background: var(--klc-color-ui-selected, var(--klc-color-ui-hover));
    color: var(--klc-color-ui-accent);
  }

  .shortcut-settings__placeholder {
    color: var(--klc-color-ui-muted);
    font-size: 12px;
  }

  .shortcut-settings__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--klc-radius-sm, 6px);
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .shortcut-settings__clear:hover {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .shortcut-settings__clear svg {
    width: 14px;
    height: 14px;
  }
</style>

<style scoped src="../common/list-text.css"></style>
