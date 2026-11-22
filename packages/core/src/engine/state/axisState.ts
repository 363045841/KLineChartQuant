/** 独立 Y 轴范围状态：所有写入必须提供 axisId，不存在默认主轴。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import {
  type AutoPriceAxisRangeMode,
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../foundation/config/priceAxisRangeMode.js'
import { createSubState } from '../../foundation/reactivity/signal.js'
import type { LayoutPanePriceAxisModes } from '../layout/index.js'
import type { PriceRange } from '../scale/index.js'

export interface PanePriceAxisRange {
  readonly rangeMode: PriceAxisRangeMode
  /** 手动模式保存的显示范围；自动口径下轴范围由帧结果直接投影，此处为 null。 */
  readonly range: PriceRange | null
  /** 调用方显式设置的百分比基准；未设置时由对象数据提供。 */
  readonly baseValue?: number
}

/** 创建逐轴范围状态；未声明的轴在生命周期入口初始化为全并口径。 */
export function createAxisState(initialModes: Readonly<Record<string, PriceAxisRangeMode>>) {
  const seeded: Record<string, PanePriceAxisRange> = Object.fromEntries(
    Object.entries(initialModes).map(([id, rangeMode]) => [
      id,
      Object.freeze({ rangeMode, range: null }),
    ]),
  )
  const paneRanges: Readonly<Record<string, PanePriceAxisRange>> = Object.freeze(seeded)
  const { signals, readonly } = createSubState({ paneRanges })

  /** 原子写入目标轴，不修改其他轴。 */
  function write(axisId: string, rangeMode: PriceAxisRangeMode, range: PriceRange | null): void {
    signals.paneRanges.set(
      Object.freeze({
        ...readonly.paneRanges.peek(),
        [axisId]: Object.freeze({
          ...readonly.paneRanges.peek()[axisId],
          rangeMode,
          range: range ? Object.freeze({ ...range }) : null,
        }),
      }),
    )
  }

  /** 逐轴更新状态；返回 null 表示该轴没有实际变化。 */
  function update(
    axisId: string,
    change: (state: PanePriceAxisRange) => PanePriceAxisRange | null,
  ): void {
    const current = readonly.paneRanges.peek()[axisId]
    if (current === undefined) return
    const next = change(current)
    if (next) signals.paneRanges.set(Object.freeze({ ...readonly.paneRanges.peek(), [axisId]: next }))
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
      /** 同时恢复模式和手动范围；布局文档里的自动范围值一律丢弃。 */
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
                  range:
                    rangeMode === PRICE_AXIS_RANGE_MODE.Manual && ranges[id]
                      ? Object.freeze({ ...ranges[id] })
                      : null,
                }),
              ]),
            ),
          ),
        )
      },
      /** 切换到自动口径：清除手动范围，下一帧按该口径拟合。 */
      useAutoMode(axisId: string, mode: AutoPriceAxisRangeMode): void {
        write(axisId, mode, null)
      },
      /** 切到手动：把当前显示范围作为后续唯一来源。 */
      useManualMode(range: PriceRange, axisId: string): void {
        write(axisId, PRICE_AXIS_RANGE_MODE.Manual, range)
      },
      /** 交互平移/缩放只修改已初始化的手动范围。 */
      setRange(range: PriceRange, axisId: string): void {
        update(axisId, (state) =>
          state.rangeMode === PRICE_AXIS_RANGE_MODE.Manual && state.range !== null
            ? Object.freeze({ ...state, range: Object.freeze({ ...range }) })
            : null,
        )
      },
      /** 清除手动范围，下一帧从当前数据重新初始化；模式保持不变。 */
      resetRange(axisId: string): void {
        update(axisId, (state) => (state.range === null ? null : Object.freeze({ ...state, range: null })))
      },
      /** 品种变化时清除所有轴的数据范围，保留各自模式。 */
      resetAllRanges(): void {
        signals.paneRanges.set(
          Object.freeze(
            Object.fromEntries(
              Object.entries(readonly.paneRanges.peek()).map(([id, state]) => [
                id,
                Object.freeze({ ...state, range: null }),
              ]),
            ),
          ),
        )
      },
      /** 首个有效帧批量初始化各轴的手动范围，一次快照提交避免多次通知。 */
      initializeManualRanges(entries: ReadonlyArray<{ axisId: string; range: PriceRange }>): void {
        const current = readonly.paneRanges.peek()
        let next: Record<string, PanePriceAxisRange> | null = null
        for (const { axisId, range } of entries) {
          const state = current[axisId]
          if (state?.rangeMode !== PRICE_AXIS_RANGE_MODE.Manual || state.range !== null) continue
          next ??= { ...current }
          next[axisId] = Object.freeze({
            rangeMode: state.rangeMode,
            range: Object.freeze({ ...range }),
          })
        }
        if (next) signals.paneRanges.set(Object.freeze(next))
      },
      /** 对象轴生命周期入口：新轴初始化为全并口径，消失轴释放状态。 */
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
                  ? Object.freeze({ rangeMode: PRICE_AXIS_RANGE_MODE.All, range: null })
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
