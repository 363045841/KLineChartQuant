import type { ScaleXSnapshot } from '../scale/index.js'
import { indexAtOrAfter, indexAtOrBefore, resolveWindowFrame, type WindowFrameInput } from './rangePreset.js'
import { captureRange, type SeriesViewportSnapshot } from './viewMemory/index.js'

type Timestamped = Readonly<{ timestamp: number }>

/** 舍弃绘图缓冲区，读取视口实际覆盖的首尾时间。 */
export function visibleTimeRange(
  view: ScaleXSnapshot,
  bars: readonly Timestamped[],
): SeriesViewportSnapshot | null {
  if (!(view.viewportWidth > 0 && view.grid.step > 0)) return null
  const left = (view.scroll - view.grid.origin) / view.grid.step
  const right = left + view.viewportWidth / view.grid.step
  return captureRange(bars, {
    start: Math.ceil(left - 0.5),
    end: Math.floor(right + 0.5) + 1,
  })
}

/** 将时间目标投影为当前尺寸下的一次导航提交。 */
export function projectTimeRange(
  bars: readonly Timestamped[],
  fromTime: number,
  toTime: number,
  geometry: Omit<WindowFrameInput, 'startIndex' | 'barCount'>,
) {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime < fromTime) return null
  const start = indexAtOrAfter(bars, fromTime)
  const end = indexAtOrBefore(bars, toTime)
  if (start === null || end === null || end < start) return null
  return resolveWindowFrame({ ...geometry, startIndex: start, barCount: end - start + 1 })
}
