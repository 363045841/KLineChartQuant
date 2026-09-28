/** 未来槽位仅在展示层使用相对索引占位，不据此推算交易日期。 */

/** 相对索引占位标签的前缀：末根真实 K 线记作 T，其后槽位依次为 T+1、T+2。 */
export const FUTURE_SLOT_LABEL_PREFIX = 'T+'

/** 将未来槽位索引格式化为相对索引占位标签；非未来槽位返回 null。 */
export function formatFutureSlotLabel(index: number, dataLength: number): string | null {
  if (!Number.isInteger(index) || dataLength <= 0 || index < dataLength) return null
  return `${FUTURE_SLOT_LABEL_PREFIX}${index - dataLength + 1}`
}

/** 有权威时间戳时显示日期，否则仅为有效未来槽位生成相对索引文本。 */
export function resolveAxisTimeLabel(
  index: number,
  dataLength: number,
  timestamp: number | null,
  formatDate: (timestamp: number) => string,
): string | null {
  if (!Number.isInteger(index) || index < 0) return null
  if (timestamp !== null) return formatDate(timestamp)
  return formatFutureSlotLabel(index, dataLength)
}
