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
  import './tooltip.css'
  import { formatTimeInTimeZone } from '@363045841yyt/klinechart-core'
  import type { ComponentPublicInstance } from 'vue'
  import { computed } from 'vue'

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
      upColor: 'var(--klc-color-candle-up-body)',
      downColor: 'var(--klc-color-candle-down-body)',
      timezone: 'Asia/Shanghai',
      showTime: false,
    },
  )

  const formattedDate = computed(() => {
    if (!props.hoverData) return ''
    return formatTimeInTimeZone(props.hoverData.timestamp, {
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

  const NEUTRAL_COLOR = 'var(--klc-color-ui-muted)'

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
