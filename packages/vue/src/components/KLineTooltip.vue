<template>
  <div
    v-if="hoverData"
    :ref="onRef"
    class="kline-tooltip"
    :class="[{ 'use-anchor': useAnchor, 'is-draggable': draggable }, anchorPlacementClass]"
    :style="useAnchor ? undefined : { left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <div class="kline-tooltip__title">
      <span v-if="hoverData.symbol">{{ hoverData.symbol }}</span>
      <span>{{ formattedDate }}</span>
    </div>
    <div class="kline-tooltip__grid">
      <div class="row">
        <span v-once>开</span><span :style="{ color: openColor }">{{ hoverData.open.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span v-once>高</span><span>{{ hoverData.high.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span v-once>低</span><span>{{ hoverData.low.toFixed(2) }}</span>
      </div>
      <div class="row">
        <span v-once>收</span><span :style="{ color: closeColor }">{{ hoverData.close.toFixed(2) }}</span>
      </div>

      <div v-if="typeof hoverData.volume === 'number'" class="row">
        <span v-once>成交量</span><span>{{ formatVolume(hoverData.volume) }}</span>
      </div>
      <div v-if="typeof hoverData.turnover === 'number'" class="row">
        <span v-once>成交额</span><span>{{ formatVolume(hoverData.turnover) }}</span>
      </div>
      <div v-if="typeof hoverData.amplitude === 'number'" class="row">
        <span v-once>振幅</span><span>{{ hoverData.amplitude }}%</span>
      </div>
      <div v-if="typeof hoverData.changePercent === 'number'" class="row">
        <span v-once>涨跌幅</span>
        <span :style="{ color: changeColor }">{{
          formatSigned(hoverData.changePercent, '%')
        }}</span>
      </div>
      <div v-if="typeof hoverData.changeAmount === 'number'" class="row">
        <span v-once>涨跌额</span>
        <span :style="{ color: changeColor }">{{ formatSigned(hoverData.changeAmount, '') }}</span>
      </div>
      <div v-if="typeof hoverData.turnoverRate === 'number'" class="row">
        <span v-once>换手率</span><span>{{ hoverData.turnoverRate.toFixed(2) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { formatTimestamp } from '@363045841yyt/klinechart-core'
  import { computed } from 'vue'
  import type { ComponentPublicInstance } from 'vue'

  interface KLineData {
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
    symbol?: string
  }

  const props = withDefaults(
    defineProps<{
      hoverData: KLineData | null
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
      /** 时区，默认 Asia/Shanghai */
      timezone?: string
      /** 是否显示时分，默认 false */
      showTime?: boolean
      /** 是否可拖拽 */
      draggable?: boolean
    }>(),
    {
      upColor: '#ef4444',
      downColor: '#22c55e',
      timezone: 'Asia/Shanghai',
      showTime: false,
    },
  )

  const formattedDate = computed(() => {
    if (!props.hoverData) return ''
    return formatTimestamp(props.hoverData.timestamp, {
      timeZone: props.timezone,
      showTime: props.showTime,
    })
  })

  const useAnchor = computed(() => props.useAnchor === true)
  const anchorPlacementClass = computed(() =>
    props.anchorPlacement === 'left-bottom' ? 'anchor-left-bottom' : 'anchor-right-bottom',
  )

  function onRef(el: Element | ComponentPublicInstance | null) {
    props.setEl?.(el as HTMLDivElement | null)
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

  function calcDirection(
    data: KLineData,
    allData: ReadonlyArray<KLineData>,
    idx: number | null,
  ): number {
    if (data.close >= data.open) return 1
    const prev = typeof idx === 'number' && idx > 0 ? allData[idx - 1] : undefined
    if (prev && data.close > prev.close) return 1
    if (prev && data.close < prev.close) return -1
    return 0
  }

  const openColor = computed(() => {
    if (!props.hoverData) return NEUTRAL_COLOR
    const dir = calcDirection(props.hoverData, props.data, props.index)
    return dir > 0 ? props.upColor : dir < 0 ? props.downColor : NEUTRAL_COLOR
  })

  const closeColor = computed(() => {
    if (!props.hoverData) return NEUTRAL_COLOR
    const diff = props.hoverData.close - props.hoverData.open
    return diff > 0 ? props.upColor : diff < 0 ? props.downColor : NEUTRAL_COLOR
  })

  const changeColor = computed(() => {
    if (!props.hoverData) return NEUTRAL_COLOR
    const pct =
      props.hoverData.changePercent ??
      ((props.hoverData.close - props.hoverData.open) / props.hoverData.open) * 100
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
    user-select: none;
  }

  .kline-tooltip.is-draggable {
    pointer-events: auto;
    cursor: grab;
  }

  .kline-tooltip.is-draggable:active {
    cursor: grabbing;
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
