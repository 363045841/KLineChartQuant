import type { ChartDom } from '../chartTypes'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

export interface HintDeps {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getDom: () => ChartDom
  getViewport: () => { viewHeight: number } | null
}

export class IncrementalLoadHint {
  private _el: HTMLDivElement | null = null
  private _timer: number | null = null

  constructor(private deps: HintDeps) {}

  show(count: number, leftBufferWidth: number): void {
    if (count <= 0) return
    const hint = this._ensure()
    if (!hint) return
    this._clearTimer()

    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

    hint.style.left = `${leftBufferWidth}px`
    const width = (startXPx + count * unitPx) / dpr
    hint.style.width = `${Math.max(0, width)}px`
    hint.style.height = `${Math.max(
      0,
      this.deps.getViewport()?.viewHeight ??
        this.deps.getDom().container?.clientHeight ??
        0,
    )}px`
    hint.getBoundingClientRect()

    console.group('[LoadHint] show')
    console.log('count:', count, 'leftBufferWidth:', leftBufferWidth)
    console.log('dpr:', dpr, 'kWidth:', opt.kWidth, 'kGap:', opt.kGap)
    console.log('unitPx:', unitPx, 'startXPx:', startXPx)
    console.log('target left:', hint.style.left, 'target width:', hint.style.width)
    const rect = hint.getBoundingClientRect()
    console.log('hint rect:', rect)
    const host = this.deps.getDom().scrollContent
    if (host) console.log('host scrollLeft:', host.scrollLeft, 'scrollWidth:', host.scrollWidth)
    console.groupEnd()
    hint.style.opacity = '1'
    hint.style.filter = 'blur(0px)'

    this._timer = window.setTimeout(() => {
      this._hide()
      this._timer = null
    }, 900)
  }

  hide(): void {
    this._hide()
  }

  destroy(): void {
    this._clearTimer()
    this._el?.remove()
    this._el = null
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      window.clearTimeout(this._timer)
      this._timer = null
    }
  }

  private _hide(): void {
    if (!this._el) return
    this._el.style.opacity = '0'
    this._el.style.filter = 'blur(10px)'
  }

  private _ensure(): HTMLDivElement | null {
    const host = this.deps.getDom().scrollContent ?? this.deps.getDom().container ?? null
    if (!host) return null
    if (this._el && this._el.isConnected) return this._el

    const ownerDoc = host.ownerDocument
    if (!ownerDoc) return null

    const hint = ownerDoc.createElement('div')
    hint.className = 'klc-incremental-load-hint'
    hint.style.position = 'absolute'
    hint.style.top = '0'
    hint.style.height = '0px'
    hint.style.width = '0px'
    hint.style.pointerEvents = 'none'
    hint.style.opacity = '0'
    hint.style.filter = 'blur(10px)'
    hint.style.transition = 'opacity 420ms ease, filter 420ms ease'
    hint.style.background = 'rgba(71, 91, 132, 0.5)'
    hint.style.zIndex = '3'
    hint.style.willChange = 'opacity, filter, width'
    host.appendChild(hint)
    this._el = hint
    return hint
  }
}