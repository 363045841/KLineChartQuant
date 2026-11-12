/** 标签拖放的输入边界；普通文本与非法 JSON 都不会进入标签操作。 */
export interface TabDragPayload {
  readonly fromWorkspaceId: string
  readonly tabId: string
}

/** 解析外部拖放文本，只接受两个非空身份字符串，不相信 JSON 类型断言。 */
export function readTabDragPayload(raw: string): TabDragPayload | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('fromWorkspaceId' in value) ||
    typeof value.fromWorkspaceId !== 'string' ||
    !value.fromWorkspaceId.trim() ||
    !('tabId' in value) ||
    typeof value.tabId !== 'string' ||
    !value.tabId.trim()
  )
    return null
  return { fromWorkspaceId: value.fromWorkspaceId, tabId: value.tabId }
}
