/** Request 声明与结果读取；目标表达式由执行后端在独立运行态逐根执行。 */
const __requestExpressions = new Map<string, () => unknown>()
const __requests: import('../../request/types.js').SecurityRequest[] = []
const syminfo = Object.freeze({ tickerid: __requestContext.symbol })

/** 判断非空字符串；品种与周期都不允许空白。 */
function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Request 选项的校验规则；新增选项只需追加一行。 */
const REQUEST_OPTION_RULES: readonly {
  readonly key: 'source' | 'calcBarsCount' | 'gaps'
  readonly isValid: (value: unknown) => boolean
  readonly message: string
}[] = [
  {
    key: 'source',
    isValid: (value) => Object.values(DataSource).some((source) => source === value),
    message: 'Request 指定了未知数据源',
  },
  {
    key: 'calcBarsCount',
    isValid: (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1,
    message: 'calcBarsCount 必须是正整数',
  },
  {
    key: 'gaps',
    isValid: (value) => value === 'off' || value === 'on',
    message: 'gaps 必须是 on 或 off',
  },
]

/** 声明请求的固定身份和历史根数；错误参数直接拒绝。 */
function __declareRequest(
  id: string,
  symbol: string,
  timeframe: string,
  options: import('../../request/types.js').SecurityOptions,
): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('Request options 必须是对象')
  if (!isNonEmptyText(symbol) || !isNonEmptyText(timeframe))
    throw new TypeError('Request 品种和周期不能为空')
  for (const rule of REQUEST_OPTION_RULES) {
    const value = options[rule.key]
    if (value !== undefined && !rule.isValid(value)) throw new TypeError(rule.message)
  }
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
