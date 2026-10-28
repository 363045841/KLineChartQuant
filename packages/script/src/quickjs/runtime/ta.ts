/**
 * 内置技术分析库：与用户库共用 defineLibrary 协议，供脚本通过 ta.* 调用。
 *
 * 公开接口由 TechnicalAnalysisLibrary 约束，实现与编辑器契约在编译期保持一致。
 * 历史取数统一走 Series.at()，它是契约中为严格索引检查准备的动态访问入口。
 *
 * 所有派生序列都经 __deriveOnce 按「输入序列 + 算法 + 参数」缓存：脚本在 onBar 里逐 bar
 * 重新调用 ta.* 时复用同一实例；窗口算法使用增量累计器，整体为摊销线性复杂度。
 */

/** 窗口类算法：完整窗口前为 NaN，之后增量维护聚合状态。 */
type WindowKind = 'sma' | 'sum' | 'highest' | 'lowest' | 'highestbars' | 'lowestbars'

/** 窗口类算法的缓存包装，key 区分算法与输入序列。 */
function __windowSeries(source: Series, length: number, kind: WindowKind): Series {
  return __rollingSeries(`window:${kind}:${__seriesId(source)}:${length}`, source, length, () => {
    if (kind === 'highestbars' || kind === 'lowestbars')
      return __extremeWindow(length, kind === 'highestbars', true)
    if (kind === 'highest' || kind === 'lowest') return __extremeWindow(length, kind === 'highest')
    return __sumWindow(kind === 'sma' ? length : 1)
  })
}

/**
 * 窗口内的最大子段和（Kadane）：按时间顺序扫描，累计值转负时从当前根重新开始。
 * @param source 有符号数据序列
 * @param length 窗口长度，包含当前根
 * @param offset 相对当前根的偏移，0 表示当前根
 * @returns [子段和, 起点偏移, 终点偏移]；偏移为负且起点更早，窗口不足或含 NaN 时三者均为 NaN
 */
function __maxsumAt(
  source: Series,
  length: number,
  offset: number,
): readonly [number, number, number] {
  if (offset + length > __count()) return [Number.NaN, Number.NaN, Number.NaN]
  const oldest = offset + length - 1
  let best = -Infinity
  let bestStart = oldest
  let bestEnd = oldest
  let running = 0
  let runningStart = oldest
  for (let step = oldest; step >= offset; step--) {
    const value = source.at(step)
    if (Number.isNaN(value)) return [Number.NaN, Number.NaN, Number.NaN]
    // 以 step 结尾的最优段：延续已有累计值，或从本根重新开始。
    if (running <= 0) {
      running = value
      runningStart = step
    } else {
      running += value
    }
    if (running > best) {
      best = running
      bestStart = runningStart
      bestEnd = step
    }
  }
  return [best, offset - bestStart, offset - bestEnd]
}

/** 最大子段和的单个输出分量；三个分量各自缓存，共享同一份扫描实现。 */
function __maxsumSeries(source: Series, length: number, part: 0 | 1 | 2): Series {
  return __deriveOnce(`maxsum:${part}:${__seriesId(source)}:${length}`, (_self, offset) =>
    __maxsumAt(source, length, offset)[part],
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

/** 方向判断比较当前值与历史窗口，不要求历史值逐根单调。 */
function __direction(source: Series, length: number, rising: boolean): boolean {
  const current = source.at(0)
  if (Number.isNaN(current)) return false
  let found = false
  const available = Math.min(length, __count() - 1)
  for (let offset = 1; offset <= available; offset++) {
    const previous = source.at(offset)
    if (Number.isNaN(previous)) continue
    found = true
    if (rising ? current <= previous : current >= previous) return false
  }
  return found
}

/** ATR 的共享序列，真实波幅在首根使用 high-low，完整窗口以均值初始化。 */
function __atrSeries(length: number): Series {
  const range = __deriveOnce('true-range', (_self, offset) => {
    const highValue = high.at(offset)
    const lowValue = low.at(offset)
    if (offset + 1 >= __count()) return highValue - lowValue
    const previousClose = close.at(offset + 1)
    return Math.max(
      highValue - lowValue,
      Math.abs(highValue - previousClose),
      Math.abs(lowValue - previousClose),
    )
  })
  return __deriveOnce(`atr:${length}`, (self, offset) => {
    if (offset + length > __count()) return Number.NaN
    if (offset + length === __count()) return __windowSeries(range, length, 'sma').at(offset)
    return (self.at(offset + 1) * (length - 1) + range.at(offset)) / length
  })
}

/** EMA 的共享递推；window 保持完整窗口均值初始化，first 用于旧 MACD 的首值初始化。 */
function __emaSeries(source: Series, length: number, seed: 'window' | 'first'): Series {
  return __deriveOnce(`ema:${seed}:${__seriesId(source)}:${length}`, (self, offset) => {
    if (seed === 'first') {
      if (offset >= __count()) return Number.NaN
      const current = source.at(offset)
      if (Number.isNaN(current)) return Number.NaN
      const previous = self.at(offset + 1)
      const weight = 2 / (length + 1)
      return Number.isNaN(previous) ? current : current * weight + previous * (1 - weight)
    }
    if (offset + length > __count()) return Number.NaN
    if (offset + 1 + length > __count()) return __windowSeries(source, length, 'sma').at(offset)
    const previous = self.at(offset + 1)
    return Number.isNaN(previous)
      ? __windowSeries(source, length, 'sma').at(offset)
      : previous + (2 / (length + 1)) * (source.at(offset) - previous)
  })
}

/** Wilder 平滑均线：完整窗口 SMA 初始化，之后按 alpha = 1 / length 递推。 */
function __rmaSeries(source: Series, length: number): Series {
  return __deriveOnce(`rma:${__seriesId(source)}:${length}`, (self, offset) => {
    if (offset + length > __count()) return Number.NaN
    if (offset + length === __count()) return __windowSeries(source, length, 'sma').at(offset)
    const previous = self.at(offset + 1)
    if (Number.isNaN(previous)) return __windowSeries(source, length, 'sma').at(offset)
    return previous + (source.at(offset) - previous) / length
  })
}

/** ALMA：高斯权重中心由 offset 决定，floor 为 true 时对中心取下整。 */
function __almaSeries(
  source: Series,
  length: number,
  offset: number,
  sigma: number,
  floor: boolean,
): Series {
  const center = floor ? Math.floor(offset * (length - 1)) : offset * (length - 1)
  const spread = length / sigma
  const denominator = 2 * spread * spread
  return __deriveOnce(
    `alma:${__seriesId(source)}:${length}:${offset}:${sigma}:${floor}`,
    (_self, barOffset) => {
      if (barOffset + length > __count()) return Number.NaN
      let sum = 0
      let norm = 0
      for (let step = 0; step < length; step++) {
        const weight = Math.exp(-((step - center) * (step - center)) / denominator)
        // 权重从窗口最旧一根递增到当前根，与 Pine 的 series[length - i - 1] 对齐。
        sum += source.at(barOffset + length - 1 - step) * weight
        norm += weight
      }
      return sum / norm
    },
  )
}

/**
 * Wilder 平滑序列：首个完整窗口取简单平均初始化，之后按 (prev*(length-1)+change)/length 递推。
 * @param key 派生缓存键
 * @param source 变化来源序列
 * @param length 平滑周期
 * @param direction 1 取上涨增益，-1 取下跌损失
 * @returns 平滑后的序列，完整窗口之前为 NaN
 */
function __wilderSmoothing(key: string, source: Series, length: number, direction: 1 | -1): Series {
  /** 单根 bar 的带符号变化；direction 决定计入增益还是损失。 */
  const change = (offset: number): number => direction * (source.at(offset) - source.at(offset + 1))
  return __deriveOnce(key, (self, offset) => {
    if (offset + length + 1 > __count()) return Number.NaN
    if (offset + length + 2 <= __count()) {
      const previous = self.at(offset + 1)
      if (!Number.isNaN(previous))
        return (previous * (length - 1) + Math.max(change(offset), 0)) / length
    }
    let total = 0
    for (let step = 0; step < length; step++) total += Math.max(change(offset + step), 0)
    return total / length
  })
}

defineLibrary('ta', {
  /** 右侧窗口完成后才确认高点，不读取未来数据。 */
  pivothigh(source: Series, leftbars: number, rightbars: number): Series {
    return __pivotSeries(source, leftbars, rightbars, true)
  },
  /** 与高点共用极值和并列处理规则。 */
  pivotlow(source: Series, leftbars: number, rightbars: number): Series {
    return __pivotSeries(source, leftbars, rightbars, false)
  },
  /** MACD 按输入与周期组合缓存，柱体返回未翻倍的 DIF-DEA，绘图倍率由脚本决定。 */
  macd(
    source: Series,
    fastLength: number,
    slowLength: number,
    signalLength: number,
  ): readonly [Series, Series, Series] {
    __checkLength(fastLength)
    __checkLength(slowLength)
    __checkLength(signalLength)
    const fast = __emaSeries(source, fastLength, 'first')
    const slow = __emaSeries(source, slowLength, 'first')
    const difference = __deriveOnce(
      `macd:${__seriesId(source)}:${fastLength}:${slowLength}`,
      (_self, offset) => fast.at(offset) - slow.at(offset),
    )
    const signal = __emaSeries(difference, signalLength, 'first')
    const histogram = __deriveOnce(
      `macd-histogram:${__seriesId(difference)}:${signalLength}`,
      (_self, offset) => difference.at(offset) - signal.at(offset),
    )
    return [difference, signal, histogram]
  },
  /** Wilder ATR，序列实例按周期缓存，与 Supertrend 共用同一计算。 */
  atr(length: number): Series {
    __checkLength(length)
    return __atrSeries(length)
  },

  /** Supertrend 的通道、方向与趋势值分别缓存，首个有效方向沿用旧指标的上涨方向。 */
  supertrend(multiplier: number, atrPeriod: number): readonly [Series, Series] {
    __checkLength(atrPeriod)
    if (!Number.isFinite(multiplier) || multiplier <= 0)
      throw new RangeError('Supertrend multiplier 必须是有限正数')
    const atr = __atrSeries(atrPeriod)
    const key = `supertrend:${atrPeriod}:${multiplier}`
    const upper = __deriveOnce(`${key}:upper`, (self, offset) => {
      const basic = (high.at(offset) + low.at(offset)) / 2 + multiplier * atr.at(offset)
      if (Number.isNaN(basic)) return Number.NaN
      const previous = self.at(offset + 1)
      return Number.isNaN(previous) || basic < previous || close.at(offset + 1) > previous
        ? basic
        : previous
    })
    const lower = __deriveOnce(`${key}:lower`, (self, offset) => {
      const basic = (high.at(offset) + low.at(offset)) / 2 - multiplier * atr.at(offset)
      if (Number.isNaN(basic)) return Number.NaN
      const previous = self.at(offset + 1)
      return Number.isNaN(previous) || basic > previous || close.at(offset + 1) < previous
        ? basic
        : previous
    })
    const direction = __deriveOnce(`${key}:direction`, (self, offset) => {
      if (Number.isNaN(atr.at(offset))) return Number.NaN
      // 每根都推进双侧通道，长时间单向趋势后反转也不需要递归补算另一侧历史。
      const upperValue = upper.at(offset)
      const lowerValue = lower.at(offset)
      const previous = self.at(offset + 1)
      const up = Number.isNaN(previous) || previous < 0
      const price = close.at(offset)
      return up ? (price < lowerValue ? 1 : -1) : price > upperValue ? -1 : 1
    })
    const trend = __deriveOnce(`${key}:trend`, (_self, offset) => {
      const sign = direction.at(offset)
      return Number.isNaN(sign) ? Number.NaN : sign < 0 ? lower.at(offset) : upper.at(offset)
    })
    return [trend, direction]
  },

  /** 当前值严格高于前 length 根中的有效值；忽略历史 NaN。 */
  rising(source: Series, length: number): boolean {
    __checkLength(length)
    return __direction(source, length, true)
  },

  /** 当前值严格低于前 length 根中的有效值；忽略历史 NaN。 */
  falling(source: Series, length: number): boolean {
    __checkLength(length)
    return __direction(source, length, false)
  },

  /** 当前值减去 length 根之前的值，默认比较上一根。 */
  change(source: Series, length: number = 1): Series {
    __checkLength(length)
    return __differenceSeries('mom', source, length, (current, previous) => current - previous)
  },

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

  /** 窗口内累计值最大的连续区间；返回 [子段和, 起点偏移, 终点偏移]，偏移为负。 */
  maxsum(source: Series, length: number): readonly [Series, Series, Series] {
    __checkLength(length)
    return [
      __maxsumSeries(source, length, 0),
      __maxsumSeries(source, length, 1),
      __maxsumSeries(source, length, 2),
    ]
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

  /** 最高值相对当前 K 线的负偏移；并列最高取更早一根，完整窗口之前为 NaN。 */
  highestbars(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'highestbars')
  },

  /** 最低值相对当前 K 线的负偏移；并列最低取更早一根，完整窗口之前为 NaN。 */
  lowestbars(source: Series, length: number): Series {
    __checkLength(length)
    return __windowSeries(source, length, 'lowestbars')
  },

  /** Wilder 平滑均线序列，以首个完整窗口 SMA 初始化。 */
  rma(source: Series, length: number): Series {
    __checkLength(length)
    return __rmaSeries(source, length)
  },

  /** 固定 4 根窗口的对称加权均线，权重由旧到新为 1/6、2/6、2/6、1/6。 */
  swma(source: Series): Series {
    return __deriveOnce(`swma:${__seriesId(source)}`, (_self, offset) => {
      if (offset + 4 > __count()) return Number.NaN
      return (
        (source.at(offset + 3) +
          2 * source.at(offset + 2) +
          2 * source.at(offset + 1) +
          source.at(offset)) /
        6
      )
    })
  },

  /** Arnaud Legoux 均线序列，完整窗口之前为 NaN。 */
  alma(
    source: Series,
    length: number,
    offset: number = 0.85,
    sigma: number = 6,
    floor: boolean = false,
  ): Series {
    __checkLength(length)
    if (!Number.isFinite(offset) || offset < 0 || offset > 1)
      throw new RangeError('ALMA offset 必须在 0 到 1 之间')
    if (!Number.isFinite(sigma) || sigma <= 0) throw new RangeError('ALMA sigma 必须是有限正数')
    return __almaSeries(source, length, offset, sigma, floor)
  },

  /** 总体标准差序列（除以 length），完整窗口之前为 NaN。 */
  stddev(source: Series, length: number): Series {
    __checkLength(length)
    return __rollingSeries(`stddev:${__seriesId(source)}:${length}`, source, length, () =>
      __deviationWindow(length),
    )
  },

  /** 指数移动平均序列，以首个完整窗口 SMA 初始化。 */
  ema(source: Series, length: number): Series {
    __checkLength(length)
    return __emaSeries(source, length, 'window')
  },

  /** 双重指数均线，两个 EMA 都使用完整有效窗口初始化。 */
  dema(source: Series, length: number): Series {
    __checkLength(length)
    const first = __emaSeries(source, length, 'window')
    const second = __emaSeries(first, length, 'window')
    return __deriveOnce(
      `dema:${__seriesId(source)}:${length}`,
      (_self, offset) => 2 * first.at(offset) - second.at(offset),
    )
  },

  /** 三重指数均线，抵消 EMA 的一阶与二阶滞后。 */
  tema(source: Series, length: number): Series {
    __checkLength(length)
    const first = __emaSeries(source, length, 'window')
    const second = __emaSeries(first, length, 'window')
    const third = __emaSeries(second, length, 'window')
    return __deriveOnce(
      `tema:${__seriesId(source)}:${length}`,
      (_self, offset) => 3 * first.at(offset) - 3 * second.at(offset) + third.at(offset),
    )
  },

  /** Tillson T3：六层 EMA 的加权组合，因子只影响组合，不复制 EMA 缓存。 */
  t3(source: Series, length: number, volumeFactor: number = 0.7): Series {
    __checkLength(length)
    if (!Number.isFinite(volumeFactor) || volumeFactor < 0 || volumeFactor > 1)
      throw new RangeError('T3 volumeFactor 必须在 0 到 1 之间')
    const first = __emaSeries(source, length, 'window')
    const second = __emaSeries(first, length, 'window')
    const third = __emaSeries(second, length, 'window')
    const fourth = __emaSeries(third, length, 'window')
    const fifth = __emaSeries(fourth, length, 'window')
    const sixth = __emaSeries(fifth, length, 'window')
    const factor = volumeFactor
    const square = factor * factor
    const cube = square * factor
    return __deriveOnce(
      `t3:${__seriesId(source)}:${length}:${factor}`,
      (_self, offset) =>
        -cube * sixth.at(offset) +
        (3 * square + 3 * cube) * fifth.at(offset) +
        (-6 * square - 3 * factor - 3 * cube) * fourth.at(offset) +
        (1 + 3 * factor + 3 * square + cube) * third.at(offset),
    )
  },

  /** 三角均线：奇数周期采用相同双窗口，偶数周期第二窗口比第一窗口长一根。 */
  trima(source: Series, length: number): Series {
    __checkLength(length)
    const first = __windowSeries(source, Math.ceil(length / 2), 'sma')
    return __windowSeries(first, Math.floor(length / 2) + 1, 'sma')
  },

  /** 加权移动平均序列，窗口内越新的值权重越大，完整窗口之前为 NaN。 */
  wma(source: Series, length: number): Series {
    __checkLength(length)
    return __rollingSeries(`wma:${__seriesId(source)}:${length}`, source, length, () =>
      __weightedWindow(length),
    )
  },

  /** HMA 组合已有 WMA 累计器，中间价差按输入与周期缓存。 */
  hma(source: Series, length: number): Series {
    __checkLength(length)
    const weighted = (period: number) =>
      __rollingSeries(`wma:${__seriesId(source)}:${period}`, source, period, () =>
        __weightedWindow(period),
      )
    const half = weighted(Math.max(1, Math.floor(length / 2)))
    const full = weighted(length)
    const difference = __deriveOnce(
      `hma-difference:${__seriesId(source)}:${length}`,
      (_self, offset) => 2 * half.at(offset) - full.at(offset),
    )
    const root = Math.max(1, Math.round(Math.sqrt(length)))
    return __rollingSeries(`wma:${__seriesId(difference)}:${root}`, difference, root, () =>
      __weightedWindow(root),
    )
  },

  /** 最小二乘回归曲线；offset 为相对当前根向前的根数。 */
  linreg(source: Series, length: number, offset: number = 0): Series {
    __checkLength(length)
    if (!Number.isSafeInteger(offset)) throw new RangeError('LINREG offset 必须是整数')
    return __deriveOnce(`linreg:${__seriesId(source)}:${length}:${offset}`, (_self, barOffset) => {
      if (barOffset + length > __count()) return Number.NaN
      if (length === 1) return source.at(barOffset)
      const center = (length - 1) / 2
      let mean = 0
      for (let step = 0; step < length; step++) mean += source.at(barOffset + length - 1 - step)
      mean /= length
      let numerator = 0
      let denominator = 0
      for (let x = 0; x < length; x++) {
        const dx = x - center
        numerator += dx * (source.at(barOffset + length - 1 - x) - mean)
        denominator += dx * dx
      }
      return mean + (numerator / denominator) * (length - 1 - offset - center)
    })
  },

  /** CCI 的偏差相对于当前窗口均值，不能用各历史 bar 的均值代替；平盘（偏差为零）输出 0。 */
  cci(source: Series, length: number): Series {
    __checkLength(length)
    const average = __windowSeries(source, length, 'sma')
    return __deriveOnce(`cci:${__seriesId(source)}:${length}`, (_self, offset) => {
      const mean = average.at(offset)
      if (Number.isNaN(mean)) return Number.NaN
      let deviation = 0
      for (let step = 0; step < length; step++)
        deviation += Math.abs(source.at(offset + step) - mean)
      return deviation === 0 ? 0 : (source.at(offset) - mean) / ((0.015 * deviation) / length)
    })
  },

  /** 成交量加权移动平均序列，窗口成交量之和为零时为 NaN。 */
  vwma(source: Series, volume: Series, length: number): Series {
    __checkLength(length)
    const key = `vwma:${__seriesId(source)}:${__seriesId(volume)}`
    const product = __deriveOnce(
      `${key}:product`,
      (_self, offset) => source.at(offset) * volume.at(offset),
    )
    const priceVolume = __windowSeries(product, length, 'sum')
    const volumes = __windowSeries(volume, length, 'sum')
    return __deriveOnce(`${key}:${length}`, (_self, offset) => {
      const total = volumes.at(offset)
      return total > 0 ? priceVolume.at(offset) / total : Number.NaN
    })
  },

  /**
   * Wilder RSI 序列，窗口内无下跌（含平盘）为 100。
   */
  rsi(source: Series, length: number): Series {
    __checkLength(length)
    const id = __seriesId(source)
    // Wilder RSI 需要 length+1 个价格；前 length 个变化做 SMA 初始化，之后按平滑系数递推。
    const gain = __wilderSmoothing(`rsi-gain:${id}:${length}`, source, length, 1)
    const loss = __wilderSmoothing(`rsi-loss:${id}:${length}`, source, length, -1)
    return __deriveOnce(`rsi:${id}:${length}`, (_self, offset) => {
      const up = gain.at(offset)
      const down = loss.at(offset)
      if (Number.isNaN(up) || Number.isNaN(down)) return Number.NaN
      return down === 0 ? 100 : 100 - 100 / (1 + up / down)
    })
  },

  /** 随机指标：100 × (source − 窗口最低) / (窗口最高 − 窗口最低)；零幅窗口输出 50。 */
  stoch(source: Series, high: Series, low: Series, length: number): Series {
    __checkLength(length)
    const upper = __windowSeries(high, length, 'highest')
    const lower = __windowSeries(low, length, 'lowest')
    return __deriveOnce(
      `stoch:${__seriesId(source)}:${__seriesId(high)}:${__seriesId(low)}:${length}`,
      (_self, offset) => {
        const value = source.at(offset)
        const highValue = upper.at(offset)
        const lowValue = lower.at(offset)
        if (Number.isNaN(value) || Number.isNaN(highValue) || Number.isNaN(lowValue))
          return Number.NaN
        const range = highValue - lowValue
        return range === 0 ? 50 : (100 * (value - lowValue)) / range
      },
    )
  },

  /** Chande 动量振荡器：涨跌差占涨跌和的比例；平盘返回 0。 */
  cmo(source: Series, length: number): Series {
    __checkLength(length)
    return __deriveOnce(`cmo:${__seriesId(source)}:${length}`, (_self, offset) => {
      if (offset + length + 1 > __count()) return Number.NaN
      let up = 0
      let down = 0
      for (let step = 0; step < length; step++) {
        const change = source.at(offset + step) - source.at(offset + step + 1)
        if (change > 0) up += change
        else if (change < 0) down -= change
      }
      const total = up + down
      return total === 0 ? 0 : ((up - down) / total) * 100
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
