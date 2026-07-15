import type { MarkerEntity, CustomMarkerEntity, MarkerManager } from '../marker/registry'

/** Marker交互状态 v2 — 精简为仅含回调注册与 hitTest 逻辑。状态层面已合并入 interactionState。 */
export class MarkerInteractionState {
  private onMarkerHoverCallback?: (marker: MarkerEntity | null) => void
  private onMarkerClickCallback?: (marker: MarkerEntity) => void
  private onCustomMarkerHoverCallback?: (marker: CustomMarkerEntity | null) => void
  private onCustomMarkerClickCallback?: (marker: CustomMarkerEntity) => void

  setOnMarkerHover(callback: (marker: MarkerEntity | null) => void) {
    this.onMarkerHoverCallback = callback
  }

  setOnMarkerClick(callback: (marker: MarkerEntity) => void) {
    this.onMarkerClickCallback = callback
  }

  setOnCustomMarkerHover(callback: (marker: CustomMarkerEntity | null) => void) {
    this.onCustomMarkerHoverCallback = callback
  }

  setOnCustomMarkerClick(callback: (marker: CustomMarkerEntity) => void) {
    this.onCustomMarkerClickCallback = callback
  }

  get onMarkerHover(): ((marker: MarkerEntity | null) => void) | undefined {
    return this.onMarkerHoverCallback
  }

  get onCustomMarkerHover(): ((marker: CustomMarkerEntity | null) => void) | undefined {
    return this.onCustomMarkerHoverCallback
  }

  handleClick(hitMarker: MarkerEntity): void {
    this.onMarkerClickCallback?.(hitMarker)
  }

  /** 从坐标更新 hover 状态。返回 true 表示命中 marker/custom-marker，调用方应跳过后续 hover 逻辑。 */
  updateHoverFromPoint(
    worldX: number,
    mouseX: number,
    mouseY: number,
    markerManager: MarkerManager,
  ): { hit: boolean; hitMarkerId: string | null; hitMarkerData: MarkerEntity | null; hitCustomMarker: CustomMarkerEntity | null } {
    const hitMarker = markerManager.hitTest(worldX, mouseY, 3)
    if (hitMarker) {
      this.onMarkerHoverCallback?.(hitMarker)
      return { hit: true, hitMarkerId: hitMarker.id, hitMarkerData: hitMarker, hitCustomMarker: null }
    }

    const hitCustomMarker = markerManager.hitTestCustomMarker(mouseX, mouseY)
    if (hitCustomMarker) {
      this.onCustomMarkerHoverCallback?.(hitCustomMarker)
      return { hit: true, hitMarkerId: null, hitMarkerData: null, hitCustomMarker }
    }

    this.onMarkerHoverCallback?.(null)
    this.onCustomMarkerHoverCallback?.(null)
    return { hit: false, hitMarkerId: null, hitMarkerData: null, hitCustomMarker: null }
  }

  /** 清空 hover 状态并触发回调（拖拽/离开时调用）。需要 markerManager 以便同步清除 Native hover。 */
  clearAll(markerManager: MarkerManager): void {
    markerManager.setHover(null)
    this.onMarkerHoverCallback?.(null)
    this.onCustomMarkerHoverCallback?.(null)
  }

  /** 全量重置（数据更新时调用，不触发热点回调） */
  reset(): void {
    // No state to reset — state lives in interactionState
  }
}
