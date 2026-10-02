/** 各 Pane 的价格轴范围状态；主图信号由同一份状态派生。 */
import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../foundation/config/priceAxisRangeMode.js'
import { computed, createSubState } from '../../foundation/reactivity/signal.js'
import { MAIN_PANE_ID } from '../paneIds.js'
import type { PriceRange } from '../scale/price.js'

export interface PanePriceAxisRange {
  readonly rangeMode: PriceAxisRangeMode
  readonly handRange: PriceRange | null
}

/** 创建逐 Pane 范围状态，未设置的副图使用自动范围。 */
export function createMainPriceAxisState(initialMode: PriceAxisRangeMode) {
  const paneRanges: Readonly<Record<string, PanePriceAxisRange>> = Object.freeze({
    [MAIN_PANE_ID]: Object.freeze({ rangeMode: initialMode, handRange: null }),
  })
  const { signals, readonly } = createSubState({ paneRanges })
  /** 原子写入目标 Pane，不修改其他轴。 */
  function write(paneId: string, rangeMode: PriceAxisRangeMode, range: PriceRange | null): void {
    signals.paneRanges.set(
      Object.freeze({
        ...readonly.paneRanges.peek(),
        [paneId]: Object.freeze({
          rangeMode,
          handRange: range ? Object.freeze({ ...range }) : null,
        }),
      }),
    )
  }
  return {
    readonly: {
      ...readonly,
      rangeMode: computed(() => readonly.paneRanges()[MAIN_PANE_ID]!.rangeMode),
      handRange: computed(() => readonly.paneRanges()[MAIN_PANE_ID]!.handRange),
    },
    actions: {
      /** 清除手动范围，下一帧从目标 Pane 数据重新初始化。 */
      resetHandRange(paneId: string = MAIN_PANE_ID): void {
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
      useAutoRange(paneId: string = MAIN_PANE_ID): void {
        write(paneId, PRICE_AXIS_RANGE_MODE.AUTO, null)
      },
      /** 关闭自动时锁定当前显示范围。 */
      useHandRange(range: PriceRange, paneId: string = MAIN_PANE_ID): void {
        write(paneId, PRICE_AXIS_RANGE_MODE.HAND, range)
      },
      /** 交互只修改已初始化的手动范围。 */
      setHandRange(range: PriceRange, paneId: string = MAIN_PANE_ID): void {
        const current = readonly.paneRanges.peek()[paneId]
        if (current?.rangeMode === PRICE_AXIS_RANGE_MODE.HAND && current.handRange !== null)
          write(paneId, current.rangeMode, range)
      },
      /** 首个有效帧初始化手动范围。 */
      initializeHandRange(range: PriceRange, paneId: string = MAIN_PANE_ID): void {
        const current = readonly.paneRanges.peek()[paneId]
        if (current?.rangeMode === PRICE_AXIS_RANGE_MODE.HAND && current.handRange === null)
          write(paneId, current.rangeMode, range)
      },
      /** 删除 Pane 时释放其范围状态。 */
      retainPanes(paneIds: ReadonlySet<string>): void {
        const entries = Object.entries(readonly.paneRanges.peek())
        if (entries.every(([id]) => paneIds.has(id))) return
        signals.paneRanges.set(
          Object.freeze(Object.fromEntries(entries.filter(([id]) => paneIds.has(id)))),
        )
      },
    },
  }
}

export type MainPriceAxisStateModule = ReturnType<typeof createMainPriceAxisState>
