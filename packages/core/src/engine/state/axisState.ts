/** 独立 Y 轴范围状态：所有写入必须提供 axisId，不存在默认主轴。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../foundation/config/priceAxisRangeMode.js'
import { createSubState } from '../../foundation/reactivity/signal.js'
import type { LayoutPanePriceAxisModes } from '../layout/index.js'
import type { PriceRange } from '../scale/index.js'

export interface PanePriceAxisRange {
  readonly rangeMode: PriceAxisRangeMode
  readonly handRange: PriceRange | null
  /** 调用方显式设置的百分比基准；未设置时由对象数据提供。 */
  readonly baseValue?: number
}

/** 创建逐 Pane 范围状态；主图从 settings 偏好初始化，未设置的副图使用自动范围。 */
export function createAxisState(initialModes: Readonly<Record<string, PriceAxisRangeMode>>) {
  const seeded: Record<string, PanePriceAxisRange> = Object.fromEntries(
    Object.entries(initialModes).map(([id, rangeMode]) => [
      id,
      Object.freeze({ rangeMode, handRange: null }),
    ]),
  )
  const paneRanges: Readonly<Record<string, PanePriceAxisRange>> = Object.freeze(seeded)
  const { signals, readonly } = createSubState({ paneRanges })
  /** 原子写入目标 Pane，不修改其他轴。 */
  function write(paneId: string, rangeMode: PriceAxisRangeMode, range: PriceRange | null): void {
    signals.paneRanges.set(
      Object.freeze({
        ...readonly.paneRanges.peek(),
        [paneId]: Object.freeze({
          ...readonly.paneRanges.peek()[paneId],
          rangeMode,
          handRange: range ? Object.freeze({ ...range }) : null,
        }),
      }),
    )
  }
  return {
    readonly,
    actions: {
      /** 轴配置 API 验证后的基准写入，与范围状态同属一个快照。 */
      setBaseValue(axisId: string, baseValue: number): void {
        if (!Number.isFinite(baseValue) || baseValue === 0)
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_PARAM,
            '百分比轴基准必须是非零有限数值',
          )
        const current = readonly.paneRanges.peek()[axisId]
        if (current === undefined)
          throw new KLineChartError(GENERIC_ERROR_CODES.NOT_REGISTERED, `轴未注册：${axisId}`)
        signals.paneRanges.set(
          Object.freeze({
            ...readonly.paneRanges.peek(),
            [axisId]: Object.freeze({ ...current, baseValue }),
          }),
        )
      },
      /** 同时恢复模式和锁定范围，不从运行时默认轴重新捕获范围。 */
      restoreModes(
        modes: LayoutPanePriceAxisModes,
        ranges: Readonly<Record<string, PriceRange>> = {},
        bases: Readonly<Record<string, number>> = {},
      ): void {
        for (const [axisId, base] of Object.entries(bases)) {
          if (!Number.isFinite(base) || base === 0)
            throw new KLineChartError(
              GENERIC_ERROR_CODES.INVALID_PARAM,
              `轴 ${axisId} 的百分比基准必须是非零有限数值`,
            )
        }
        signals.paneRanges.set(
          Object.freeze(
            Object.fromEntries(
              Object.entries({ ...initialModes, ...modes }).map(([id, rangeMode]) => [
                id,
                Object.freeze({
                  rangeMode,
                  ...(bases[id] === undefined ? {} : { baseValue: bases[id] }),
                  handRange:
                    rangeMode === PRICE_AXIS_RANGE_MODE.HAND && ranges[id]
                      ? Object.freeze({ ...ranges[id] })
                      : null,
                }),
              ]),
            ),
          ),
        )
      },
      /** 清除手动范围，下一帧从目标 Pane 数据重新初始化。 */
      resetHandRange(paneId: string): void {
        const current = readonly.paneRanges.peek()[paneId]
        if (current) write(paneId, current.rangeMode, null)
      },
      /** 品种变化时清除所有轴的旧数据范围，保留各自模式。 */
      resetAllHandRanges(): void {
        signals.paneRanges.set(
          Object.freeze(
            Object.fromEntries(
              Object.entries(readonly.paneRanges.peek()).map(([id, state]) => [
                id,
                Object.freeze({ ...state, handRange: null }),
              ]),
            ),
          ),
        )
      },
      /** 自动范围不保留纵轴变换。 */
      useAutoRange(paneId: string): void {
        write(paneId, PRICE_AXIS_RANGE_MODE.AUTO, null)
      },
      /** 关闭自动时锁定当前显示范围。 */
      useHandRange(range: PriceRange, paneId: string): void {
        write(paneId, PRICE_AXIS_RANGE_MODE.HAND, range)
      },
      /** 交互只修改已初始化的手动范围。 */
      setHandRange(range: PriceRange, paneId: string): void {
        const current = readonly.paneRanges.peek()[paneId]
        if (current?.rangeMode === PRICE_AXIS_RANGE_MODE.HAND && current.handRange !== null)
          write(paneId, current.rangeMode, range)
      },
      /** 首个有效帧批量初始化各轴的锁定范围，一次快照提交避免多次通知。 */
      initializeHandRanges(entries: ReadonlyArray<{ axisId: string; range: PriceRange }>): void {
        const current = readonly.paneRanges.peek()
        let next: Record<string, PanePriceAxisRange> | null = null
        for (const { axisId, range } of entries) {
          const state = current[axisId]
          if (state?.rangeMode !== PRICE_AXIS_RANGE_MODE.HAND || state.handRange !== null) continue
          next ??= { ...current }
          next[axisId] = Object.freeze({
            rangeMode: state.rangeMode,
            handRange: Object.freeze({ ...range }),
          })
        }
        if (next) signals.paneRanges.set(Object.freeze(next))
      },
      /** 对象轴生命周期入口：新轴初始化为自动，消失轴释放状态。 */
      retainAxes(paneIds: ReadonlySet<string>): void {
        const entries = Object.entries(readonly.paneRanges.peek())
        if (entries.length === paneIds.size && entries.every(([id]) => paneIds.has(id))) return
        const existing = readonly.paneRanges.peek()
        signals.paneRanges.set(
          Object.freeze(
            Object.fromEntries(
              [...paneIds].map((axisId) => [
                axisId,
                existing[axisId] === undefined
                  ? Object.freeze({ rangeMode: PRICE_AXIS_RANGE_MODE.AUTO, handRange: null })
                  : existing[axisId],
              ]),
            ),
          ),
        )
      },
    },
  }
}

export type AxisStateModule = ReturnType<typeof createAxisState>
