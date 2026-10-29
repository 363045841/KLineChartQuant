/** 统一把未知异常转成可展示文本，避免每处各写一遍三元。 */
export function errorText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}
