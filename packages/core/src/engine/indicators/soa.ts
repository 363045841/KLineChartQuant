import { KLineChartError } from '../../errors'
import type { KLineData } from '../../foundation/types/price'

/**
 * KLineData 的 SoA (Structure of Arrays) 布局
 * 用于零拷贝传输到 Web Worker
 *
 * 内存布局：
 * | timestamps | opens | highs | lows | closes | volumes | turnovers |
 * |   8*N      |  8*N  |  8*N  |  8*N |   8*N  |   8*N   |    8*N    |
 *
 * 其中 N 为数据长度，每列 8 字节（Float64）
 */
export interface KLineSoALayout {
  /** 底层缓冲区（SharedArrayBuffer 或 ArrayBuffer） */
  buffer: SharedArrayBuffer | ArrayBuffer
  /** 数据长度 */
  length: number
  /** 是否使用 SharedArrayBuffer */
  isShared: boolean
  /** 是否有成交量数据 */
  hasVolume: boolean
  /** 是否有成交额数据 */
  hasTurnover: boolean
  /** 时间戳数组（毫秒） */
  timestamps: Float64Array
  /** 开盘价数组 */
  opens: Float64Array
  /** 最高价数组 */
  highs: Float64Array
  /** 最低价数组 */
  lows: Float64Array
  /** 收盘价数组 */
  closes: Float64Array
  /** 成交量数组（无值时为 0） */
  volumes: Float64Array
  /** 成交额数组（无值时为 0） */
  turnovers: Float64Array
}

/** 列索引定义（用于计算 offset） */
const enum ColumnIndex {
  TIMESTAMP = 0,
  OPEN = 1,
  HIGH = 2,
  LOW = 3,
  CLOSE = 4,
  VOLUME = 5,
  TURNOVER = 6,
  COUNT = 7,
}

/** 每列的字节数 */
const BYTES_PER_COLUMN = 8 // Float64

/**
 * SharedKLineBuffer - K线数据的 SoA 管理类
 *
 * 提供 AoS (KLineData[]) 与 SoA 布局之间的转换，
 * 支持 SharedArrayBuffer（零拷贝）和 ArrayBuffer（降级）
 */
export class SharedKLineBuffer {
  /**
   * 检测 SharedArrayBuffer 是否可用
   * 需要页面有 COOP/COEP 头支持
   */
  static detectSupport(): boolean {
    try {
      if (typeof SharedArrayBuffer === 'undefined') {
        return false
      }
      // 尝试创建并检测能否成功创建视图
      const testSab = new SharedArrayBuffer(8)
      const testView = new Float64Array(testSab)
      testView[0] = 1.0
      return testView[0] === 1.0
    } catch {
      return false
    }
  }

  /**
   * 计算 SoA 布局所需的总字节数
   */
  static calculateByteLength(length: number): number {
    return length * BYTES_PER_COLUMN * ColumnIndex.COUNT
  }

  /**
   * 将 KLineData[] 转换为 SoA 布局
   * @param data K线数据数组（AoS 格式）
   * @param preferShared 是否优先使用 SharedArrayBuffer（默认 true）
   * @returns SoA 布局对象
   */
  static fromKLineData(data: KLineData[], preferShared: boolean = true): KLineSoALayout {
    const length = data.length
    const byteLength = SharedKLineBuffer.calculateByteLength(length)
    const useShared = preferShared && SharedKLineBuffer.detectSupport()

    // 检测是否有 volume 和 turnover 数据
    let hasVolume = false
    let hasTurnover = false
    for (const item of data) {
      if (item.volume !== undefined && item.volume !== 0) {
        hasVolume = true
      }
      if (item.turnover !== undefined && item.turnover !== 0) {
        hasTurnover = true
      }
      if (hasVolume && hasTurnover) break
    }

    // 创建缓冲区
    const buffer = useShared ? new SharedArrayBuffer(byteLength) : new ArrayBuffer(byteLength)

    // 创建列视图
    const timestamps = new Float64Array(
      buffer,
      length * BYTES_PER_COLUMN * ColumnIndex.TIMESTAMP,
      length,
    )
    const opens = new Float64Array(buffer, length * BYTES_PER_COLUMN * ColumnIndex.OPEN, length)
    const highs = new Float64Array(buffer, length * BYTES_PER_COLUMN * ColumnIndex.HIGH, length)
    const lows = new Float64Array(buffer, length * BYTES_PER_COLUMN * ColumnIndex.LOW, length)
    const closes = new Float64Array(buffer, length * BYTES_PER_COLUMN * ColumnIndex.CLOSE, length)
    const volumes = new Float64Array(buffer, length * BYTES_PER_COLUMN * ColumnIndex.VOLUME, length)
    const turnovers = new Float64Array(
      buffer,
      length * BYTES_PER_COLUMN * ColumnIndex.TURNOVER,
      length,
    )

    // 填充数据
    for (let i = 0; i < length; i++) {
      const item = data[i]!
      timestamps[i] = item.timestamp
      opens[i] = item.open
      highs[i] = item.high
      lows[i] = item.low
      closes[i] = item.close
      volumes[i] = item.volume ?? 0
      turnovers[i] = item.turnover ?? 0
    }

    return {
      buffer,
      length,
      isShared: useShared,
      hasVolume,
      hasTurnover,
      timestamps,
      opens,
      highs,
      lows,
      closes,
      volumes,
      turnovers,
    }
  }

  /**
   * 更新现有 SoA 布局的数据（尽可能复用缓冲区）
   * 如果新数据长度超过原缓冲区，会创建新缓冲区
   *
   * @param layout 现有 SoA 布局
   * @param data 新的 K线数据
   * @returns 更新后的 SoA 布局（可能是新对象）
   */
  static updateExisting(layout: KLineSoALayout, data: KLineData[]): KLineSoALayout {
    const newLength = data.length
    const oldLength = layout.length

    // 如果长度变化或缓冲区类型不匹配，创建新布局
    if (newLength !== oldLength) {
      return SharedKLineBuffer.fromKLineData(data, layout.isShared)
    }

    // 检测是否有 volume 和 turnover 数据
    let hasVolume = false
    let hasTurnover = false
    for (const item of data) {
      if (item.volume !== undefined && item.volume !== 0) {
        hasVolume = true
      }
      if (item.turnover !== undefined && item.turnover !== 0) {
        hasTurnover = true
      }
      if (hasVolume && hasTurnover) break
    }

    // 复用现有视图，直接更新数据
    const { timestamps, opens, highs, lows, closes, volumes, turnovers } = layout

    for (let i = 0; i < newLength; i++) {
      const item = data[i]!
      timestamps[i] = item.timestamp
      opens[i] = item.open
      highs[i] = item.high
      lows[i] = item.low
      closes[i] = item.close
      volumes[i] = item.volume ?? 0
      turnovers[i] = item.turnover ?? 0
    }

    return {
      ...layout,
      hasVolume,
      hasTurnover,
    }
  }

  /**
   * 将 SoA 布局转换回 KLineData[]（用于测试和兼容性）
   * @param layout SoA 布局
   * @returns K线数据数组
   */
  static toKLineData(layout: KLineSoALayout): KLineData[] {
    const result: KLineData[] = new Array(layout.length)
    const { timestamps, opens, highs, lows, closes, volumes, turnovers, hasVolume, hasTurnover } =
      layout

    for (let i = 0; i < layout.length; i++) {
      const item: KLineData = {
        timestamp: timestamps[i]!,
        open: opens[i]!,
        high: highs[i]!,
        low: lows[i]!,
        close: closes[i]!,
      }

      if (hasVolume) {
        const vol = volumes[i]!
        if (vol !== 0) item.volume = vol
      }
      if (hasTurnover) {
        const to = turnovers[i]!
        if (to !== 0) item.turnover = to
      }

      result[i] = item
    }

    return result
  }

  /**
   * 创建子视图（用于 Worker 中处理部分数据范围）
   * @param layout 原 SoA 布局
   * @param start 起始索引（包含）
   * @param end 结束索引（不包含）
   * @returns 子视图对象（共享同一缓冲区）
   */
  static createSubview(layout: KLineSoALayout, start: number, end: number): KLineSoALayout {
    if (start < 0) start = 0
    if (end > layout.length) end = layout.length
    if (start >= end) {
      throw new KLineChartError(
        'INDICATOR_INVALID_PARAM',
        `Invalid subview range: [${start}, ${end})`,
      )
    }

    const length = end - start
    // 每列的总字节数 = 数据长度 * 每元素字节数
    const columnByteLength = layout.length * BYTES_PER_COLUMN

    return {
      buffer: layout.buffer,
      length,
      isShared: layout.isShared,
      hasVolume: layout.hasVolume,
      hasTurnover: layout.hasTurnover,
      timestamps: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.TIMESTAMP,
        length,
      ),
      opens: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.OPEN,
        length,
      ),
      highs: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.HIGH,
        length,
      ),
      lows: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.LOW,
        length,
      ),
      closes: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.CLOSE,
        length,
      ),
      volumes: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.VOLUME,
        length,
      ),
      turnovers: new Float64Array(
        layout.buffer,
        start * BYTES_PER_COLUMN + columnByteLength * ColumnIndex.TURNOVER,
        length,
      ),
    }
  }

  /**
   * 获取缓冲区信息（用于调试和序列化）
   */
  static getBufferInfo(layout: KLineSoALayout): {
    byteLength: number
    isShared: boolean
    length: number
    columns: string[]
  } {
    return {
      byteLength: layout.buffer.byteLength,
      isShared: layout.isShared,
      length: layout.length,
      columns: ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'turnover'],
    }
  }
}

/**
 * 获取 SoA 布局中 closes 列的视图（最常用列）
 * 用于指标计算中快速访问收盘价
 */
export function getClosesView(layout: KLineSoALayout): Float64Array {
  return layout.closes
}

/**
 * 获取 SoA 布局中 highs/lows 列的视图
 * 用于需要高低价的指标（如 BOLL、STOCH、WMSR）
 */
export function getHighsLowsViews(layout: KLineSoALayout): {
  highs: Float64Array
  lows: Float64Array
} {
  return { highs: layout.highs, lows: layout.lows }
}

/**
 * 获取 SoA 布局中 OHLC 四价视图
 */
export function getOHLCViews(layout: KLineSoALayout): {
  opens: Float64Array
  highs: Float64Array
  lows: Float64Array
  closes: Float64Array
} {
  return {
    opens: layout.opens,
    highs: layout.highs,
    lows: layout.lows,
    closes: layout.closes,
  }
}
