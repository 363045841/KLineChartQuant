<template>
  <div class="top-toolbar">
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
      @add="emit('addOverlaySymbol', $event)"
      @remove="emit('removeOverlaySymbol', $event)"
    />
    <KLineLevelDropdown
      :model-value="kLineLevel"
      @update:model-value="emit('kLineLevelChange', $event)"
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
import { computed } from 'vue'
import KLineLevelDropdown, { type KLineLevel } from './KLineLevelDropdown.vue'
import SymbolSelector from './SymbolSelector.vue'
import CompareSymbolSelector from './CompareSymbolSelector.vue'
import type { SymbolItem } from './SymbolSelector.vue'

export type { SymbolItem }

const props = defineProps<{
  symbol?: string
  kLineLevel?: string
  symbols?: SymbolItem[]
  symbolLoading?: boolean
  symbolError?: boolean
  overlaySymbols?: string[]
}>()

const emit = defineEmits<{
  (e: 'addOverlaySymbol', item: SymbolItem): void
  (e: 'removeOverlaySymbol', code: string): void
  (e: 'kLineLevelChange', level: KLineLevel): void
  (e: 'toggleIndicator'): void
  (e: 'symbolChange', symbol: SymbolItem): void
}>()

const MOCK_SYMBOLS: SymbolItem[] = [
  { code: 'AAPL', description: 'Apple Inc.', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'TSLA', description: 'Tesla, Inc.', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'GOOGL', description: 'Alphabet Inc.', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'MSFT', description: 'Microsoft Corporation', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'AMZN', description: 'Amazon.com, Inc.', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'NVDA', description: 'NVIDIA Corporation', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'META', description: 'Meta Platforms, Inc.', exchange: 'NASDAQ', source: 'baostock' },
  { code: 'BRK.B', description: 'Berkshire Hathaway Inc.', exchange: 'NYSE', source: 'baostock' },
  { code: 'JPM', description: 'JPMorgan Chase & Co.', exchange: 'NYSE', source: 'baostock' },
  { code: 'V', description: 'Visa Inc.', exchange: 'NYSE', source: 'baostock' },
  { code: 'BTCUSDT', description: 'Bitcoin / Tether', exchange: 'BINANCE', source: 'baostock' },
  { code: 'ETHUSDT', description: 'Ethereum / Tether', exchange: 'BINANCE', source: 'baostock' },
  { code: 'sh.601360', description: '三六零', exchange: 'SSE', source: 'baostock' },
  { code: 'sh.600519', description: '贵州茅台', exchange: 'SSE', source: 'baostock' },
  { code: '000858', description: '五 粮 液', exchange: 'SZSE', source: 'baostock' },
  { code: '000001', description: '平安银行', exchange: 'SZSE', source: 'baostock' },
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
}
</style>
