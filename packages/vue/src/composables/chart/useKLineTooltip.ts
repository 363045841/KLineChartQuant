/**
 * useKLineTooltip：默认 K 线 tooltip 的 DOM 直写渲染、显隐、定位、尺寸观测与订阅清理，
 * 以及内置 tooltip 与外部 #kline-tooltip 插槽共用的拖拽状态。
 * 默认内容绕过 Vue VNode 直接操作 DOM，避免高频 hover 触发组件 patch。
 */
import { formatTimeInTimeZone } from '@363045841yyt/klinechart-core'
import type { ChartController, KLineData } from '@363045841yyt/klinechart-core/controllers'
import { type ComputedRef, computed, onBeforeUnmount, type Ref, ref, watch } from 'vue'

/** 默认 tooltip 中性的文字颜色。 */
const NEUTRAL_COLOR = '#6b7280'

/** 默认 tooltip 内容各字段对应的 DOM 节点。 */
interface TooltipDomRefs {
  container: HTMLDivElement
  symbol: HTMLSpanElement | null
  date: HTMLSpanElement
  open: HTMLSpanElement
  high: HTMLSpanElement
  low: HTMLSpanElement
  close: HTMLSpanElement
  volume: HTMLSpanElement | null
  turnover: HTMLSpanElement | null
  amplitude: HTMLSpanElement | null
  changePercent: HTMLSpanElement | null
  changeAmount: HTMLSpanElement | null
  turnoverRate: HTMLSpanElement | null
}

/** useKLineTooltip 配置：引用类型保持响应式，标量以 getter 传入以读取最新值。 */
export interface UseKLineTooltipOptions {
  /** ChartController 引用；就绪后自动建立订阅 */
  controller: Ref<ChartController | null>
  /** 默认 tooltip 内容容器 */
  contentRef: Ref<HTMLDivElement | null>
  /** chart container；用于换算 tooltip layer 的相对偏移 */
  containerRef: Ref<HTMLDivElement | null>
  /** 涨跌配色 */
  colors: ComputedRef<{ upColor: string; downColor: string }>
  /** 调用方是否提供 #kline-tooltip 外部插槽 */
  hasExternalSlot: Ref<boolean>
  /** 是否触屏设备 */
  isMobile: boolean
  /** 是否分时；决定 tooltip 是否显示时间 */
  isIntraday: () => boolean
  /** 时区 */
  timezone: () => string
  /** adaptive 模式下允许拖拽 */
  isDraggable: () => boolean
}

/** 格式化成交量，按亿 / 万分级。 */
function formatVolume(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

/** 格式化为带正负号的两位小数，正数补 +。 */
function formatSigned(val: number, unit: string): string {
  return (val >= 0 ? '+' : '') + val.toFixed(2) + unit
}

/** 按当前收盘与开盘 / 前收比较得出涨跌方向：1 涨、-1 跌、0 平。 */
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

/** 创建默认 tooltip 的标题与字段骨架，只按数据的可选字段建行。 */
function buildTooltipDom(el: HTMLDivElement, kline: KLineData): TooltipDomRefs {
  const title = document.createElement('div')
  title.className = 'kline-tooltip__title'
  let symbolSpan: HTMLSpanElement | null = null
  if (kline.symbol) {
    symbolSpan = document.createElement('span')
    title.appendChild(symbolSpan)
  }
  const dateSpan = document.createElement('span')
  title.appendChild(dateSpan)
  el.appendChild(title)

  const grid = document.createElement('div')
  grid.className = 'kline-tooltip__grid'

  function addRow(label: string): HTMLSpanElement {
    const row = document.createElement('div')
    row.className = 'row'
    const lbl = document.createElement('span')
    lbl.textContent = label
    row.appendChild(lbl)
    const val = document.createElement('span')
    row.appendChild(val)
    grid.appendChild(row)
    return val
  }

  const openV = addRow('开')
  const highV = addRow('高')
  const lowV = addRow('低')
  const closeV = addRow('收')
  const volumeV = typeof kline.volume === 'number' ? addRow('成交量') : null
  const turnoverV = typeof kline.turnover === 'number' ? addRow('成交额') : null
  const amplitudeV = typeof kline.amplitude === 'number' ? addRow('振幅') : null
  const changePercentV = typeof kline.changePercent === 'number' ? addRow('涨跌幅') : null
  const changeAmountV = typeof kline.changeAmount === 'number' ? addRow('涨跌额') : null
  const turnoverRateV = typeof kline.turnoverRate === 'number' ? addRow('换手率') : null

  el.appendChild(grid)

  return {
    container: el,
    symbol: symbolSpan,
    date: dateSpan,
    open: openV,
    high: highV,
    low: lowV,
    close: closeV,
    volume: volumeV,
    turnover: turnoverV,
    amplitude: amplitudeV,
    changePercent: changePercentV,
    changeAmount: changeAmountV,
    turnoverRate: turnoverRateV,
  }
}

/** 用最新 K 线数据更新骨架文本与涨跌颜色。 */
function updateTooltipDom(
  refs: TooltipDomRefs,
  kline: KLineData,
  idx: number,
  allData: ReadonlyArray<KLineData>,
  upColor: string,
  downColor: string,
  timezone: string,
  showTime: boolean,
): void {
  const openDir = calcDirection(kline, allData, idx)
  const closeDiff = kline.close - kline.open
  const changePct = kline.changePercent ?? ((kline.close - kline.open) / kline.open) * 100
  const openC = openDir > 0 ? upColor : openDir < 0 ? downColor : NEUTRAL_COLOR
  const closeC = closeDiff > 0 ? upColor : closeDiff < 0 ? downColor : NEUTRAL_COLOR
  const changeC = changePct > 0 ? upColor : changePct < 0 ? downColor : NEUTRAL_COLOR

  refs.date.textContent = formatTimeInTimeZone(kline.timestamp, { timeZone: timezone, showTime })
  if (refs.symbol) refs.symbol.textContent = kline.symbol ?? ''

  refs.open.textContent = kline.open.toFixed(2)
  refs.open.style.color = openC
  refs.high.textContent = kline.high.toFixed(2)
  refs.low.textContent = kline.low.toFixed(2)
  refs.close.textContent = kline.close.toFixed(2)
  refs.close.style.color = closeC
  if (refs.volume && typeof kline.volume === 'number')
    refs.volume.textContent = formatVolume(kline.volume)
  if (refs.turnover && typeof kline.turnover === 'number')
    refs.turnover.textContent = formatVolume(kline.turnover)
  if (refs.amplitude && typeof kline.amplitude === 'number')
    refs.amplitude.textContent = kline.amplitude + '%'
  if (refs.changePercent && typeof kline.changePercent === 'number') {
    refs.changePercent.textContent = formatSigned(kline.changePercent, '%')
    refs.changePercent.style.color = changeC
  }
  if (refs.changeAmount && typeof kline.changeAmount === 'number') {
    refs.changeAmount.textContent = formatSigned(kline.changeAmount, '')
    refs.changeAmount.style.color = changeC
  }
  if (refs.turnoverRate && typeof kline.turnoverRate === 'number')
    refs.turnoverRate.textContent = kline.turnoverRate.toFixed(2) + '%'
}

/**
 * 默认 K 线 tooltip：订阅 interactionState / data 维护内容与显隐，直接写 DOM 定位；
 * 组件卸载时统一退订并断开尺寸观测。
 */
export function useKLineTooltip(options: UseKLineTooltipOptions) {
  const { controller, contentRef, containerRef, colors, hasExternalSlot } = options
  const { isMobile, isIntraday, timezone, isDraggable } = options

  /** 拖拽后的 tooltip 位置；null 表示跟随交互快照。 */
  const dragPos = ref<{ x: number; y: number } | null>(null)

  let resizeObserver: ResizeObserver | null = null
  let previousIndex: number | null = null
  let domRefs: TooltipDomRefs | null = null
  let visibilityEl: HTMLDivElement | null = null
  let hiddenState = false
  let dragOffset = { x: 0, y: 0 }

  /** 返回 tooltip layer 相对 chart container 的固定偏移。 */
  function getLayerOffset(): { x: number; y: number } {
    const container = containerRef.value
    return container ? { x: container.offsetLeft, y: container.offsetTop } : { x: 0, y: 0 }
  }

  /** 当前交互快照给出的 tooltip 基准位置。 */
  function currentTooltipPos(): { x: number; y: number } {
    return controller.value?.interactionState.peek().tooltipPos ?? { x: 0, y: 0 }
  }

  /** 以直接 DOM 写入更新默认 K 线 tooltip 的位置。 */
  function positionDefault(): void {
    if (hasExternalSlot.value) return
    const el = contentRef.value
    if (!el) return
    const position = dragPos.value ?? currentTooltipPos()
    const offset = getLayerOffset()
    el.style.left = `${position.x + offset.x}px`
    el.style.top = `${position.y + offset.y}px`
  }

  // ── Tooltip Drag（内置与外部插槽共用） ──

  /** 拖拽中按指针位移更新位置并直接写 DOM。 */
  function onDragPointerMove(e: PointerEvent): void {
    dragPos.value = {
      x: e.clientX - dragOffset.x - getLayerOffset().x,
      y: e.clientY - dragOffset.y - getLayerOffset().y,
    }
    positionDefault()
  }

  /** 结束拖拽，移除文档级指针监听。 */
  function onDragPointerUp(): void {
    document.removeEventListener('pointermove', onDragPointerMove)
    document.removeEventListener('pointerup', onDragPointerUp)
  }

  /** 按下 tooltip：记录指针与当前位置的偏移并接管拖拽。 */
  function onPointerDown(e: PointerEvent): void {
    if (!isDraggable()) return
    e.preventDefault()
    e.stopPropagation()
    const base = dragPos.value ?? currentTooltipPos()
    dragOffset = { x: e.clientX - base.x, y: e.clientY - base.y }
    document.addEventListener('pointermove', onDragPointerMove)
    document.addEventListener('pointerup', onDragPointerUp)
  }

  /** 双击复位拖拽位置。 */
  function onDoubleClick(): void {
    dragPos.value = null
    positionDefault()
  }

  // tooltipPosition 切出 adaptive 时复位拖拽位置
  watch(isDraggable, (draggable) => {
    if (!draggable) dragPos.value = null
  })

  // 默认 tooltip 直接订阅 kernel 信号，绕过 Vue 的 VNode。
  watch(
    controller,
    (ctrl, _previous, onCleanup) => {
      if (!ctrl) return

      const update = (): void => {
        if (hasExternalSlot.value) return
        const el = contentRef.value
        if (!el) return
        // 订阅整包 snapshot；内容更新仅依赖 hoveredIndex，索引未变时只动 display
        const snapshot = ctrl.interactionState.peek()
        const idx = snapshot.hoveredIndex
        const data = ctrl.getData()
        const kline =
          typeof idx === 'number' && idx >= 0 && idx < data.length ? data[idx] : undefined
        const hidden = !kline || ctrl.chartMode.peek() === 'comparison' || isMobile
        if (visibilityEl !== el) {
          visibilityEl = el
          hiddenState = true
        }
        if (hiddenState !== hidden) {
          el.style.display = hidden ? 'none' : ''
          hiddenState = hidden
        }
        if (hidden) {
          // 隐藏后复位缓存的索引，重新悬停同一根柱时重建内容
          previousIndex = null
          return
        }
        positionDefault()
        if (idx !== previousIndex) {
          previousIndex = idx
          if (!domRefs || domRefs.container !== el) {
            domRefs = null
            el.textContent = ''
            domRefs = buildTooltipDom(el, kline)
          }
          const { upColor, downColor } = colors.value
          updateTooltipDom(domRefs, kline, idx!, data, upColor, downColor, timezone(), isIntraday())
          if (!resizeObserver) {
            resizeObserver = new ResizeObserver((entries) => {
              for (const entry of entries) {
                const target = entry.target as HTMLDivElement
                if (!target.isConnected) continue
                const w = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width
                const h = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
                ctrl.setTooltipSize({
                  width: Math.max(180, Math.round(w)),
                  height: Math.max(80, Math.round(h)),
                })
              }
            })
          }
          resizeObserver.observe(el)
        }
      }

      const unsubInteraction = ctrl.interactionState.subscribe(update)
      const unsubData = ctrl.data.subscribe(update)
      update()

      onCleanup(() => {
        unsubInteraction()
        unsubData()
        resizeObserver?.disconnect()
        resizeObserver = null
        domRefs = null
        previousIndex = null
        visibilityEl = null
      })
    },
    { immediate: true },
  )

  // 组件卸载时若仍在拖拽，移除文档级监听
  onBeforeUnmount(onDragPointerUp)

  return {
    /** 拖拽位置；外部 tooltip 样式消费 */
    dragPos,
    /** tooltip layer 相对偏移；外部 tooltip 与 marker tooltip 复用 */
    getLayerOffset,
    /** 绑定到 tooltip 容器的 pointerdown */
    onPointerDown,
    /** 绑定到 tooltip 容器的 dblclick */
    onDoubleClick,
  }
}
