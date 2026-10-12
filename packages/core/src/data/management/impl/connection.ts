/** 连接地址的统一校验；Core 不接收未完成的表单输入。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'

/** 校验完整 HTTP(S) 地址，空值表示恢复默认地址。 */
export function normalizeConnectionUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error()
    return url.toString().replace(/\/+$/, '')
  } catch {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Expected a complete HTTP(S) connection URL',
    )
  }
}
