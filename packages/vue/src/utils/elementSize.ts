/** 从 ResizeObserver 条目读取元素边框盒尺寸，忽略已断开节点。 */

/** 返回四舍五入后的边框盒宽高；节点已脱离文档时返回 null。 */
export function readElementSize(
  entry: ResizeObserverEntry,
): { width: number; height: number } | null {
  const target = entry.target as HTMLElement
  if (!target.isConnected) return null
  const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width
  const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
  return { width: Math.round(width), height: Math.round(height) }
}
