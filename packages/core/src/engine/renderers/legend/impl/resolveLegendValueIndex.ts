/**
 * Legend 取值索引的唯一来源。
 *
 * 有十字光标时取光标指向的 K 线；无光标时固定取最新一根 K 线，
 * 不取「可见范围最后一根」，避免数值随视口平移漂移。
 */
export function resolveLegendValueIndex(
  crosshairIndex: number | null | undefined,
  dataLength: number,
): number {
  if (typeof crosshairIndex === 'number') return crosshairIndex
  return dataLength - 1
}
