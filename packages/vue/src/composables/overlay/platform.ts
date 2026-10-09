/**
 * 浮层平台能力探测。
 *
 * 浮层原语优先使用平台能力（Popover API、CSS anchor positioning、field-sizing），
 * 只在能力缺失时启用 JS 兜底。每个探测都容忍非浏览器环境（SSR、测试 DOM）。
 *
 * Baseline 状态（MDN，2026-10）：
 * - Popover API：Baseline 2024（newly available 2024-04）
 * - CSS anchor positioning：Baseline 2026（newly available 2026-01）
 * - field-sizing：Baseline 2026（newly available 2026-06）
 */

function cssSupports(declaration: string): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
      ? CSS.supports(declaration)
      : false
  } catch {
    return false
  }
}

/** 是否支持 Popover API（`popover` 属性 + showPopover/hidePopover）。 */
export function supportsPopover(): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function' &&
    typeof HTMLElement.prototype.hidePopover === 'function'
  )
}

/** 是否支持 CSS anchor positioning（anchor-name + position-area）。 */
export function supportsAnchorPositioning(): boolean {
  return cssSupports('anchor-name: --klc-probe') && cssSupports('position-area: block-end')
}

/** 是否支持 `field-sizing: content`（文本域按内容自增高）。 */
export function supportsFieldSizing(): boolean {
  return cssSupports('field-sizing: content')
}

/** 用户是否要求减少动效。 */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

/** 可通过 Tab 顺序到达的元素选择器；用于焦点陷阱与初始聚焦。 */
export const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',')

/** 返回容器内按文档顺序可 Tab 聚焦的元素（排除 tabindex<0、inert 与隐藏元素）。 */
export function getTabbables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)].filter((element) => {
    if (element.tabIndex < 0) return false
    if (element.closest('[inert]')) return false
    if (element.closest('[hidden]')) return false
    // 关闭状态的 popover 不可见，其内容不参与 Tab 顺序。
    const popover = element.closest<HTMLElement>('[popover]')
    if (popover && popover !== container && !isPopoverOpen(popover)) return false
    return true
  })
}

/** popover 是否处于打开状态；不支持 :popover-open 的环境按可见性判断。 */
export function isPopoverOpen(element: HTMLElement): boolean {
  try {
    return element.matches(':popover-open')
  } catch {
    return element.style.display !== 'none'
  }
}
