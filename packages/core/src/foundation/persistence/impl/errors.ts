/**
 * 持久化错误构造：把底层 DOMException 和连接状态收敛为统一错误码。
 */
import {
  KLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
  PERSISTENCE_ERROR_CODES,
} from '../../../errors.js'

/** 构造持久化错误；消息保持可读，底层错误放进 cause。 */
export function persistenceFailure(
  code: KLineChartErrorCode,
  message: string,
  cause?: unknown,
  details?: Readonly<Record<string, unknown>>,
): KLineChartError {
  const options: KLineChartErrorOptions = { cause, details }
  return new KLineChartError(code, message, options)
}

/** 存储环境不可用（SSR、隐私模式、受限 iframe）。 */
export function unavailableFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.UNAVAILABLE,
    '浏览器无法使用 IndexedDB 存储',
    cause,
  )
}

/** 读取失败：连接、事务或请求错误。 */
export function readFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.READ_FAILED, '读取 IndexedDB 记录失败', cause)
}

/** 写入失败：配额、事务中止或请求错误。 */
export function writeFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.WRITE_FAILED, '写入 IndexedDB 记录失败', cause)
}

/** 记录存在但编解码器无法识别。 */
export function corruptFailure(storeName: string): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.CORRUPT,
    `IndexedDB 记录格式无法识别：${storeName}`,
    undefined,
    { storeName },
  )
}

/** 升级被其他标签页的旧连接阻塞。 */
export function blockedFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.BLOCKED,
    'IndexedDB 升级被其他标签页阻塞，请关闭其他页面后重试',
    cause,
  )
}

/** 仓库已释放。 */
export function closedFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.CLOSED, 'IndexedDB 存储已释放', cause)
}

/** 代码版本低于磁盘上的数据库版本。 */
export function versionMismatchFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.VERSION_MISMATCH,
    'IndexedDB 数据库版本高于当前页面，请刷新页面',
    cause,
  )
}
