/**
 * 订单流面板的连接状态：刷新按钮左侧指示灯的唯一判定来源。
 *
 * 只看「请求有没有成功」不够。采集器停摆时服务仍然 200，面板会一脸正常地展示旧数据，
 * 所以超时未更新也算离线。三态与颜色一一对应，供模板与无障碍标签共用。
 */

/**
 * 指示灯四态。
 *
 * - `online`：服务通、且每家都在出新数据
 * - `warning`：服务通，但有交易所停摆（部分离线）
 * - `offline`：整体离线：从未成功，或超过阈值没有新快照
 * - `error`：请求失败或返回结构不对
 */
export type PanelTone = 'online' | 'warning' | 'offline' | 'error'

/** 面板状态。 */
export interface PanelStatus {
  /** 三态 */
  readonly tone: PanelTone
  /** 给人看的说明，同时作为悬浮提示与无障碍标签 */
  readonly label: string
}

/** 超过这个时长没有新数据就判为离线：与面板原有的「标黄」阈值一致。 */
export const PANEL_STALE_MS = 10 * 60 * 1000

/** 判定输入。 */
export interface PanelStatusInput {
  /** 当前错误；成功时为 null */
  readonly error: string | null
  /** 最后一次成功时刻；从未成功为 null */
  readonly lastUpdated: number | null
  /** 判定时刻 */
  readonly now: number
  /** 离线阈值；缺省用 `PANEL_STALE_MS` */
  readonly staleMs?: number
}

/**
 * 描述面板状态。
 *
 * @param input 错误、最后成功时刻与判定时刻
 * @returns 三态与说明文本
 */
export function describePanelStatus(input: PanelStatusInput): PanelStatus {
  const staleMs = input.staleMs === undefined ? PANEL_STALE_MS : input.staleMs
  if (input.error !== null) return { tone: 'error', label: `连接异常：${input.error}` }
  if (input.lastUpdated === null) return { tone: 'offline', label: '未连接：还没有成功取到面板' }

  const age = input.now - input.lastUpdated
  if (age > staleMs) {
    const minutes = Math.max(1, Math.round(age / 60_000))
    return { tone: 'offline', label: `离线：数据已经 ${minutes} 分钟没有更新` }
  }
  return { tone: 'online', label: '在线：数据是最新的' }
}

/** 一家落后超过阈值的交易所。 */
export interface StaleVenue {
  /** 交易所标识 */
  readonly venue: string
  /** 落后多少分钟（至少 1） */
  readonly minutes: number
}

/**
 * 找出数据落后的交易所。
 *
 * 服务在线不等于每家都在出数：采集器只挂了某一家的分钟任务时，整块面板看着正常，
 * 那一家其实已经停了。这里逐家比对最新记录时刻，把落后的点名出来。
 *
 * @param venues 面板里的交易所视图
 * @param now 判定时刻
 * @param staleMs 落后阈值；缺省用 `PANEL_STALE_MS`
 * @returns 落后交易所，按落后时长从大到小
 */
export function staleVenues(
  venues: readonly { readonly venue: string; readonly updatedAt: number | null }[],
  now: number,
  staleMs: number = PANEL_STALE_MS,
): readonly StaleVenue[] {
  const stale: StaleVenue[] = []
  for (const venue of venues) {
    // 完全没有记录时不点名：那是「这一类数据本来就没有」，不是停摆
    if (venue.updatedAt === null) continue
    const age = now - venue.updatedAt
    if (age <= staleMs) continue
    stale.push({ venue: venue.venue, minutes: Math.max(1, Math.round(age / 60_000)) })
  }
  return stale.sort((left, right) => right.minutes - left.minutes)
}

/**
 * 把逐所健康并进整体状态。
 *
 * 部分交易所停摆降为黄灯，这样不点开提示也能看见；已经更严重的状态不降级，
 * 报错仍是红灯、整体离线仍是灰灯。
 *
 * @param base 三态结果
 * @param stale 停摆的交易所
 * @returns 合并后的状态与文案
 */
export function withVenueHealth(base: PanelStatus, stale: readonly StaleVenue[]): PanelStatus {
  if (stale.length === 0) return base
  const detail = stale.map((item) => `${item.venue} ${item.minutes} 分钟`).join('、')
  const tone: PanelTone = base.tone === 'online' ? 'warning' : base.tone
  return { tone, label: `${base.label}；以下交易所停摆：${detail}` }
}
