/**
 * 日期格式化工具函数集合
 * 统一管理项目中所有日期相关的格式化逻辑
 */

// ========== 模块级复用的 Intl.DateTimeFormat 实例 ==========
// Intl.DateTimeFormat 构造极其昂贵（~36ms），必须复用
const YMD_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

// ========== 缓存配置 ==========
const YMD_CACHE_SIZE = 1024
const ymdCache = new Map<number, string>()

/**
 * 将时间戳格式化为 YYYYMMDD 格式（纯数字，无分隔符）
 * @param timestamp - 时间戳（毫秒）
 * @returns 格式化后的日期字符串，例如 "20250114"
 *
 * @example
 * formatDateToYYYYMMDDNoDash(1736793600000) // "20250114"
 */
function formatDateToYYYYMMDDNoDash(timestamp: number): string {
    const d = new Date(timestamp)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

/**
 * 获取当前日期的 YYYYMMDD 格式（纯数字，无分隔符）
 * @returns 当前日期的格式化字符串，例如 "20250114"
 *
 * @example
 * getCurrentDateYYYYMMDD() // "20250114"（根据实际日期）
 */
function getCurrentDateYYYYMMDD(): string {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}${month}${day}`
}

/**
 * 将时间戳格式化为 YYYY-MM-DD 格式（上海时区）
 * @param timestamp - 时间戳（毫秒）
 * @returns 格式化后的日期字符串，例如 "2025-01-14"
 *
 * @example
 * formatDateToYYYYMMDD(1736793600000) // "2025-01-14"
 */
export function formatDateToYYYYMMDD(timestamp: number): string {
    // 缓存命中检查
    const cached = ymdCache.get(timestamp)
    if (cached !== undefined) return cached

    // 使用复用的 formatter，避免每次构造开销
    const parts = YMD_FORMATTER.formatToParts(new Date(timestamp))

    // 用 for 循环替代 .reduce，避免临时对象分配
    let y = '', m = '', d = ''
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (p.type === 'year') y = p.value
        else if (p.type === 'month') m = p.value
        else if (p.type === 'day') d = p.value
    }

    const result = `${y}-${m}-${d}`

    // 写入缓存，防膨胀
    if (ymdCache.size >= YMD_CACHE_SIZE) ymdCache.clear()
    ymdCache.set(timestamp, result)

    return result
}

// ========== formatMonthOrYear 缓存 ==========
const MONTH_YEAR_CACHE_SIZE = 512
const monthYearCache = new Map<number, { text: string; isYear: boolean }>()

/**
 * 格式化月份或年份用于显示
 * 当年为 1 月时显示年份，其他月份显示"X月"格式
 * @param timestamp - 时间戳（毫秒）
 * @returns 包含文本和是否为年份的标志
 *
 * @example
 * formatMonthOrYear(1704067200000) // { text: "2024", isYear: true }  (2024年1月)
 * formatMonthOrYear(1706745600000) // { text: "2月", isYear: false } (2024年2月)
 */
export function formatMonthOrYear(timestamp: number): { text: string; isYear: boolean } {
    // 缓存命中检查
    const cached = monthYearCache.get(timestamp)
    if (cached !== undefined) return cached

    const d = new Date(timestamp)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    // 当年 1 月：直接标注年份；其它月份：标注"X月"
    const result = month === 1 ? { text: String(year), isYear: true } : { text: `${month}月`, isYear: false }

    // 写入缓存，防膨胀
    if (monthYearCache.size >= MONTH_YEAR_CACHE_SIZE) monthYearCache.clear()
    monthYearCache.set(timestamp, result)

    return result
}

/**
 * 生成月份键值用于比较（YYYY-M 格式）
 * 注意：月份未补零，用于快速比较月份是否相同
 * @param timestamp - 时间戳（毫秒）
 * @returns 月份键值，例如 "2025-1"
 *
 * @example
 * monthKey(1736793600000) // "2025-1"
 */
/**
 * 生成月份键值用于比较
 * 返回数字 year * 12 + month，比字符串比较更快且无分配
 * 使用 new Date 保证本地时区正确（与显示一致）
 *
 * @example
 * monthKey(1736793600000) // 24301 (2025*12 + 0)
 */
function monthKey(timestamp: number): number {
    const d = new Date(timestamp)
    return d.getFullYear() * 12 + d.getMonth()
}

// ========== 便捷别名 ==========

/**
 * 格式化时间戳为日期/日期时间字符串，支持可配置时区
 * @param timestamp - 时间戳（毫秒）
 * @param options - 配置项
 * @param options.timeZone - 时区，默认 'Asia/Shanghai'
 * @param options.showTime - 是否显示时间，默认 false
 * @returns 格式化后的字符串，如 "2026-05-15" 或 "2026-05-15 09:35"
 */
export function formatTimestamp(
  timestamp: number,
  options?: { timeZone?: string; showTime?: boolean }
): string {
  const timeZone = options?.timeZone ?? 'Asia/Shanghai'
  const showTime = options?.showTime ?? false
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(showTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
  const parts = formatter.formatToParts(new Date(timestamp))
  let y = '', m = '', d = '', h = '', min = ''
  for (const p of parts) {
    if (p.type === 'year') y = p.value
    else if (p.type === 'month') m = p.value
    else if (p.type === 'day') d = p.value
    else if (p.type === 'hour') h = p.value
    else if (p.type === 'minute') min = p.value
  }
  return showTime ? `${y}-${m}-${d} ${h}:${min}` : `${y}-${m}-${d}`
}

/**
 * formatDateToYYYYMMDD 的别名，保持与历史代码的兼容性
 * timestamp 是"上海时区当天 00:00:00"映射到 UTC 的值；显示时强制按上海时区格式化
 * @param ts - 时间戳（毫秒）
 * @returns 格式化后的日期字符串，例如 "2025-01-14"
 */
const formatShanghaiDate = formatDateToYYYYMMDD

/**
 * formatDateToYYYYMMDD 的别名，用于十字线日期标签显示
 * 按上海时区格式化，避免不同时区出现日期偏移
 * @param ts - 时间戳（毫秒）
 * @returns 格式化后的日期字符串，例如 "2025-01-14"
 */
export const formatYMDShanghai = formatDateToYYYYMMDD

/**
 * 查找每个月份第一个K线的索引
 * @param data - K线数据数组（按时间升序排列）
 * @returns 月边界索引数组，例如 [0, 30, 60] 表示第0、30、60个K线分别是每月的第一个交易日
 * 
 * @example
 * // 假设数据：[1/2, 1/3, 2/1, 2/2, 3/1, 3/2]
 * findMonthBoundaries(data) // [0, 2, 4]
 * // 解释：第0个K线是1月第一个，第2个K线是2月第一个，第4个K线是3月第一个
 */
// findMonthBoundaries 缓存
let _cacheDataRef: Array<{ timestamp: number } | undefined> | null = null
let _cacheLen = 0
let _cacheFirstTs = 0
let _cacheLastTs = 0
let _cacheResult: number[] = []

/**
 * 查找每个月份第一个K线的索引
 * 结果按数据引用缓存，同一份数据多次调用直接返回缓存
 */
export function findMonthBoundaries(data: Array<{ timestamp: number } | undefined>): number[] {
    if (data.length === 0) return []

    // 缓存命中：同一引用 + 同长度 + 首尾时间戳不变
    if (_cacheDataRef === data && _cacheLen === data.length) {
        const firstTs = data[0]?.timestamp
        const lastTs = data[data.length - 1]?.timestamp
        if (firstTs === _cacheFirstTs && lastTs === _cacheLastTs) {
            return _cacheResult
        }
    }

    const boundaries: number[] = [0]
    let lastKey = monthKey(data[0]!.timestamp)

    for (let i = 1; i < data.length; i++) {
        const cur = data[i]
        if (!cur) continue
        const curKey = monthKey(cur.timestamp)
        if (curKey !== lastKey) {
            boundaries.push(i)
            lastKey = curKey
        }
    }

    _cacheDataRef = data
    _cacheLen = data.length
    _cacheFirstTs = data[0]?.timestamp ?? 0
    _cacheLastTs = data[data.length - 1]?.timestamp ?? 0
    _cacheResult = boundaries
    return boundaries
}

// ========== 日边界查找 + 日标签格式化 ==========

/**
 * 查找每天第一个K线的索引
 */
export function findDayBoundaries(data: Array<{ timestamp: number } | undefined>): number[] {
    if (data.length === 0) return []

    const boundaries: number[] = [0]
    let lastKey = dayKey(data[0]!.timestamp)

    for (let i = 1; i < data.length; i++) {
        const cur = data[i]
        if (!cur) continue
        const curKey = dayKey(cur.timestamp)
        if (curKey !== lastKey) {
            boundaries.push(i)
            lastKey = curKey
        }
    }

    return boundaries
}

function dayKey(timestamp: number): number {
    const d = new Date(timestamp)
    return d.getFullYear() * 366 + getDayOfYear(d)
}

/**
 * 格式化日期为 "MM-DD" 或年初显示 "YYYY-MM-DD"
 */
export function formatDay(timestamp: number): { text: string; isYear: boolean } {
    const d = new Date(timestamp)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const isYear = d.getMonth() === 0 && d.getDate() === 1
    if (isYear) {
        return { text: `${d.getFullYear()}-${month}-${day}`, isYear }
    }
    return { text: `${month}-${day}`, isYear }
}

// ========== 时分标签缓存 ==========
const TIME_LABEL_CACHE_SIZE = 256
const timeLabelCache = new Map<number, string>()

/**
 * 将时间戳格式化为 "HH:mm" 格式（上海时区）
 * 用于分时图底部时间轴标签显示
 */
export function formatTimeLabel(timestamp: number): string {
  const cached = timeLabelCache.get(timestamp)
  if (cached !== undefined) return cached

  const d = new Date(timestamp)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const result = `${hh}:${mm}`

  if (timeLabelCache.size >= TIME_LABEL_CACHE_SIZE) timeLabelCache.clear()
  timeLabelCache.set(timestamp, result)

  return result
}

// 兼容 getDayOfYear — fallback when not on Date prototype
function getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0)
    const diff = date.getTime() - start.getTime()
    return Math.floor(diff / 86400000)
}


