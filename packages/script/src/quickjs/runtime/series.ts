/**
 * VM 内行情序列实现：__read 桥接宿主 K 线，Series 只按下标向过去取值。
 *
 * 逐 bar 执行由宿主驱动游标，__read 相对当前 K 线取值，offset 越大越早。
 */

/** 数值窗口统一校验，负数、非整数与零都拒绝。 */
function __checkLength(length: number): void {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('length 必须是正整数')
}

/** 只读序列的 get 拦截：at 返回读取函数，纯数字键按偏移取值，其余键不暴露。 */
function __seriesGet(read: (offset: number) => number, key: string | symbol): unknown {
  if (typeof key !== 'string') return undefined
  if (key === 'at') return read
  if (!/^\d+$/.test(key)) return undefined
  return read(Number(key))
}

/** 行情序列：__read 已按当前游标处理偏移，历史不足由宿主返回 NaN。 */
function __series(field: string): Series {
  function read(offset: number): number {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('Series offset 必须是非负整数')
    }
    return __read(field, offset)
  }
  return new Proxy(Object.create(null), {
    get: (_target, key) => __seriesGet(read, key),
    set: () => {
      throw new TypeError('Series 是只读的')
    },
    defineProperty: () => {
      throw new TypeError('Series 是只读的')
    },
    deleteProperty: () => {
      throw new TypeError('Series 是只读的')
    },
  })
}

/** 派生序列：按偏移惰性计算并缓存，同一脚本内多次引用不重复计算。 */
function __derive(compute: (offset: number) => number): Series {
  // 计算结果恒为 number，因此 undefined 只表示该下标尚未计算。
  const memo = new Map<number, number>()
  function read(offset: number): number {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('Series offset 必须是非负整数')
    }
    const index = __count() - 1 - offset
    const cached = memo.get(index)
    if (cached !== undefined) return cached
    const value = compute(offset)
    memo.set(index, value)
    return value
  }
  return new Proxy(Object.create(null), {
    get: (_target, key) => __seriesGet(read, key),
    set: () => {
      throw new TypeError('Series 是只读的')
    },
  })
}

/** 滑动窗口：完整窗口之前返回 NaN，窗口内出现 NaN 时结果也是 NaN。 */
function __window(source: Series, length: number, kind: 'sma' | 'highest' | 'lowest'): Series {
  return __derive((offset) => {
    if (offset + length > __count()) return Number.NaN
    let value = kind === 'highest' ? -Infinity : kind === 'lowest' ? Infinity : 0
    for (let step = 0; step < length; step++) {
      const current = source.at(offset + step)
      value =
        kind === 'highest'
          ? Math.max(value, current)
          : kind === 'lowest'
            ? Math.min(value, current)
            : value + current
    }
    return kind === 'sma' ? value / length : value
  })
}

/** 行情序列：宿主按当前游标提供取值。 */
const open = __series('open')
const high = __series('high')
const low = __series('low')
const close = __series('close')
const volume = __series('volume')
const time = __series('time')
