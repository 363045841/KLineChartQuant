import type { ChartDom } from '../chartTypes'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

export interface HintDeps {
  getOption: () => { kWidth: number; kGap: number }
  getEffectiveDpr: () => number
  getDom: () => ChartDom
  getViewport: () => { viewHeight: number } | null
}

interface ActiveHint {
  el: HTMLDivElement
  timer: number
  removeTimer: number
  onTransitionEnd: (() => void) | null
}

export class IncrementalLoadHint {
  private _activeHint: ActiveHint | null = null

  constructor(private deps: HintDeps) {}

  show(count: number, leftBufferWidth: number): void {
    if (count <= 0) return

    const host = this.deps.getDom().scrollContent ?? this.deps.getDom().container ?? null
    if (!host) return
    const ownerDoc = host.ownerDocument
    if (!ownerDoc) return

    const entry = this._activeHint ?? this._createHint(ownerDoc)
    const hint = entry.el

    this._cancelFadeOut(entry)
    this._updateGeometry(hint, count, leftBufferWidth)

    if (!hint.isConnected) {
      host.appendChild(hint)
      hint.getBoundingClientRect()
    }

    hint.style.opacity = '1'
    hint.style.filter = 'blur(0px)'

    this._activeHint = entry

    entry.timer = window.setTimeout(() => {
      this._fadeOutAndRemove(entry)
    }, 900)
  }

  hide(): void {
    const entry = this._activeHint
    if (!entry) return
    this._cancelFadeOut(entry)
    this._removeElement(entry)
    this._activeHint = null
  }

  destroy(): void {
    const entry = this._activeHint
    if (!entry) return
    this._cancelFadeOut(entry)
    entry.el.remove()
    this._activeHint = null
  }

  private _createHint(ownerDoc: Document): ActiveHint {
    const hint = ownerDoc.createElement('div')
    hint.className = 'klc-incremental-load-hint'
    hint.style.position = 'absolute'
    hint.style.top = '0'
    hint.style.pointerEvents = 'none'
    hint.style.opacity = '0'
    hint.style.filter = 'blur(10px)'
    hint.style.transition = 'opacity 420ms ease, filter 420ms ease'
    hint.style.background = 'rgba(71, 91, 132, 0.5)'
    hint.style.zIndex = '3'
    hint.style.willChange = 'opacity, filter, width'
    return { el: hint, timer: 0, removeTimer: 0, onTransitionEnd: null }
  }

  private _updateGeometry(hint: HTMLDivElement, count: number, leftBufferWidth: number): void {
    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

    hint.style.left = `${leftBufferWidth}px`
    const width = (startXPx + count * unitPx) / dpr
    hint.style.width = `${Math.max(0, width)}px`
    hint.style.height = `${Math.max(
      0,
      this.deps.getViewport()?.viewHeight ?? this.deps.getDom().container?.clientHeight ?? 0,
    )}px`
  }

  private _fadeOutAndRemove(entry: ActiveHint): void {
    if (this._activeHint !== entry) return

    const { el } = entry
    el.style.opacity = '0'
    el.style.filter = 'blur(10px)'

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd)
      entry.onTransitionEnd = null
      this._removeElement(entry)
      if (this._activeHint === entry) {
        this._activeHint = null
      }
    }
    entry.onTransitionEnd = onEnd
    el.addEventListener('transitionend', onEnd)

    entry.removeTimer = window.setTimeout(() => {
      this._removeElement(entry)
      if (this._activeHint === entry) {
        this._activeHint = null
      }
    }, 500)
  }

  private _cancelFadeOut(entry: ActiveHint): void {
    clearTimeout(entry.timer)
    clearTimeout(entry.removeTimer)
    if (entry.onTransitionEnd) {
      entry.el.removeEventListener('transitionend', entry.onTransitionEnd)
      entry.onTransitionEnd = null
    }
  }

  private _removeElement(entry: ActiveHint): void {
    this._cancelFadeOut(entry)
    if (entry.el.isConnected) {
      entry.el.remove()
    }
  }
}
