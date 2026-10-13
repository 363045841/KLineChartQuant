/**
 * 内置技术分析库：与用户库共用 defineLibrary 协议，供脚本通过 ta.* 调用。
 *
 * 公开接口由 TechnicalAnalysisLibrary 约束，实现与编辑器契约在编译期保持一致。
 * 历史取数统一走 Series.at()，它是契约中为严格索引检查准备的动态访问入口。
 */
defineLibrary('ta', {
  /** 简单移动平均序列，完整窗口之前为 NaN。 */
  sma(source: Series, length: number): Series {
    __checkLength(length)
    return __window(source, length, 'sma')
  },

  /** 窗口最高值序列。 */
  highest(source: Series, length: number): Series {
    __checkLength(length)
    return __window(source, length, 'highest')
  },

  /** 窗口最低值序列。 */
  lowest(source: Series, length: number): Series {
    __checkLength(length)
    return __window(source, length, 'lowest')
  },

  /** 指数移动平均序列，以首个完整窗口 SMA 初始化。 */
  ema(source: Series, length: number): Series {
    __checkLength(length)
    const series = __derive((offset) => {
      if (offset + length > __count()) return Number.NaN
      const firstWindow = (): number => {
        let total = 0
        for (let step = 0; step < length; step++) total += source.at(offset + step)
        return total / length
      }
      // 没有上一根的完整值时，用当前窗口 SMA 初始化。
      if (offset + 1 + length > __count()) return firstWindow()
      const previous = series.at(offset + 1)
      return Number.isNaN(previous)
        ? firstWindow()
        : previous + (2 / (length + 1)) * (source.at(offset) - previous)
    })
    return series
  },

  /** Wilder RSI 序列，平盘为 50。 */
  rsi(source: Series, length: number): Series {
    __checkLength(length)
    // Wilder RSI 需要 length+1 个价格；前 length 个变化做 SMA 初始化，之后按平滑系数递推。
    const gain = __derive((offset) => {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = gain.at(offset + 1)
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
    const loss = __derive((offset) => {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = loss.at(offset + 1)
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
    return __derive((offset) => {
      const up = gain.at(offset)
      const down = loss.at(offset)
      if (Number.isNaN(up) || Number.isNaN(down)) return Number.NaN
      if (down === 0) return up === 0 ? 50 : 100
      return 100 - 100 / (1 + up / down)
    })
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
