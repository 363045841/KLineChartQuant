/** 两种执行后端共用的 console 格式化与日志事件组装。 */
import type { LogEvent, LogLevel } from '../../contracts/output.js'

/** 将单个参数转换为可跨线程传输的文本，循环对象不会中断脚本。 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value !== 'object' || value === null) return String(value)
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_key, entry: unknown) => {
      if (typeof entry === 'bigint') return `${entry}n`
      if (typeof entry === 'object' && entry !== null) {
        if (seen.has(entry)) return '[Circular]'
        seen.add(entry)
      }
      return entry
    })
  } catch {
    return '[Unserializable]'
  }
}

/** 创建独立的脚本 console；未提供接收者时仍允许脚本调用。 */
export function createScriptConsole(
  onLog: ((event: LogEvent) => void) | undefined,
  barIndex: () => number,
): Record<LogLevel, (...values: unknown[]) => void> {
  /** 把参数立即快照为文本，避免后续对象修改改变已有输出。 */
  function write(level: LogLevel, values: unknown[]): void {
    onLog?.({
      kind: 'log',
      level,
      time: Date.now(),
      barIndex: barIndex(),
      message: values.map(formatValue).join(' '),
    })
  }
  return {
    log: (...values) => write('log', values),
    info: (...values) => write('info', values),
    warn: (...values) => write('warn', values),
    error: (...values) => write('error', values),
    debug: (...values) => write('debug', values),
  }
}
