/**
 * 内置技术分析库：与用户库共用 defineLibrary 协议，供脚本通过 ta.* 调用。
 *
 * 公开接口由 TechnicalAnalysisLibrary 约束，实现与编辑器契约在编译期保持一致。
 * 历史取数统一走 Series.at()，它是契约中为严格索引检查准备的动态访问入口。
 *
 * 所有派生序列都经 __deriveOnce 按「输入序列 + 算法 + 参数」缓存：脚本在 onBar 里逐 bar
 * 重新调用 ta.* 时复用同一实例，memo 跨 bar 保留，整体保持线性复杂度。
 */

/** 窗口类算法：在完整窗口内按固定顺序聚合，窗口不足时结果为 NaN。 */
type WindowKind = 'sma' | 'sum' | 'highest' | 'lowest'

/** 窗口类算法的缓存包装，key 区分算法与输入序列。 */
function __windowSeries(source: Series, length: number, kind: WindowKind): Series {
  return __deriveOnce(`window:${kind}:${__seriesId(source)}:${length}`, (_self, offset) =>
    __windowValue(source, length, kind, offset),
  )
}

/** 间距类算法：只比较当前值与 length 根之前的值，不要求完整窗口。 */
function __differenceSeries(
  kind: 'mom' | 'roc',
  source: Series,
  length: number,
  compute: (current: number, previous: number) => number,
): Series {
  return __deriveOnce(`${kind}:${__seriesId(source)}:${length}`, (_self, offset) =>
    compute(source.at(offset), source.at(offset + length)),
  )
}

defineLibrary('ta', {
  /** 简单移动平均序列，完整窗口之前为 NaN。 */
  sma(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'sma')
  },

  /** 窗口求和序列，完整窗口之前为 NaN。 */
  sum(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'sum')
  },

  /** 窗口最高值序列。 */
  highest(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'highest')
  },

  /** 窗口最低值序列。 */
  lowest(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'lowest')
  },

  /** 总体标准差序列（除以 length），完整窗口之前为 NaN。 */
  stddev(source: Series, length: number): Series {
    __checkLength(length)
    return __deriveOnce(`stddev:${__seriesId(source)}:${length}`, (_self, offset) => {
      if (offset + length > __count()) return Number.NaN
      let total = 0
      for (let step = 0; step < length; step++) total += source.at(offset + step)
      const mean = total / length
      let variance = 0
      for (let step = 0; step < length; step++) {
        const deviation = source.at(offset + step) - mean
        variance += deviation * deviation
      }
      return Math.sqrt(variance / length)
    })
  },

  /** 指数移动平均序列，以首个完整窗口 SMA 初始化。 */
  ema(source: Series, length: number): Series {
    __checkLength(length)
    return __deriveOnce(`ema:${__seriesId(source)}:${length}`, (self, offset) => {
      if (offset + length > __count()) return Number.NaN
      // 没有上一根的完整值时，用当前窗口 SMA 初始化。
      if (offset + 1 + length > __count()) return __windowValue(source, length, 'sma', offset)
      const previous = self.at(offset + 1)
      return Number.isNaN(previous)
        ? __windowValue(source, length, 'sma', offset)
        : previous + (2 / (length + 1)) * (source.at(offset) - previous)
    })
  },

  /** 加权移动平均序列，窗口内越新的值权重越大，完整窗口之前为 NaN。 */
  wma(source: Series, length: number): Series {
    __checkLength(length)
    return __deriveOnce(`wma:${__seriesId(source)}:${length}`, (_self, offset) => {
      if (offset + length > __count()) return Number.NaN
      let weighted = 0
      let weightSum = 0
      for (let step = 0; step < length; step++) {
        // step 越小越新，权重从 length 递减到 1，与 native 的 1..length 一致。
        const weight = length - step
        weighted += weight * source.at(offset + step)
        weightSum += weight
      }
      return weighted / weightSum
    })
  },

  /** 成交量加权移动平均序列，Σ(source×volume)/Σ(volume)；完整窗口之前或窗口成交量之和为 0 时为 NaN。 */
  vwma(source: Series, volume: Series, length: number): Series {
    __checkLength(length)
    return __deriveOnce(
      `vwma:${__seriesId(source)}:${__seriesId(volume)}:${length}`,
      (_self, offset) => {
        if (offset + length > __count()) return Number.NaN
        let priceVolume = 0
        let volumeSum = 0
        for (let step = 0; step < length; step++) {
          const barVolume = volume.at(offset + step)
          priceVolume += source.at(offset + step) * barVolume
          volumeSum += barVolume
        }
        return volumeSum > 0 ? priceVolume / volumeSum : Number.NaN
      },
    )
  },

  /** Wilder RSI 序列，窗口内无下跌（含平盘）为 100。 */
  rsi(source: Series, length: number): Series {
    __checkLength(length)
    const id = __seriesId(source)
    // Wilder RSI 需要 length+1 个价格；前 length 个变化做 SMA 初始化，之后按平滑系数递推。
    const gain = __deriveOnce(`rsi-gain:${id}:${length}`, (self, offset) => {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = self.at(offset + 1)
        if (!Number.isNaN(previous)) {
          const change = source.at(offset) - source.at(offset + 1)
          return (previous * (length - 1) + Math.max(change, 0)) / length
        }
      }
      let total = 0
      for (let step = 0; step < length; step++) {
        total += Math.max(source.at(offset + step) - source.at(offset + step + 1), 0)
      }
      return total / length
    })
    const loss = __deriveOnce(`rsi-loss:${id}:${length}`, (self, offset) => {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = self.at(offset + 1)
        if (!Number.isNaN(previous)) {
          const change = source.at(offset + 1) - source.at(offset)
          return (previous * (length - 1) + Math.max(change, 0)) / length
        }
      }
      let total = 0
      for (let step = 0; step < length; step++) {
        total += Math.max(source.at(offset + step + 1) - source.at(offset + step), 0)
      }
      return total / length
    })
    return __deriveOnce(`rsi:${id}:${length}`, (_self, offset) => {
      const up = gain.at(offset)
      const down = loss.at(offset)
      if (Number.isNaN(up) || Number.isNaN(down)) return Number.NaN
      return down === 0 ? 100 : 100 - 100 / (1 + up / down)
    })
  },

  /** 动量 MOM：当前值减去 length 根之前的值；历史不足或任一端为 NaN 时为 NaN。 */
  mom(source: Series, length: number = 1): Series {
    __checkLength(length)
    return __differenceSeries('mom', source, length, (current, previous) => current - previous)
  },

  /** 当前值相对 length 根之前的百分比变化；历史不足、任一端为 NaN 或基准为 0 时为 NaN。 */
  roc(source: Series, length: number = 1): Series {
    __checkLength(length)
    return __differenceSeries('roc', source, length, (current, previous) =>
      Number.isNaN(previous) || previous === 0
        ? Number.NaN
        : ((current - previous) / previous) * 100,
    )
  },

  /** 当前是否发生上穿：左序列刚从下方穿到上方。 */
  crossover(left: Series, right: Series): boolean {
    return left[0] > right[0] && left[1] <= right[1]
  },

  /** 当前是否发生下穿：左序列刚从上方穿到下方。 */
  crossunder(left: Series, right: Series): boolean {
    return left[0] < right[0] && left[1] >= right[1]
  },
} satisfies TechnicalAnalysisLibrary)
