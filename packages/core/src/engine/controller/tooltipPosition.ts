import { isOnRightHalf } from '../../foundation/utils/viewportSide'

export type TooltipPositionMode = 'crosshair' | 'adaptive'

export interface TooltipPositionInput {
  mouseX: number
  mouseY: number
  viewWidth: number
  viewHeight: number
  plotWidth: number
  plotHeight: number
  tooltipSize: { width: number; height: number }
  useAnchorPositioning: boolean
  mode: TooltipPositionMode
  adaptiveCorner?: 'top-left' | 'top-right'
}

export interface TooltipPositionOutput {
  pos: { x: number; y: number }
  anchorPlacement?: 'right-bottom' | 'left-bottom'
}

const PADDING = 12

export function computeTooltipPosition(input: TooltipPositionInput): TooltipPositionOutput {
  if (input.mode === 'adaptive') {
    const tooltipW = input.tooltipSize.width
    const onRight = input.adaptiveCorner
      ? input.adaptiveCorner === 'top-left'
      : isOnRightHalf(input.mouseX, input.viewWidth)
    return {
      pos: {
        x: onRight ? PADDING : Math.max(PADDING, input.viewWidth - tooltipW - PADDING),
        y: PADDING,
      },
    }
  }

  const padding = PADDING
  const preferGap = 14

  if (input.useAnchorPositioning) {
    const tooltipW = input.tooltipSize.width
    const rightCandidateX = input.mouseX + preferGap
    const rightWouldOverflow = rightCandidateX + tooltipW + padding > input.plotWidth
    return {
      anchorPlacement: rightWouldOverflow ? 'left-bottom' : 'right-bottom',
      pos: {
        x: Math.min(Math.max(input.mouseX, padding), Math.max(padding, input.plotWidth - padding)),
        y: Math.min(Math.max(input.mouseY, padding), Math.max(padding, input.plotHeight - padding)),
      },
    }
  }

  const tooltipW = input.tooltipSize.width
  const tooltipH = input.tooltipSize.height
  const rightX = input.mouseX + preferGap
  const leftX = input.mouseX - preferGap - tooltipW
  const desiredX = rightX + tooltipW + padding <= input.viewWidth ? rightX : leftX
  const desiredY = input.mouseY + preferGap
  const maxX = Math.max(padding, input.viewWidth - tooltipW - padding)
  const maxY = Math.max(padding, input.viewHeight - tooltipH - padding)
  return {
    pos: {
      x: Math.min(Math.max(desiredX, padding), maxX),
      y: Math.min(Math.max(desiredY, padding), maxY),
    },
  }
}
