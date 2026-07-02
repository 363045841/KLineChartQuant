import type { DrawingAnchorInput } from './coordinateUtils'
import type { DrawingToolId } from './toolConfig'
import { getAnchorCountForTool } from './toolConfig'

/**
 * Accumulates pointer anchors until the required count is reached for a given tool.
 * Single-anchor tools are not managed here — they create immediately on first click.
 */
export class AnchorCollector {
  pendingAnchors: DrawingAnchorInput[] = []

  /** Returns true when the tool uses multiple anchors (2 or 3). */
  isMultiAnchorTool(toolId: DrawingToolId): boolean {
    const count = getAnchorCountForTool(toolId)
    return count === 2 || count === 3
  }

  /** Returns the required anchor count for the given tool, or null for single-anchor / cursor. */
  getRequiredCount(toolId: DrawingToolId): number | null {
    return getAnchorCountForTool(toolId)
  }

  /** 当前已累积的锚点数量 */
  getPendingCount(): number {
    return this.pendingAnchors.length
  }

  /**
   * Add an anchor for the given tool.
   * @returns the full anchor list if the required count is reached (caller should create drawing),
   *          or null if still accumulating.
   */
  addAnchor(anchor: DrawingAnchorInput, toolId: DrawingToolId): DrawingAnchorInput[] | null {
    const required = this.getRequiredCount(toolId)
    if (required === null) return null

    this.pendingAnchors.push(anchor)

    if (this.pendingAnchors.length >= required) {
      const result = [...this.pendingAnchors]
      this.pendingAnchors = []
      return result
    }

    return null
  }

  /** Peek at the first pending anchor without modifying state. */
  getFirst(): DrawingAnchorInput | undefined {
    return this.pendingAnchors[0]
  }

  /** 清空累积的锚点 */
  reset(): void {
    this.pendingAnchors = []
  }
}
