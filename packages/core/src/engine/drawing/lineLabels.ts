/** 本文件管理绘图线段附属文本的持久化内容；位置与方向始终由渲染几何推导。 */
import type { DrawingObject } from '../../foundation/plugin'

const LINE_LABELS_PARAMETER = 'lineLabels'
const AREA_LABELS_PARAMETER = 'areaLabels'

/** 读取指定线段的非空文本。 */
export function getDrawingLineLabel(drawing: DrawingObject, lineIndex: number): string | null {
  const labels = (drawing.params as Record<string, unknown>)[LINE_LABELS_PARAMETER]
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return null
  const label = (labels as Record<string, unknown>)[String(lineIndex)]
  return typeof label === 'string' && label.trim() !== '' ? label : null
}

/** 生成写入指定线段文本后的完整参数快照；空文本会删除该线段文本。 */
export function withDrawingLineLabel(
  drawing: DrawingObject,
  lineIndex: number,
  label: string,
): Record<string, unknown> {
  const params = drawing.params as Record<string, unknown>
  const current = params[LINE_LABELS_PARAMETER]
  const lineLabels =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  const key = String(lineIndex)
  if (label.trim() === '') delete lineLabels[key]
  else lineLabels[key] = label
  const { [LINE_LABELS_PARAMETER]: _lineLabels, ...rest } = params
  return Object.keys(lineLabels).length === 0
    ? rest
    : { ...rest, [LINE_LABELS_PARAMETER]: lineLabels }
}

/** 读取指定填充区域的非空文本。 */
export function getDrawingAreaLabel(drawing: DrawingObject, areaIndex: number): string | null {
  const labels = (drawing.params as Record<string, unknown>)[AREA_LABELS_PARAMETER]
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return null
  const label = (labels as Record<string, unknown>)[String(areaIndex)]
  return typeof label === 'string' && label.trim() !== '' ? label : null
}

/** 生成写入指定填充区域文本后的完整参数快照；空文本会删除该区域文本。 */
export function withDrawingAreaLabel(
  drawing: DrawingObject,
  areaIndex: number,
  label: string,
): Record<string, unknown> {
  const params = drawing.params as Record<string, unknown>
  const current = params[AREA_LABELS_PARAMETER]
  const areaLabels =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  const key = String(areaIndex)
  if (label.trim() === '') delete areaLabels[key]
  else areaLabels[key] = label
  const { [AREA_LABELS_PARAMETER]: _areaLabels, ...rest } = params
  return Object.keys(areaLabels).length === 0
    ? rest
    : { ...rest, [AREA_LABELS_PARAMETER]: areaLabels }
}
