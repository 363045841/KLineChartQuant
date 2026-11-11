<!--
  通用搜索输入框：统一搜索图标、输入控件与清空按钮的样式与交互。
  仅承载受控输入本身；宽度、聚焦时机等布局与业务逻辑由调用方决定。
-->
<template>
  <div class="search-field" :class="[`search-field--${variant}`, { 'search-field--disabled': disabled }]">
    <span class="search-field__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.6" />
        <line
          x1="10.5"
          y1="10.5"
          x2="14.5"
          y2="14.5"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </span>
    <input
      ref="inputRef"
      class="search-field__input"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      :autofocus="autofocus"
      :disabled="disabled"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
    />
    <button
      v-if="clearable && modelValue && !disabled"
      type="button"
      class="search-field__clear"
      aria-label="清空搜索"
      @click="clear"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
  /** 受控搜索框：通过 v-model 读写值，清空与聚焦由组件内部处理。 */
  import { ref } from 'vue'

  withDefaults(
    defineProps<{
      /** 受控搜索值 */
      modelValue: string
      /** 输入框占位文案 */
      placeholder?: string
      /** 输入框可访问名称 */
      ariaLabel?: string
      /** 是否在有输入内容时显示清空按钮 */
      clearable?: boolean
      /** 挂载后是否自动聚焦内部输入框，供弹窗打开时聚焦搜索使用 */
      autofocus?: boolean
      /** 禁用态。 */
      disabled?: boolean
      /** 外观变体：default 为独立圆角框；flush 用于弹窗头部；compact 用于面板内嵌。 */
      variant?: 'default' | 'flush' | 'compact'
    }>(),
    {
      placeholder: '搜索',
      ariaLabel: '搜索',
      clearable: true,
      autofocus: false,
      disabled: false,
      variant: 'default',
    },
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
  }>()

  const inputRef = ref<HTMLInputElement | null>(null)

  /** 将输入值同步给父级受控状态 */
  function onInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value)
  }

  /** 清空输入并回焦输入框 */
  function clear() {
    emit('update:modelValue', '')
    inputRef.value?.focus()
  }

  /** 聚焦输入框，供弹层展开等调用方主动触发 */
  function focus() {
    inputRef.value?.focus()
  }

  defineExpose({ focus })
</script>

<style scoped>
  .search-field {
    /* 高度契约：变体只覆盖 --search-field-height，调用方不写 height。
       伸缩与宽度属于所在布局，由调用方决定，组件不自带 flex。 */
    --search-field-height: var(--klc-density-default, 32px);
    box-sizing: border-box;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    height: var(--search-field-height);
    padding: 0 var(--klc-space-12, 12px);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--klc-radius-sm, 6px);
    background: var(--klc-color-ui-control-background);
  }

  /* 弹窗头部内嵌：去掉独立框，铺满整行；横向内边距跟随弹窗内容左缘。 */
  .search-field--flush {
    --search-field-height: 42px;
    padding: 0 var(--base-modal-content-inset, var(--klc-space-12, 12px));
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  /* 面板内嵌的紧凑搜索：24 行高 + 上下各 2 的余量，与 BaseButton md(28px) 同高。 */
  .search-field--compact {
    --search-field-height: calc(
      var(--klc-density-compact, 24px) + var(--klc-space-4, 4px)
    );
    gap: var(--klc-space-4, 4px);
    padding: 0 calc(var(--klc-space-8, 8px) + var(--klc-space-2, 2px));
    border-radius: var(--klc-radius-md, 8px);
    background: var(--klc-color-ui-input);
  }

  .search-field--compact .search-field__input {
    font-size: var(--klc-text-12-font-size, 12px);
  }

  .search-field:focus-within {
    border-color: var(--klc-color-ui-border-strong);
  }

  .search-field--flush:focus-within {
    border-color: transparent;
  }

  .search-field--disabled {
    opacity: 0.6;
  }

  .search-field__icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    color: var(--klc-color-ui-muted);
  }

  .search-field__icon svg {
    width: 15px;
    height: 15px;
  }

  .search-field__input {
    flex: 1 1 0;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: 13px;
    line-height: 1;
  }

  .search-field__input::placeholder {
    color: var(--klc-color-ui-muted);
    opacity: 0.7;
  }

  .search-field__clear {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .search-field__clear:hover {
      background: var(--klc-color-ui-hover);
      color: var(--klc-color-ui-text);
    }
  }

  .search-field__clear:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 1px;
  }

  .search-field__clear svg {
    width: 13px;
    height: 13px;
  }
</style>
