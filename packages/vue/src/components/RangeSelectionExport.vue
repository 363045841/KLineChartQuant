<!-- 区间选择工具栏：编辑时间范围、展示统计信息并触发批量导出。 -->
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
    <span
      class="range-return"
      :class="`range-return--${returnDirection}`"
      title="按区间首尾收盘价计算"
    >
      {{ formattedReturnRate }}
    </span>
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
  import { computed } from 'vue'

  import CanvasToolbar from './common/CanvasToolbar.vue'

  const props = defineProps<{
    startDate: string
    endDate: string
    startLabel: string
    endLabel: string
    count: number
    returnRate: number | null
  }>()

  defineEmits<{
    'update:startDate': [value: string]
    'update:endDate': [value: string]
    export: []
    clear: []
    batchSetting: []
  }>()

  /** 将收益率格式化为固定两位、带涨跌符号的百分比。 */
  const formattedReturnRate = computed(() => {
    if (props.returnRate === null || !Number.isFinite(props.returnRate)) return '--'
    const sign = props.returnRate > 0 ? '+' : ''
    return `${sign}${props.returnRate.toFixed(2)}%`
  })

  /** 根据收益率方向提供语义颜色。 */
  const returnDirection = computed(() => {
    if (props.returnRate === null || !Number.isFinite(props.returnRate) || props.returnRate === 0) {
      return 'flat'
    }
    return props.returnRate > 0 ? 'up' : 'down'
  })
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
    display: flex;
    align-items: center;
    height: 18px;
  }

  .range-return {
    display: flex;
    align-items: center;
    height: 18px;
    padding: 0 10px;
    border-left: 1px solid var(--klc-color-border-button);
    border-right: 1px solid var(--klc-color-border-button);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
    user-select: none;
  }

  .range-return--up {
    color: var(--klc-color-performance-positive);
  }

  .range-return--down {
    color: var(--klc-color-performance-negative);
  }

  .range-return--flat {
    color: var(--klc-color-performance-neutral);
  }
</style>
