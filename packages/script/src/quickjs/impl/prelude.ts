/**
 * VM 内脚本运行时预置：Series 与 ta 的唯一实现都在这里，宿主只提供原始数据与输出桥。
 *
 * 宿主需先注入：__read(field, offset)、__count()、__plot(id, value, color)、params。
 * 逐 bar 执行由宿主驱动游标，__read 相对当前 K 线取值；offset 越大越早。
 */
export const SCRIPT_PRELUDE = `
// 数值窗口统一校验，负数、非整数与零都拒绝。
function __checkLength(length) {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('length 必须是正整数')
}

// 只读序列的 get 拦截：at 返回读取函数，纯数字键按偏移取值，其余键不暴露。
function __seriesGet(read, key) {
  if (typeof key !== 'string') return undefined
  if (key === 'at') return read
  if (!/^\\d+$/.test(key)) return undefined
  return read(Number(key))
}

// 行情序列：__read 已按当前游标处理偏移，历史不足由宿主返回 NaN。
function __series(field) {
  function read(offset) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Series offset 必须是非负整数')
    return __read(field, offset)
  }
  return new Proxy(Object.create(null), {
    get: function (_target, key) { return __seriesGet(read, key) },
    set: function () { throw new TypeError('Series 是只读的') },
    defineProperty: function () { throw new TypeError('Series 是只读的') },
    deleteProperty: function () { throw new TypeError('Series 是只读的') },
  })
}

// 派生序列：按偏移惰性计算并缓存，同一脚本内多次引用不重复计算。
function __derive(compute) {
  const memo = new Map()
  function read(offset) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Series offset 必须是非负整数')
    const index = __count() - 1 - offset
    if (memo.has(index)) return memo.get(index)
    const value = compute(offset)
    memo.set(index, value)
    return value
  }
  return new Proxy(Object.create(null), {
    get: function (_target, key) { return __seriesGet(read, key) },
    set: function () { throw new TypeError('Series 是只读的') },
  })
}

// 滑动窗口：完整窗口之前返回 NaN，窗口内出现 NaN 时结果也是 NaN。
function __window(source, length, kind) {
  return __derive(function (offset) {
    if (offset + length > __count()) return Number.NaN
    let value = kind === 'highest' ? -Infinity : kind === 'lowest' ? Infinity : 0
    for (let step = 0; step < length; step++) {
      const current = source[offset + step]
      value = kind === 'highest' ? Math.max(value, current)
        : kind === 'lowest' ? Math.min(value, current)
        : value + current
    }
    return kind === 'sma' ? value / length : value
  })
}

const open = __series('open')
const high = __series('high')
const low = __series('low')
const close = __series('close')
const volume = __series('volume')
const time = __series('time')

`

/** 内置技术分析库源码，通过相同 defineLibrary 协议加载。 */
export const TA_LIBRARY_SOURCE = `
defineLibrary('ta', {
  sma: function (source, length) { __checkLength(length); return __window(source, length, 'sma') },
  highest: function (source, length) { __checkLength(length); return __window(source, length, 'highest') },
  lowest: function (source, length) { __checkLength(length); return __window(source, length, 'lowest') },

  ema: function (source, length) {
    __checkLength(length)
    const series = __derive(function (offset) {
      if (offset + length > __count()) return Number.NaN
      const firstWindow = function () {
        let total = 0
        for (let step = 0; step < length; step++) total += source[offset + step]
        return total / length
      }
      // 没有上一根的完整值时，用当前窗口 SMA 初始化。
      if (offset + 1 + length > __count()) return firstWindow()
      const previous = series[offset + 1]
      return Number.isNaN(previous) ? firstWindow() : previous + (2 / (length + 1)) * (source[offset] - previous)
    })
    return series
  },

  rsi: function (source, length) {
    __checkLength(length)
    // Wilder RSI 需要 length+1 个价格；前 length 个变化做 SMA 初始化，之后按平滑系数递推。
    const gain = __derive(function (offset) {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = gain[offset + 1]
        if (!Number.isNaN(previous)) {
          const change = source[offset] - source[offset + 1]
          return (previous * (length - 1) + Math.max(change, 0)) / length
        }
      }
      let total = 0
      for (let step = 0; step < length; step++) total += Math.max(source[offset + step] - source[offset + step + 1], 0)
      return total / length
    })
    const loss = __derive(function (offset) {
      if (offset + length + 1 > __count()) return Number.NaN
      if (offset + length + 2 <= __count()) {
        const previous = loss[offset + 1]
        if (!Number.isNaN(previous)) {
          const change = source[offset + 1] - source[offset]
          return (previous * (length - 1) + Math.max(change, 0)) / length
        }
      }
      let total = 0
      for (let step = 0; step < length; step++) total += Math.max(source[offset + step + 1] - source[offset + step], 0)
      return total / length
    })
    return __derive(function (offset) {
      const up = gain[offset]
      const down = loss[offset]
      if (Number.isNaN(up) || Number.isNaN(down)) return Number.NaN
      if (down === 0) return up === 0 ? 50 : 100
      return 100 - 100 / (1 + up / down)
    })
  },

  crossover: function (left, right) { return left[0] > right[0] && left[1] <= right[1] },
  crossunder: function (left, right) { return left[0] < right[0] && left[1] >= right[1] },
})

`

/** 指标声明与输出 SDK，与行情和库分开加载。 */
export const INDICATOR_PRELUDE = `

// 输出一个绘图点；NaN 表示空点，宿主负责与 K 线下标对齐。
function plot(value, options) {
  if (!options || typeof options.id !== 'string') throw new TypeError('plot 需要 { id }')
  __plot(options.id, value, options.color)
}

// 输入声明和整文件定义只初始化一次；onBar 使用同一 VM 的全局序列。
function input(value, title) {
  return title === undefined ? { default: value } : { default: value, title: title }
}

let __definition
function defineIndicator(definition) {
  if (__definition) throw new TypeError('每个脚本文件只能声明一个指标')
  if (!definition || typeof definition.onBar !== 'function') throw new TypeError('指标需要 onBar 函数')
  __definition = definition
  for (const key of Object.keys(definition.inputs || {})) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) params[key] = definition.inputs[key].default
  }
}

// 返回元数据快照，不把 VM 函数或序列传回宿主。
function __metadata() {
  if (!__definition) throw new TypeError('脚本需要调用 defineIndicator')
  return {
    name: __definition.name,
    displayName: __definition.displayName,
    pane: __definition.pane,
    inputs: __definition.inputs,
    plots: __definition.plots,
    fills: __definition.fills,
  }
}

function __onBar() { __definition.onBar() }

// 裸标识符和 globalThis 成员指向同一份 VM 对象，不修改宿主全局。
Object.assign(globalThis, { open, high, low, close, volume, time, plot, input, defineIndicator })
`
