<template>
  <CanvasToolbar>
    <input
      class="range-input"
      :value="startDate"
      :placeholder="startLabel"
      @input="$emit('update:startDate', ($event.target as HTMLInputElement).value)"
    />
    <span class="range-sep">~</span>
    <input
      class="range-input"
      :value="endDate"
      :placeholder="endLabel"
      @input="$emit('update:endDate', ($event.target as HTMLInputElement).value)"
    />
    <span class="range-count">共 {{ count }} 条</span>
    <button type="button" class="toolbar-btn" title="批量设置" @click="$emit('batchSetting')">
      批量设置
    </button>
    <button type="button" class="toolbar-btn" title="导出" @click="$emit('export')">导出</button>
    <button
      type="button"
      class="toolbar-btn toolbar-btn--delete"
      title="取消选区"
      @click="$emit('clear')"
    >
      <svg
        class="delete-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    </button>
  </CanvasToolbar>
</template>

<script setup lang="ts">
  import CanvasToolbar from './common/CanvasToolbar.vue'

  defineProps<{
    startDate: string
    endDate: string
    startLabel: string
    endLabel: string
    count: number
  }>()

  defineEmits<{
    'update:startDate': [value: string]
    'update:endDate': [value: string]
    export: []
    clear: []
    batchSetting: []
  }>()
</script>

<style scoped>
  .range-input {
    color: var(--klc-color-axis-text);
    font-size: 12px;
    white-space: nowrap;
    border: none;
    background: transparent;
    outline: none;
    padding: 0 8px;
    width: auto;
    field-sizing: content;
    min-width: 60px;
    height: 26px;
    box-sizing: border-box;
    font-family: inherit;
    border-radius: 4px;
    text-align: center;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .range-input::placeholder {
    color: var(--klc-color-axis-text);
    opacity: 0.6;
  }

  .range-input:hover,
  .range-input:focus {
    background: var(--klc-color-grid-minor);
    color: var(--klc-color-foreground);
  }

  .range-sep {
    color: var(--klc-color-axis-text);
    font-size: 12px;
    opacity: 0.6;
    user-select: none;
  }

  .range-count {
    color: var(--klc-color-axis-text);
    font-size: 12px;
    white-space: nowrap;
    user-select: none;
    padding: 0 8px;
    margin-right: 4px;
    display: flex;
    align-items: center;
    height: 18px;
    border-right: 1px solid var(--klc-color-border-button);
  }
</style>
