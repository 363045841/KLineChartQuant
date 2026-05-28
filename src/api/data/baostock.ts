import { get, HttpError } from '@/utils/http'
import type { KLineData } from '@/types/price'

// ==================== 接口定义 ====================

interface BaoStockKDataRequest {
  /** 股票代码，如 `sh.600000`（沪市）、`sz.000001`（深市） */
  stock_code: string
  /** 开始日期，格式 `YYYY-MM-DD` */
  start_date: string
  /** 结束日期，格式 `YYYY-MM-DD` */
  end_date: string
  /** 数据频率：`d`=日K, `w`=周K, `m`=月K, `5`=5分钟, `15`=15分钟, `30`=30分钟, `60`=60分钟 */
  frequency?: 'd' | 'w' | 'm' | '5' | '15' | '30' | '60'
  /** 复权类型：`1`=后复权, `2`=前复权, `3`=不复权 */
  adjustflag?: '1' | '2' | '3'
  timeout?: number
}

interface BaoStockKDataItem {
  /** 交易日期 */
  date: string
  /** 股票代码 */
  code: string
  /** 开盘价 */
  open: string
  /** 最高价 */
  high: string
  /** 最低价 */
  low: string
  /** 收盘价 */
  close: string
  /** 昨收价 */
  preclose: string
  /** 成交量（股） */
  volume: string
  /** 成交额（元） */
  amount: string
  /** 复权状态 */
  adjustflag: string
  /** 换手率 */
  turn: string
  /** 交易状态 */
  tradestatus: string
  /** 涨跌幅（%） */
  pctChg: string
  /** 是否ST股 */
  isST: string
}

interface BaoStockKDataResponse {
  /** 请求是否成功 */
  success: boolean
  /** 股票代码 */
  stock_code: string
  /** 查询开始日期 */
  start_date: string
  /** 查询结束日期 */
  end_date: string
  /** 数据条数 */
  data_count: number
  /** K线数据列表 */
  data: BaoStockKDataItem[]
  /** 错误代码（失败时返回） */
  error_code?: string
  /** 错误信息（失败时返回） */
  error_msg?: string
}

interface BaoStockQueryRequest {
  /** 股票代码 */
  stock_code: string
  /** 查询最近多少天的数据，默认30 */
  days?: number
  timeout?: number
}

// ==================== 工具函数 ====================

/**
 * 将日期字符串规范化为 'YYYY-MM-DD' 格式
 */
function normalizeDateToYMD(dateStr: string): string {
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return dateStr.slice(0, 10)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }
  const d = new Date(dateStr)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return dateStr
}

/**
 * 将 'YYYY-MM-DD' 转为上海时区(UTC+8) 当天 00:00:00 的毫秒时间戳
 * 这样无论代码运行在什么时区，都不会把交易日偏移到前/后一天。
 */
function ymdToShanghaiTimestamp(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new Error(`无法解析日期: ${ymd}`)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // 上海 00:00 相当于 UTC 前一天 16:00
  return Date.UTC(year, month - 1, day, 0 - 8, 0, 0, 0)
}

/**
 * 将 baostock 频率参数转换为标准格式
 */
function normalizeFrequency(
  freq: 'daily' | 'weekly' | 'monthly' | '5' | '15' | '30' | '60' | undefined
): BaoStockKDataRequest['frequency'] {
  if (!freq) return 'd'
  const map: Record<string, BaoStockKDataRequest['frequency']> = {
    daily: 'd',
    weekly: 'w',
    monthly: 'm',
    '5': '5',
    '15': '15',
    '30': '30',
    '60': '60',
  }
  return map[freq] || 'd'
}

/**
 * 将 baostock 复权类型转换为标准格式
 */
function normalizeAdjustflag(
  adjust: 'qfq' | 'hfq' | 'none' | undefined
): BaoStockKDataRequest['adjustflag'] {
  if (!adjust) return '3'
  const map: Record<string, BaoStockKDataRequest['adjustflag']> = {
    qfq: '2', // 前复权
    hfq: '1', // 后复权
    none: '3', // 不复权
  }
  return map[adjust] || '3'
}

/**
 * 将 baostock 单条数据转换为通用 KLineData
 */
function mapBaoStockToKLineData(item: BaoStockKDataItem): KLineData {
  const ymd = normalizeDateToYMD(item.date)

  // 解析数值，处理可能的空字符串
  const parseNumber = (val: string): number => {
    const num = parseFloat(val)
    return Number.isNaN(num) ? 0 : num
  }

  return {
    timestamp: ymdToShanghaiTimestamp(ymd),
    stockCode: item.code,
    open: parseNumber(item.open),
    high: parseNumber(item.high),
    low: parseNumber(item.low),
    close: parseNumber(item.close),
    volume: parseNumber(item.volume),
    turnover: parseNumber(item.amount),
    changePercent: parseNumber(item.pctChg),
    turnoverRate: parseNumber(item.turn),
  }
}

// ==================== API 配置 ====================

const BASE_URL = import.meta.env.VITE_BAOSTOCK_API_BASE_URL || ''
const KDATA_PATH = import.meta.env.VITE_BAOSTOCK_KDATA_PATH || '/api/stock/kdata'
const QUERY_PATH = import.meta.env.VITE_BAOSTOCK_QUERY_PATH || '/api/stock/query'

// ==================== 导出函数 ====================

/**
 * 从 baostock 获取股票K线数据
 * @param param 请求参数
 * @returns Promise<KLineData[]>
 */
/**
 * 从静态 JSON 加载 mock K 线数据（用于 GitHub Pages 等静态部署）
 */
export async function loadMockKLineData(): Promise<KLineData[]> {
  const mockResponse = await fetch('mock-stock-data.json')
  const mockData: BaoStockKDataResponse = await mockResponse.json()
  if (mockData.success && mockData.data) {
    return mockData.data
      .map(mapBaoStockToKLineData)
      .sort((a, b) => a.timestamp - b.timestamp)
  }
  throw new Error('Mock data failed')
}

export async function getKlineDataBaoStock(
  param: {
    symbol: string
    start_date: string
    end_date: string
    period?: 'daily' | 'weekly' | 'monthly' | '5' | '15' | '30' | '60'
    adjust?: 'qfq' | 'hfq' | 'none'
    timeout?: number
  }
): Promise<KLineData[]> {
  // GitHub Pages 静态部署环境直接走 mock
  if (typeof window !== 'undefined' &&
    (window.location.hostname.includes('github.io')
      || window.location.hostname.includes('localhost')
      || window.location.hostname.includes('127.0.0.1'))) {
    console.log("aaa" + await loadMockKLineData())
    return await loadMockKLineData()
  }

  const { timeout, ...requestParams } = param

  const url = `${BASE_URL}${KDATA_PATH}`

  const request: BaoStockKDataRequest = {
    stock_code: requestParams.symbol,
    start_date: requestParams.start_date,
    end_date: requestParams.end_date,
    frequency: normalizeFrequency(requestParams.period),
    adjustflag: normalizeAdjustflag(requestParams.adjust),
    timeout,
  }

  try {
    const response = await get<BaoStockKDataResponse>(url, {
      params: request as unknown as Record<string, string | number | undefined>,
      timeout: timeout ? timeout * 1000 : undefined,
    })

    const result = response.data

    if (!result.success) {
      throw new Error(`获取K线数据失败: ${result.error_msg || '未知错误'} (code: ${result.error_code})`)
    }

    if (!result.data || result.data.length === 0) {
      return []
    }

    // 转换为通用 KLineData 并按时间排序
    return result.data
      .map(mapBaoStockToKLineData)
      .sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    // API 失败时尝试使用 mock 数据（用于 GitHub Pages 等静态部署）
    try {
      return await loadMockKLineData()
    } catch {
      // mock 数据也失败了，抛出原始错误
    }
    throw new Error(`获取K线数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 快捷查询最近N天的数据
 * @param param 请求参数
 * @returns Promise<KLineData[]>
 */
export async function queryKlineDataBaoStock(
  param: {
    symbol: string
    days?: number
    timeout?: number
  }
): Promise<KLineData[]> {
  const { timeout, ...requestParams } = param

  const url = `${BASE_URL}${QUERY_PATH}`

  const request: BaoStockQueryRequest = {
    stock_code: requestParams.symbol,
    days: requestParams.days || 30,
    timeout,
  }

  try {
    const response = await get<BaoStockKDataResponse>(url, {
      params: request as unknown as Record<string, string | number | undefined>,
      timeout: timeout ? timeout * 1000 : undefined,
    })

    const result = response.data

    if (!result.success) {
      throw new Error(`查询K线数据失败: ${result.error_msg || '未知错误'} (code: ${result.error_code})`)
    }

    if (!result.data || result.data.length === 0) {
      return []
    }

    // 转换为通用 KLineData 并按时间排序
    return result.data
      .map(mapBaoStockToKLineData)
      .sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    throw new Error(`查询K线数据失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export type { BaoStockKDataRequest, BaoStockKDataResponse, BaoStockKDataItem }
