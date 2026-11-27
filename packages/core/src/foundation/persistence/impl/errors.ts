/**
 * 持久化失败构造：把底层存储异常、状态错误和结构错误统一成错误码。
 *
 * 文案只描述事实，不绑定具体存储实现；IndexedDB 专属的阻塞与版本冲突文案
 * 只由该驱动产生。
 */
import {
  type ErrorDetails,
  KLineChartError,
  type KLineChartErrorCode,
  type KLineChartErrorOptions,
  PERSISTENCE_ERROR_CODES,
} from '../../../errors.js'

/** 构造持久化错误；原始底层错误放在 cause，便于诊断。 */
function persistenceFailure(
  code: KLineChartErrorCode,
  message: string,
  cause?: unknown,
  details?: ErrorDetails,
): KLineChartError {
  const options: KLineChartErrorOptions = { cause, details }
  return new KLineChartError(code, message, options)
}

/** 存储不可用：运行环境不允许本地持久化，或驱动无法建立连接。 */
export function unavailableFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.UNAVAILABLE,
    '持久化存储不可用，当前环境不允许写入本地数据',
    cause,
  )
}

/** 读取失败：连接、解码前读取或事务本身失败。 */
export function readFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.READ_FAILED, '读取持久化记录失败', cause)
}

/** 写入失败：编码、提交或事务终止导致。 */
export function writeFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.WRITE_FAILED, '写入持久化记录失败', cause)
}

/** 记录存在但结构无法识别。 */
export function corruptFailure(storeName: string): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.CORRUPT,
    `持久化记录格式无法识别：${storeName}`,
    undefined,
    { storeName },
  )
}

/** IndexedDB 升级被其他标签页阻塞。 */
export function blockedFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.BLOCKED,
    '存储升级被其他标签页阻塞，请关闭其他页面后重试',
    cause,
  )
}

/** 仓库或连接已释放。 */
export function closedFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(PERSISTENCE_ERROR_CODES.CLOSED, '持久化存储已释放', cause)
}

/** 数据库版本高于当前代码。 */
export function versionMismatchFailure(cause?: unknown): KLineChartError {
  return persistenceFailure(
    PERSISTENCE_ERROR_CODES.VERSION_MISMATCH,
    '存储版本高于当前页面，请刷新页面',
    cause,
  )
}
