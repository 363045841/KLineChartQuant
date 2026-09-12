<!--
  通用搜索输入框：统一搜索图标、输入控件与清空按钮的样式与交互。
  仅承载受控输入本身；宽度、聚焦时机等布局与业务逻辑由调用方决定。
-->
<template>
  <div class="search-field">
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
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
    />
    <button
      v-if="clearable && modelValue"
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
    }>(),
    {
      placeholder: '搜索',
      ariaLabel: '搜索',
      clearable: true,
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
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    box-sizing: border-box;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 8px;
    background: var(--klc-color-ui-control-background);
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

  .search-field__clear:hover {
    background: var(--klc-color-ui-hover);
    color: var(--klc-color-ui-text);
  }

  .search-field__clear svg {
    width: 13px;
    height: 13px;
  }
</style>
