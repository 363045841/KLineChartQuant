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
}

export class IncrementalLoadHint {
  private _activeHints = new Set<ActiveHint>()

  constructor(private deps: HintDeps) {}

  show(count: number, leftBufferWidth: number): void {
    if (count <= 0) return

    const host = this.deps.getDom().scrollContent ?? this.deps.getDom().container ?? null
    if (!host) return
    const ownerDoc = host.ownerDocument
    if (!ownerDoc) return

    const dpr = this.deps.getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

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

    hint.style.left = `${leftBufferWidth}px`
    const width = (startXPx + count * unitPx) / dpr
    hint.style.width = `${Math.max(0, width)}px`
    hint.style.height = `${Math.max(
      0,
      this.deps.getViewport()?.viewHeight ??
        this.deps.getDom().container?.clientHeight ??
        0,
    )}px`

    host.appendChild(hint)
    hint.getBoundingClientRect()

    hint.style.opacity = '1'
    hint.style.filter = 'blur(0px)'

    const entry: ActiveHint = { el: hint, timer: 0 }
    this._activeHints.add(entry)

    entry.timer = window.setTimeout(() => {
      this._fadeOutAndRemove(entry)
    }, 900)
  }

  hide(): void {
    for (const entry of this._activeHints) {
      clearTimeout(entry.timer)
      this._removeElement(entry)
    }
    this._activeHints.clear()
  }

  destroy(): void {
    for (const entry of this._activeHints) {
      clearTimeout(entry.timer)
      entry.el.remove()
    }
    this._activeHints.clear()
  }

  private _fadeOutAndRemove(entry: ActiveHint): void {
    const { el } = entry
    el.style.opacity = '0'
    el.style.filter = 'blur(10px)'

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd)
      this._removeElement(entry)
      this._activeHints.delete(entry)
    }
    el.addEventListener('transitionend', onEnd)

    window.setTimeout(() => {
      this._removeElement(entry)
      this._activeHints.delete(entry)
    }, 500)
  }

  private _removeElement(entry: ActiveHint): void {
    if (entry.el.isConnected) {
      entry.el.remove()
    }
  }
}
