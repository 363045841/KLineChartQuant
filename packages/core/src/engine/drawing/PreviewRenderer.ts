import type { DrawingObject } from '../../foundation/plugin/index'

import { PREVIEW_ID } from './DrawingState'
import type { DrawingAnchorInput } from './coordinateUtils'
import type { DrawingToolId } from './toolConfig'
import {
  SINGLE_ANCHOR_TOOLS,
  DOUBLE_ANCHOR_TOOLS,
  TRIPLE_ANCHOR_TOOLS,
  getDrawingKind,
  CHANNEL_KINDS,
} from './toolConfig'

/**
 * Constructs preview DrawingObject instances for various tool types.
 * Pure construction — no side effects, no adapter calls.
 */
export class PreviewRenderer {
  /**
   * Build a preview drawing from the current tool state and pointer anchor.
   * @returns a preview DrawingObject, or null if the state is insufficient for a preview.
   */
  buildPreview(
    activeTool: DrawingToolId,
    pendingAnchors: DrawingAnchorInput[],
    currentAnchor: DrawingAnchorInput,
  ): DrawingObject | null {
    const isSingle = SINGLE_ANCHOR_TOOLS.includes(activeTool as any)
    const isDouble = DOUBLE_ANCHOR_TOOLS.includes(activeTool as any)
    const isTriple = TRIPLE_ANCHOR_TOOLS.includes(activeTool as any)

    if (!isSingle && !isDouble && !isTriple) return null

    if (isSingle) {
      return this.buildSingleAnchorPreview(activeTool, currentAnchor)
    }

    if (isDouble) {
      if (pendingAnchors.length < 1) return null
      return this.buildDoubleAnchorPreview(activeTool, pendingAnchors[0]!, currentAnchor)
    }

    // Triple anchor tools
    return this.buildTripleAnchorPreview(activeTool, pendingAnchors, currentAnchor)
  }

  /** 单锚点工具预览：虚线样式 */
  private buildSingleAnchorPreview(
    activeTool: DrawingToolId,
    anchor: DrawingAnchorInput,
  ): DrawingObject {
    return {
      id: PREVIEW_ID,
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      visible: true,
      anchors: [
        { id: `${PREVIEW_ID}-a`, time: anchor.time, price: anchor.price },
      ],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'dashed',
      },
    }
  }

  /** 双锚点工具预览：两个锚点之间的虚线，回归通道附带填充区域 */
  private buildDoubleAnchorPreview(
    activeTool: DrawingToolId,
    first: DrawingAnchorInput,
    second: DrawingAnchorInput,
  ): DrawingObject {
    return {
      id: PREVIEW_ID,
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      visible: true,
      anchors: [
        { id: `${PREVIEW_ID}-a`, time: first.time, price: first.price },
        { id: `${PREVIEW_ID}-b`, time: second.time, price: second.price },
      ],
      params: activeTool === 'regression-channel' ? { sigma: 2 } : {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'dashed',
        ...(activeTool === 'regression-channel' ? { fillOpacity: 0.1 } : {}),
      },
    }
  }

  /**
   * 三锚点工具预览：
   * - pending 数 = 0 → 无法预览，返回 null
   * - pending 数 = 1 → 暂以趋势线（双锚点）形式显示前两个点
   * - pending 数 ≥ 2 → 完整三锚点预览（含 flat-line 的特殊 price 处理）
   */
  private buildTripleAnchorPreview(
    activeTool: DrawingToolId,
    pendingAnchors: DrawingAnchorInput[],
    currentAnchor: DrawingAnchorInput,
  ): DrawingObject | null {
    if (pendingAnchors.length === 0) return null

    if (pendingAnchors.length === 1) {
      // Need 3 anchors but only have 1 pending — render as a trend-line segment (2 anchors)
      // so the user can see what they're drawing before placing the 3rd point
      return {
        id: PREVIEW_ID,
        kind: 'trend-line',
        paneId: 'main',
        visible: true,
        anchors: [
          {
            id: `${PREVIEW_ID}-a`,
            time: pendingAnchors[0]!.time,
            price: pendingAnchors[0]!.price,
          },
          {
            id: `${PREVIEW_ID}-b`,
            time: currentAnchor.time,
            price: currentAnchor.price,
          },
        ],
        params: {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          strokeStyle: 'dashed',
        },
      }
    }

    // pendingAnchors.length >= 2 — full 3-anchor preview
    const thirdAnchor =
      activeTool === 'flat-line'
        ? {
            id: `${PREVIEW_ID}-c`,
            time: pendingAnchors[1]!.time,
            price: currentAnchor.price,
          }
        : {
            id: `${PREVIEW_ID}-c`,
            time: currentAnchor.time,
            price: currentAnchor.price,
          }

    const isChannel = CHANNEL_KINDS.includes(getDrawingKind(activeTool) as any)

    return {
      id: PREVIEW_ID,
      kind: getDrawingKind(activeTool),
      paneId: 'main',
      visible: true,
      anchors: [
        {
          id: `${PREVIEW_ID}-a`,
          time: pendingAnchors[0]!.time,
          price: pendingAnchors[0]!.price,
        },
        {
          id: `${PREVIEW_ID}-b`,
          time: pendingAnchors[1]!.time,
          price: pendingAnchors[1]!.price,
        },
        thirdAnchor,
      ],
      params: {},
      style: {
        stroke: '#2962ff',
        strokeWidth: 1,
        strokeStyle: 'dashed',
        ...(isChannel ? { fillOpacity: 0.1 } : {}),
      },
    }
  }
}
