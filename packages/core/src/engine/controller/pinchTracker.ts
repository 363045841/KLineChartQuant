/** 触屏双指捏合跟踪，与 InteractionController 正交。 */
export class PinchTracker {
  private activePointers = new Map<number, { x: number; y: number }>()
  private lastPinchDistance = 0
  private pinchCenter = { x: 0, y: 0 }
  private isPinching = false
  private onPinchZoomCallback?: (delta: number, centerX: number) => void

  setOnPinchZoom(callback: (delta: number, centerX: number) => void) {
    this.onPinchZoomCallback = callback
  }

  getIsPinching(): boolean {
    return this.isPinching
  }

  getPointerCount(): number {
    return this.activePointers.size
  }

  /** Returns true if pinch started (caller should early-return, not process drag). */
  handlePointerDown(e: PointerEvent, isTouchSession: boolean): boolean {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.activePointers.size === 2 && isTouchSession) {
      this.isPinching = true
      const pointers = [...this.activePointers.values()]
      const p1 = pointers[0]!
      const p2 = pointers[1]!
      this.lastPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      this.pinchCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      return true
    }
    return false
  }

  handlePointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId)
    if (this.isPinching && this.activePointers.size < 2) {
      this.isPinching = false
      this.lastPinchDistance = 0
    }
  }

  handlePointerLeave(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId)
    if (this.activePointers.size < 2) {
      this.isPinching = false
      this.lastPinchDistance = 0
    }
  }

  /** Returns true if pinch zoom was processed (caller should skip further pointer-move handling). */
  handlePointerMove(e: PointerEvent): boolean {
    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    if (this.isPinching && this.activePointers.size === 2) {
      const pointers = [...this.activePointers.values()]
      const p1 = pointers[0]!
      const p2 = pointers[1]!
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const deltaDistance = distance - this.lastPinchDistance

      if (Math.abs(deltaDistance) > 10) {
        const pinchDelta = deltaDistance > 0 ? 1 : -1
        const centerX = (p1.x + p2.x) / 2
        this.onPinchZoomCallback?.(pinchDelta, centerX)
        this.lastPinchDistance = distance
      }
      return true
    }
    return false
  }

  reset(): void {
    this.activePointers.clear()
    this.isPinching = false
    this.lastPinchDistance = 0
  }
}
