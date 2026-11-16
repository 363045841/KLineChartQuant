/**
 * 订单流只读服务：把按天分片的数据暴露成 HTTP，供前端面板与 Agent 工具读取。
 *
 * 为什么需要这一层：
 * - renderer 不能直接读 NAS 的 SMB 盘（Electron 要走 main 进程 IPC），也不能直连交易所（CORS）。
 *   现有行情链路本来就是「本地 HTTP 服务 + 前端 fetch」，这里保持一致。
 * - 服务**只读不写、不做计算**。聚合、矛盾识别都在 `orderflow/impl/` 里，
 *   服务只负责把分片读出来。这样同一份数据可以被面板、Agent、脚本三方共享且口径一致。
 *
 * 安全边界：只绑 127.0.0.1，只暴露 GET，路径参数会校验（防目录穿越），
 * 不提供写接口，也不返回数据目录之外的任何文件。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { OPTION_STATS_DEFAULT_WINDOWS } from '../../options/impl/stats'
import { OPTION_STEP_LAYERS, optionLayerStream } from '../../options/impl/streams'
import { orderflowStream } from '../../orderflow/impl/collect'
import { reassemblePanel } from '../../orderflow/impl/reassemble'
import { renderPanel } from '../../orderflow/impl/render'
import {
  type DepthRecord,
  type FlowMinuteRecord,
  type FlowRecord,
  type LargeOrderRecord,
  ORDERFLOW_VENUES,
  type PositioningRecord,
} from '../../orderflow/types'
import type { DayShardStore } from '../../storage/types'
import { createOptionDataReader } from './optionData'

/** 默认端口：避开 gotdx 8080 / baostock 8000 / binance 8091 / mt5 8090 / ths 8092。 */
export const DEFAULT_ORDERFLOW_PORT = 8093

/** 流标识允许的字符：字母、数字、下划线、连字符、点与斜杠。 */
const STREAM_PATTERN = /^[A-Za-z0-9._/-]+$/

/** 日期分片允许的格式。 */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** 期权标的允许的格式：大写字母或数字。 */
const CURRENCY_PATTERN = /^[A-Z0-9]{2,10}$/

/** 组装面板的路由。 */
export const ORDERFLOW_PANEL_PATH = '/orderflow/panel'

/** 序列默认取几行。 */
const OPTION_SERIES_DEFAULT_LIMIT = 500

/** 序列单次最多返回多少行：20000 行覆盖约 13.9 天的分钟行。 */
const OPTION_SERIES_MAX_LIMIT = 20_000

/** 窗口天数上限：日行保留 3650 天。 */
const OPTION_DAYS_MAX = 3_650

/** 一次最多请求几个统计窗口。 */
const OPTION_WINDOWS_MAX = 3

/** 服务构造参数。 */
export interface OrderflowServerOptions {
  /** 分片存储（只读使用） */
  readonly store: DayShardStore
  /** 监听端口 */
  readonly port: number
  /** 监听地址，默认 127.0.0.1 */
  readonly host?: string
  /** 时钟（毫秒）；测试注入固定时间，生产用 Date.now */
  readonly now?: () => number
}

/** 服务句柄。 */
export interface OrderflowServerHandle {
  /** 实际监听端口 */
  readonly port: number
  /** 关闭服务 */
  readonly close: () => Promise<void>
}

/**
 * 写 JSON 响应。
 *
 * @param response 响应对象
 * @param status HTTP 状态码
 * @param payload 响应体
 */
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    // 只读本地服务，允许任意来源：桌面端 renderer 的 origin 可能是 app:// 或 file://，
    // 逐条白名单维护成本高于收益，且服务只绑 127.0.0.1、只提供 GET。
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': 'no-store',
  })
  response.end(body)
}

/**
 * 读查询参数。
 *
 * @param url 请求地址
 * @param name 参数名
 * @returns 参数值；不存在为 null
 */
function queryParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name)
  return value === null || value === '' ? null : value
}

/**
 * 读可选整数参数。
 *
 * @param url 请求地址
 * @param name 参数名
 * @param min 允许的最小值
 * @param max 允许的最大值
 * @returns 未提供为 undefined；非法为 null；合法为数值
 */
function optionalIntegerParam(
  url: URL,
  name: string,
  min: number,
  max: number,
): number | undefined | null {
  const text = queryParam(url, name)
  if (text === null) return undefined
  const value = Number(text)
  if (!Number.isSafeInteger(value) || value < min || value > max) return null
  return value
}

/**
 * 读统计窗口参数。
 *
 * @param url 请求地址
 * @returns 窗口天数（去重、保序）；非法为 null
 */
function parseWindowParam(url: URL): readonly number[] | null {
  const text = queryParam(url, 'windows')
  if (text === null) return OPTION_STATS_DEFAULT_WINDOWS
  const parts = text.split(',').map((part) => Number(part.trim()))
  if (parts.length === 0 || parts.length > OPTION_WINDOWS_MAX) return null
  const windows: number[] = []
  for (const value of parts) {
    if (!Number.isSafeInteger(value) || value < 1 || value > OPTION_DAYS_MAX) return null
    if (!windows.includes(value)) windows.push(value)
  }
  return windows
}

/**
 * 列出某条流的所有日期分片。
 *
 * @param store 存储
 * @param stream 流标识
 * @returns 日期数组（升序）
 */
function listDays(store: DayShardStore, stream: string): readonly string[] {
  return store.listDays(stream)
}

/**
 * 读取某条流最新一天的全部记录。
 *
 * @param store 存储
 * @param stream 流标识
 * @returns 记录数组与所属日期；无数据时日期为 null
 */
function readLatest(
  store: DayShardStore,
  stream: string,
): {
  day: string | null
  rows: readonly unknown[]
} {
  const days = listDays(store, stream)
  const day = days.length === 0 ? null : days[days.length - 1]
  if (day === null) return { day: null, rows: [] }
  return { day, rows: store.read({ stream, day }) }
}

/**
 * 读某条流最近若干天的记录（合并），供跨日与补数场景使用。
 *
 * @param store 存储
 * @param stream 流标识
 * @param days 回溯天数
 * @returns 记录数组
 */
function readRecentDays(store: DayShardStore, stream: string, days: number): readonly unknown[] {
  const available = listDays(store, stream)
  const picked = available.slice(-days)
  const rows: unknown[] = []
  for (const day of picked) {
    rows.push(...store.read({ stream, day }))
  }
  return rows
}

/**
 * 组装某品种的面板快照。
 *
 * 三类数据各自取最新可用值：某家持仓接口挂了，它的深度仍然进面板，
 * 缺失项写进 `errors`。不做时间对齐插值——那是伪精度。
 *
 * @param store 存储
 * @param symbol 交易对
 * @returns 面板快照
 */
function buildPanelFor(store: DayShardStore, symbol: string) {
  const depth: DepthRecord[] = []
  const flow: FlowRecord[] = []
  const flowMinutes: FlowMinuteRecord[] = []
  const positioning: PositioningRecord[] = []
  const largeOrders: LargeOrderRecord[] = []

  for (const venue of ORDERFLOW_VENUES) {
    // 跨日边界用两天：读取时刻刚过 UTC 零点时，上一轮数据还在昨天的分片里
    depth.push(
      ...(readRecentDays(store, orderflowStream('depth', venue, symbol), 2) as DepthRecord[]),
    )
    flow.push(...(readRecentDays(store, orderflowStream('flow', venue, symbol), 2) as FlowRecord[]))
    // 分钟流一天 1440 行，两天是聚合 1h 所需的最长回看
    flowMinutes.push(
      ...(readRecentDays(
        store,
        orderflowStream('flow-minutes', venue, symbol),
        2,
      ) as FlowMinuteRecord[]),
    )
    positioning.push(
      ...(readRecentDays(
        store,
        orderflowStream('positioning', venue, symbol),
        2,
      ) as PositioningRecord[]),
    )
    // 钟级记录一天只有 24 条，跨日多读一天成本可忽略
    largeOrders.push(
      ...(readRecentDays(
        store,
        orderflowStream('large-orders', venue, symbol),
        2,
      ) as LargeOrderRecord[]),
    )
  }

  const ascending = <T extends { readonly timestamp: number }>(rows: readonly T[]): T[] =>
    [...rows].sort((left, right) => left.timestamp - right.timestamp)

  return reassemblePanel(
    {
      symbol,
      depth: ascending(depth),
      flow: ascending(flow),
      flowMinutes,
      positioning: ascending(positioning),
      largeOrders: ascending(largeOrders),
    },
    ORDERFLOW_VENUES,
    Date.now(),
  )
}

/**
 * 创建订单流只读服务。
 *
 * @param options 存储与端口
 * @returns 服务句柄
 */
export async function startOrderflowServer(
  options: OrderflowServerOptions,
): Promise<OrderflowServerHandle> {
  const host = options.host ?? '127.0.0.1'
  const dataReader = createOptionDataReader({ store: options.store, now: options.now ?? Date.now })

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'content-type',
      })
      response.end()
      return
    }
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: '只支持 GET' })
      return
    }

    const url = new URL(request.url ?? '/', `http://${host}`)

    if (url.pathname === '/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    // 期权序列：按层（step）与窗口（days）取数，limit 只作为最后一道保护
    if (url.pathname === '/options/series') {
      const currency = queryParam(url, 'currency')
      if (currency === null) {
        sendJson(response, 400, { error: '缺少 currency 参数' })
        return
      }
      if (!CURRENCY_PATTERN.test(currency)) {
        sendJson(response, 400, { error: 'currency 需为大写字母或数字' })
        return
      }
      const step = queryParam(url, 'step') ?? 'minute'
      const layer = OPTION_STEP_LAYERS[step]
      if (layer === undefined) {
        sendJson(response, 400, { error: 'step 需为 minute、hour 或 day' })
        return
      }
      const requestedDays = optionalIntegerParam(url, 'days', 1, OPTION_DAYS_MAX)
      if (requestedDays === null) {
        sendJson(response, 400, { error: `days 需为 1..${OPTION_DAYS_MAX} 的整数` })
        return
      }
      const requestedLimit = optionalIntegerParam(url, 'limit', 1, OPTION_SERIES_MAX_LIMIT)
      if (requestedLimit === null) {
        sendJson(response, 400, { error: `limit 需为 1..${OPTION_SERIES_MAX_LIMIT} 的整数` })
        return
      }
      const read = dataReader.readSeries({
        currency,
        layer,
        days: requestedDays,
        limit: requestedLimit ?? OPTION_SERIES_DEFAULT_LIMIT,
      })
      sendJson(response, 200, {
        currency,
        step,
        days: read.days,
        rows: read.rows,
        rowCount: read.rows.length,
        truncated: read.truncated,
      })
      return
    }
    // 期权波动统计：只读日行（缺失回退小时行），窗口按 UTC 日历天
    if (url.pathname === '/options/stats') {
      const currency = queryParam(url, 'currency')
      if (currency === null) {
        sendJson(response, 400, { error: '缺少 currency 参数' })
        return
      }
      if (!CURRENCY_PATTERN.test(currency)) {
        sendJson(response, 400, { error: 'currency 需为大写字母或数字' })
        return
      }
      const windows = parseWindowParam(url)
      if (windows === null) {
        sendJson(response, 400, {
          error: `windows 需为 1..${OPTION_WINDOWS_MAX} 个 1..${OPTION_DAYS_MAX} 的整数`,
        })
        return
      }
      sendJson(response, 200, { currency, ...dataReader.readStats(currency, windows) })
      return
    }
    // 期权聚合位：返回某标的可用日期与该日最新一行
    if (url.pathname === '/options/levels') {
      const currency = queryParam(url, 'currency')
      if (currency === null) {
        sendJson(response, 400, { error: '缺少 currency 参数' })
        return
      }
      if (!CURRENCY_PATTERN.test(currency)) {
        sendJson(response, 400, { error: 'currency 需为大写字母或数字' })
        return
      }
      const stream = optionLayerStream(currency, 'minute')
      const days = listDays(options.store, stream)
      const requestedDay = queryParam(url, 'day')
      if (requestedDay !== null && !DAY_PATTERN.test(requestedDay)) {
        sendJson(response, 400, { error: 'day 需为 YYYY-MM-DD' })
        return
      }
      const day = requestedDay ?? (days.length === 0 ? null : days[days.length - 1])
      if (day === null) {
        sendJson(response, 404, { error: '没有可用的期权数据', stream })
        return
      }
      const rows = options.store.read({ stream, day })
      sendJson(response, 200, {
        currency,
        day,
        days,
        latest: rows.length === 0 ? null : rows[rows.length - 1],
      })
      return
    }

    // 列举某条流的可用日期
    if (url.pathname === '/orderflow/days') {
      const stream = queryParam(url, 'stream')
      if (stream === null) {
        sendJson(response, 400, { error: '缺少 stream 参数' })
        return
      }
      if (!STREAM_PATTERN.test(stream)) {
        sendJson(response, 400, { error: 'stream 含非法字符' })
        return
      }
      sendJson(response, 200, { stream, days: listDays(options.store, stream) })
      return
    }

    // 读某一天（缺省最新一天）的全部记录
    if (url.pathname === '/orderflow/records') {
      const stream = queryParam(url, 'stream')
      if (stream === null) {
        sendJson(response, 400, { error: '缺少 stream 参数' })
        return
      }
      if (!STREAM_PATTERN.test(stream)) {
        sendJson(response, 400, { error: 'stream 含非法字符' })
        return
      }
      const day = queryParam(url, 'day')
      if (day !== null && !DAY_PATTERN.test(day)) {
        sendJson(response, 400, { error: 'day 需为 YYYY-MM-DD' })
        return
      }
      if (day === null) {
        const latest = readLatest(options.store, stream)
        sendJson(response, 200, { stream, day: latest.day, rows: latest.rows })
        return
      }
      sendJson(response, 200, { stream, day, rows: options.store.read({ stream, day }) })
      return
    }

    // 也接受 /orderflow/panel 的路由前缀（与 records 同构，只是组装过）
    if (url.pathname === ORDERFLOW_PANEL_PATH) {
      const symbol = queryParam(url, 'symbol')
      if (symbol === null) {
        sendJson(response, 400, { error: '缺少 symbol 参数' })
        return
      }
      if (!STREAM_PATTERN.test(symbol)) {
        sendJson(response, 400, { error: 'symbol 含非法字符' })
        return
      }
      const panel = buildPanelFor(options.store, symbol)
      if (queryParam(url, 'format') === 'text') {
        const body = renderPanel(panel)
        response.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': Buffer.byteLength(body),
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        })
        response.end(body)
        return
      }
      sendJson(response, 200, panel)
      return
    }

    sendJson(response, 404, { error: '未知路径' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, host, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address !== null ? address.port : options.port

  return {
    port: actualPort,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
