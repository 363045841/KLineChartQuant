<template>
  <div
    v-if="k"
    :ref="onRef"
    class="kline-tooltip"
    :class="[{ 'use-anchor': useAnchor }, anchorPlacementClass]"
    :style="useAnchor ? undefined : { left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <div class="kline-tooltip__title">
      <span v-if="k.stockCode">{{ k.stockCode }}</span>
      <span>{{ formatDate(k.timestamp) }}</span>
    </div>
    <div class="kline-tooltip__grid">
      <div class="row">
        <span>开</span><span :style="{ color: openColor }">{{ k.open.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>高</span><span>{{ k.high.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>低</span><span>{{ k.low.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span>收</span><span :style="{ color: closeColor }">{{ k.close.toFixed(2) }}</span>
      </div>

      <div v-if="typeof k.volume === 'number'" class="row">
        <span>成交量</span><span>{{ formatVolume(k.volume) }}</span>
      </div>
      <div v-if="typeof k.turnover === 'number'" class="row">
        <span>成交额</span><span>{{ formatVolume(k.turnover) }}</span>
      </div>
      <div v-if="typeof k.amplitude === 'number'" class="row">
        <span>振幅</span><span>{{ k.amplitude }}%</span>
      </div>
      <div v-if="typeof k.changePercent === 'number'" class="row">
        <span>涨跌幅</span>
        <span :style="{ color: changeColor }">{{ formatSigned(k.changePercent, '%') }}</span>
      </div>
      <div v-if="typeof k.changeAmount === 'number'" class="row">
        <span>涨跌额</span>
        <span :style="{ color: changeColor }">{{ formatSigned(k.changeAmount, '') }}</span>
      </div>
      <div v-if="typeof k.turnoverRate === 'number'" class="row">
          <span>换手率</span><span>{{ k.turnoverRate.toFixed(2) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentPublicInstance } from 'vue'

export interface KLineData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
  amplitude?: number
  changePercent?: number
  changeAmount?: number
  turnoverRate?: number
  stockCode?: string
}

const props = withDefaults(defineProps<{
  k: KLineData | null
  index: number | null
  data: ReadonlyArray<KLineData>
  pos: { x: number; y: number }
  useAnchor?: boolean
  anchorPlacement?: 'right-bottom' | 'left-bottom'
  setEl?: (el: HTMLDivElement | null) => void
  /** 涨的颜色（默认红涨） */
  upColor?: string
  /** 跌的颜色（默认绿跌） */
  downColor?: string
}>(), {
  upColor: '#ef4444',
  downColor: '#22c55e',
})

const useAnchor = computed(() => props.useAnchor === true)
const anchorPlacementClass = computed(() =>
  props.anchorPlacement === 'left-bottom' ? 'anchor-left-bottom' : 'anchor-right-bottom',
)

function onRef(el: Element | ComponentPublicInstance | null) {
  props.setEl?.(el as HTMLDivElement | null)
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatVolume(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

function formatSigned(val: number, unit: string): string {
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}${unit}`
}

const NEUTRAL_COLOR = '#6b7280'

function calcDirection(k: KLineData, data: ReadonlyArray<KLineData>, idx: number | null): number {
  if (k.close >= k.open) return 1
  const prev = typeof idx === 'number' && idx > 0 ? data[idx - 1] : undefined
  if (prev && k.close > prev.close) return 1
  if (prev && k.close < prev.close) return -1
  return 0
}

const openColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  const dir = calcDirection(k, props.data, props.index)
  return dir > 0 ? props.upColor : dir < 0 ? props.downColor : NEUTRAL_COLOR
})

const closeColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  const diff = k.close - k.open
  return diff > 0 ? props.upColor : diff < 0 ? props.downColor : NEUTRAL_COLOR
})

const changeColor = computed(() => {
  const k = props.k
  if (!k) return NEUTRAL_COLOR
  const pct = k.changePercent ?? (k.close - k.open) / k.open * 100
  return pct > 0 ? props.upColor : pct < 0 ? props.downColor : NEUTRAL_COLOR
})
</script>

<style scoped>
.kline-tooltip {
  position: absolute;
  z-index: 10;
  min-width: 200px;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--klc-color-tooltip-bg);
  border: 1px solid var(--klc-color-tooltip-border);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: var(--klc-color-tooltip-text);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

.kline-tooltip__title {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
  margin-bottom: 6px;
}

.kline-tooltip__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
}

.kline-tooltip__grid .row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.kline-tooltip__grid .row span:first-child {
  color: var(--klc-color-tooltip-text);
  opacity: 0.56;
}

@supports (anchor-name: --kmap-anchor) and (position-anchor: --kmap-anchor) {
  .kline-tooltip.use-anchor {
    position: absolute;
    position-anchor: --kline-tooltip-anchor;
    left: anchor(left);
    top: anchor(top);
  }

  .kline-tooltip.use-anchor.anchor-right-bottom {
    transform: translate(14px, 14px);
  }

  .kline-tooltip.use-anchor.anchor-left-bottom {
    transform: translate(calc(-100% - 14px), 14px);
  }
}
</style>
