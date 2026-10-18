/** Request 声明与结果读取；目标表达式由执行后端在独立运行态逐根执行。 */
const __requestExpressions = new Map<string, () => unknown>()
const __requests: import('../../request/types.js').SecurityRequest[] = []
const syminfo = Object.freeze({ tickerid: __requestContext.symbol })

/** 声明请求的固定身份和历史根数；错误参数直接拒绝。 */
function __declareRequest(
  id: string,
  symbol: string,
  timeframe: string,
  options: import('../../request/types.js').SecurityOptions,
): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Request options 必须是对象')
  if (
    options.source !== undefined &&
    !Object.values(DataSource).some((source) => source === options.source)
  )
    throw new TypeError('Request 指定了未知数据源')
  if (
    typeof symbol !== 'string' ||
    !symbol.trim() ||
    typeof timeframe !== 'string' ||
    !timeframe.trim()
  )
    throw new TypeError('Request 品种和周期不能为空')
  if (
    options.calcBarsCount !== undefined &&
    (!Number.isSafeInteger(options.calcBarsCount) || options.calcBarsCount < 1)
  )
    throw new TypeError('calcBarsCount 必须是正整数')
  if (options.gaps !== undefined && options.gaps !== 'off' && options.gaps !== 'on')
    throw new TypeError('gaps 必须是 on 或 off')
  __requests.push(Object.freeze({ id, symbol, timeframe, ...options }))
}

/** 从宿主提供的已对齐结果取值，返回数组副本，脚本不持有缓存引用。 */
function __requestValue(id: string): unknown {
  const values = __requestContext.results[id]
  if (!values) throw new Error(`Request 缺少行情快照：${id}`)
  const value = values[__count() - 1]
  if (value === undefined) throw new Error(`Request 缺少对齐结果：${id}`)
  return __copyRequestValue(value)
}

/** 复制标量或元组；序列在目标周期游标上物化，拒绝可变对象及非数据返回值。 */
function __copyRequestValue(value: unknown): import('../../request/types.js').RequestValue {
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  )
    return value
  if (Array.isArray(value)) return Object.freeze(value.map(__copyRequestValue))
  // Series 代理不实现 has，直接读取 at。
  if (typeof value === 'object' && value !== null) {
    const at = Reflect.get(value, 'at')
    if (typeof at === 'function') return __copyRequestValue(at(0))
  }
  throw new TypeError('Request 回调只允许返回标量、序列或元组')
}
