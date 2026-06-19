<template>
  <div
    ref="toolbarRef"
    class="top-toolbar"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
  >
    <SymbolSelector
      v-if="displaySymbol"
      :symbol="displaySymbol"
      :symbols="symbolPool"
      :loading="symbolLoading"
      :error="symbolError"
      @change="onSymbolSelectorChange"
    />
    <CompareSymbolSelector
      :symbols="symbolPool"
      :selected="overlaySymbols"
      :selected-items="overlaySymbolItems"
      :comparison-colors="comparisonColors"
      :comparison-loading="comparisonLoading"
      @add="emit('addOverlaySymbol', $event)"
      @remove="emit('removeOverlaySymbol', $event)"
    />
    <KLineLevelDropdown
      :model-value="kLineLevel"
      @update:model-value="emit('kLineLevelChange', $event)"
    />
    <KLineAdjustmentDropdown
      :model-value="kLineAdjust"
      @update:model-value="emit('kLineAdjustChange', $event)"
    />
    <button
      type="button"
      class="indicator-button"
      title="指标"
      aria-label="指标"
      @click="emit('toggleIndicator')"
    >
      <span class="indicator-button__icon" aria-hidden="true">fx</span>
      <span class="indicator-button__text">指标</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import KLineLevelDropdown, { type KLineLevel } from './KLineLevelDropdown.vue'
import KLineAdjustmentDropdown, { type KLineAdjustment } from './KLineAdjustmentDropdown.vue'
import SymbolSelector from './SymbolSelector.vue'
import CompareSymbolSelector from './CompareSymbolSelector.vue'
import type { SymbolItem } from './SymbolSelector.vue'

export type { SymbolItem }

const toolbarRef = ref<HTMLElement | null>(null)

let isDown = false
let startX = 0
let scrollLeft = 0

function onMouseDown(e: MouseEvent) {
  const el = toolbarRef.value
  if (!el) return
  isDown = true
  startX = e.pageX - el.getBoundingClientRect().left
  scrollLeft = el.scrollLeft
  el.style.cursor = 'grabbing'
  el.style.userSelect = 'none'
}

function onMouseMove(e: MouseEvent) {
  if (!isDown) return
  const el = toolbarRef.value
  if (!el) return
  e.preventDefault()
  const x = e.pageX - el.getBoundingClientRect().left
  const walk = x - startX
  el.scrollLeft = scrollLeft - walk
}

function onMouseUp() {
  if (!isDown) return
  isDown = false
  const el = toolbarRef.value
  if (!el) return
  el.style.cursor = ''
  el.style.userSelect = ''
}

const props = defineProps<{
  symbol?: string
  kLineLevel?: string
  kLineAdjust?: string
  symbols?: SymbolItem[]
  symbolLoading?: boolean
  symbolError?: boolean
  overlaySymbols?: string[]
  overlaySymbolItems?: SymbolItem[]
  comparisonColors?: Map<string, string>
  comparisonLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'addOverlaySymbol', item: SymbolItem): void
  (e: 'removeOverlaySymbol', code: string): void
  (e: 'kLineLevelChange', level: KLineLevel): void
  (e: 'kLineAdjustChange', adjust: KLineAdjustment): void
  (e: 'toggleIndicator'): void
  (e: 'symbolChange', symbol: SymbolItem): void
}>()

const MOCK_SYMBOLS: SymbolItem[] = [
  // ── TradingView 全球品种 ──
  { code: 'XAUUSD', description: '现货黄金', exchange: 'OANDA', source: 'tradingview' },
  { code: 'BTCUSDT', description: 'Bitcoin / Tether', exchange: 'BINANCE', source: 'tradingview' },
  { code: 'ETHUSDT', description: 'Ethereum / Tether', exchange: 'BINANCE', source: 'tradingview' },
  { code: 'EURUSD', description: '欧元/美元', exchange: 'OANDA', source: 'tradingview' },
  { code: 'SPX', description: '标普 500 指数', exchange: 'SP', source: 'tradingview' },
  { code: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', source: 'tradingview' },
  { code: 'TSLA', description: 'Tesla, Inc.', exchange: 'NASDAQ', source: 'tradingview' },
  { code: '1810', description: '小米集团', exchange: 'HKEX', source: 'tradingview' },
  // ── gotdx A 股 ──
  { code: '600519', description: '贵州茅台', exchange: 'SSE', source: 'gotdx' },
  { code: '601360', description: '三六零', exchange: 'SSE', source: 'gotdx' },
  { code: '000858', description: '五 粮 液', exchange: 'SZSE', source: 'gotdx' },
  { code: '000001', description: '平安银行', exchange: 'SZSE', source: 'gotdx' },
  // ── Mock ──
  { code: 'MOCK-100', description: 'Mock 100 条', exchange: 'MOCK', source: 'mock-100' },
  { code: 'MOCK-10000', description: 'Mock 10000 条', exchange: 'MOCK', source: 'mock-10000' },
]

const displaySymbol = computed(() => props.symbol?.trim() ?? '')

const symbolPool = computed<SymbolItem[]>(() =>
  props.symbols && props.symbols.length ? props.symbols : MOCK_SYMBOLS,
)

function onSymbolSelectorChange(item: SymbolItem) {
  emit('symbolChange', item)
}
</script>

<style scoped>
.top-toolbar {
  position: relative;
  width: 95%;
  height: 40px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--klc-color-border-chart);
  border-radius: 3px;
  background: var(--klc-color-background);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  user-select: none;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.top-toolbar::-webkit-scrollbar {
  display: none;
}

.indicator-button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--klc-color-border-button);
  border-radius: 4px;
  background: var(--klc-color-background);
  color: var(--klc-color-foreground);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.indicator-button:hover {
  border-color: var(--klc-color-axis-text);
  background: var(--klc-color-grid-minor);
}

.indicator-button__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: var(--klc-color-foreground);
  color: var(--klc-color-background);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.5px;
}

.indicator-button__text {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

@media (max-width: 768px), (max-height: 640px) {
  .indicator-button__text {
    display: none;
  }
  .indicator-button {
    height: 26px;
  }
}
</style>
