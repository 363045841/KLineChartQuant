/**
 * 分时测试共享夹具：点列、交易日快照、帧级几何与渲染上下文。
 *
 * 所有分时用例从这里取同一份构造；测试只声明差异，不再各写一套点/范围/几何字面量。
 */
import type { TimeShareDay, TimeShareRange, TradingDate } from '@/data/provider/types'
import { type ChartDataView, ChartDataViewId } from '@/foundation/types/chartView'
import type { TimeShareData } from '@/foundation/types/price'
import type {
  RenderContext,
  TimeShareDayGeometry,
  TimeShareGeometry,
  TimeShareSegmentGeometry,
} from '@/plugin'
import { createMockRenderContext, type MockPaneInfoOverrides } from './renderTestKit'

/** 分时点默认值：价格与均价同值；成交量/额缺省，由用例按需声明。 */
const DEFAULT_POINT: Omit<TimeShareData, 'timestamp'> = {
  price: 10,
  average: 10,
}

/** 分时点只要求时间戳，其余字段可覆盖。 */
export type TimeSharePointInput = Partial<TimeShareData> & Pick<TimeShareData, 'timestamp'>

/** 构造单个分时点，未声明的字段取默认值。 */
export function createTimeSharePoint(input: TimeSharePointInput): TimeShareData {
  return { ...DEFAULT_POINT, ...input }
}

/** 按索引批量构造分时点，差异由调用方声明。 */
export function createTimeSharePoints(
  count: number,
  create: (index: number) => TimeSharePointInput,
): TimeShareData[] {
  return Array.from({ length: count }, (_, index) => createTimeSharePoint(create(index)))
}

/** 构造单个交易日快照；交易日字符串是受控测试数据，类型收口集中在此。 */
export function createTimeShareDay(options: {
  tradingDate: string
  preClose?: number | null
  data?: ReadonlyArray<TimeSharePointInput>
}): TimeShareDay {
  return {
    tradingDate: options.tradingDate as TradingDate,
    preClose: options.preClose ?? null,
    data: (options.data ?? []).map((point) => createTimeSharePoint(point)),
  }
}

/** 构造多日分时快照，未声明的元数据取测试默认值。 */
export function createTimeShareRange(options: {
  days: ReadonlyArray<TimeShareDay>
  instrumentId?: string
  timezone?: string
  requestedDays?: number
  olderData?: TimeShareRange['olderData']
}): TimeShareRange {
  return {
    instrumentId: options.instrumentId ?? 'test',
    timezone: options.timezone ?? 'Asia/Shanghai',
    requestedDays: options.requestedDays ?? options.days.length,
    olderData: options.olderData ?? 'exhausted',
    days: options.days,
  }
}

/** 构造单个交易日的帧级几何；未声明的范围按中心对齐推导。 */
export function createTimeShareDayGeometry(
  overrides: Partial<TimeShareDayGeometry> &
    Pick<TimeShareDayGeometry, 'dataStartIndex' | 'dataEndIndex'>,
): TimeShareDayGeometry {
  const startX = overrides.startX ?? 0
  const endX = overrides.endX ?? startX
  return {
    ...overrides,
    startX,
    endX,
    labelX: overrides.labelX ?? (startX + endX) / 2,
  }
}

/** 构造一段连续槽位几何；未声明的范围按起点推导。 */
export function createTimeShareSegment(
  overrides: Partial<TimeShareSegmentGeometry> &
    Pick<TimeShareSegmentGeometry, 'dataStartIndex' | 'dataEndIndex'>,
): TimeShareSegmentGeometry {
  const startX = overrides.startX ?? 0
  return {
    ...overrides,
    startX,
    endX: overrides.endX ?? startX,
  }
}

/** 构造帧级分时几何；默认空日、空段。 */
export function createTimeShareGeometry(
  overrides: Partial<TimeShareGeometry> = {},
): TimeShareGeometry {
  return {
    sessionSlots: 240,
    contentWidth: 800,
    days: [],
    segments: [],
    verticalGridLineXs: [],
    ...overrides,
  }
}

export interface TimeShareRenderContextOptions {
  ctx: CanvasRenderingContext2D
  data: ReadonlyArray<TimeShareData>
  dataView?: ChartDataView
  period?: string
  /** 缺省 10；显式 null 用于验证基准缺失。 */
  baseline?: number | null
  geometry?: TimeShareGeometry
  segments?: ReadonlyArray<TimeShareSegmentGeometry>
  paneWidth?: number
  centers?: ReadonlyArray<number>
  pane?: MockPaneInfoOverrides
}

/** 构造分时 Layer 的渲染上下文；默认单日、一段、基准 10。 */
export function createTimeShareRenderContext(
  options: TimeShareRenderContextOptions,
): RenderContext {
  const data = [...options.data]
  const paneWidth = options.paneWidth ?? 800
  const centers = options.centers ? [...options.centers] : data.map((_, index) => index * 10 + 5)
  const segments =
    options.segments ??
    (centers.length > 0
      ? [
          createTimeShareSegment({
            dataStartIndex: 0,
            dataEndIndex: data.length,
            startX: centers[0]!,
            endX: centers[centers.length - 1]!,
          }),
        ]
      : [])
  const geometry =
    options.geometry ??
    createTimeShareGeometry({
      contentWidth: paneWidth,
      days: [
        createTimeShareDayGeometry({
          dataStartIndex: 0,
          dataEndIndex: data.length,
          startX: 0,
          endX: paneWidth,
        }),
      ],
      segments,
    })
  const baseline = options.baseline === undefined ? 10 : options.baseline

  return createMockRenderContext({
    ctx: options.ctx,
    data,
    range: { start: 0, end: data.length },
    paneWidth,
    period: options.period ?? 'timeshare',
    dataView: options.dataView ?? ChartDataViewId.TimeShare,
    isAsiaMarket: true,
    timeShareBaseline: baseline === null ? undefined : baseline,
    timeShareGeometry: geometry,
    kLineCenters: centers,
    pane: options.pane ?? {
      height: 400,
      top: 0,
      yAxis: { priceToY: (price) => 200 - (price - 10) * 50 },
    },
  })
}
