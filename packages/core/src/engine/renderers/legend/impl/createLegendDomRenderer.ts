/** 独立 DOM Legend renderer：复用节点、差量写入，不经框架响应式状态。 */
import arrowDown from '@iconify-icons/tabler/arrow-down'
import arrowUp from '@iconify-icons/tabler/arrow-up'
import chevronDown from '@iconify-icons/tabler/chevron-down'
import chevronUp from '@iconify-icons/tabler/chevron-up'
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import refresh from '@iconify-icons/tabler/refresh'
import settings from '@iconify-icons/tabler/settings'
import x from '@iconify-icons/tabler/x'
import { MAIN_PANE_ID } from '@/engine/paneIds.js'
import { FONT_FAMILY } from '@/foundation/tokens/fonts.js'
import {
  LEGEND_ACTION_EVENT,
  type LegendAction,
  type LegendDomRenderer,
  type LegendRow,
} from '../types.js'

/** 隐藏/显示按钮的图标反映当前状态：显示状态用睁眼图标，隐藏状态用划线图标。 */
const VISIBILITY_ICONS = { visible: eye, hidden: eyeOff } as const
const ACTIONS: ReadonlyArray<{ action: LegendAction; label: string; icon: typeof arrowUp }> = [
  { action: 'move-up', label: '上移指标', icon: arrowUp },
  { action: 'move-down', label: '下移指标', icon: arrowDown },
  { action: 'replace', label: '更换指标', icon: refresh },
  { action: 'toggle-visibility', label: '显示指标', icon: eye },
  { action: 'settings', label: '指标设置', icon: settings },
  { action: 'close', label: '关闭指标', icon: x },
]
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
/** 六个操作按钮所需的 frame 右侧扩展宽度。 */
const FRAME_EXTRA_WIDTH_PX = 156
/** 收起按钮图标：展开态用收起图标，收起态用展开图标。 */
const COLLAPSE_ICONS = { expanded: chevronUp, collapsed: chevronDown } as const
/** 收起按钮与最后一行图例之间的间距。 */
const COLLAPSE_GAP_PX = 2

interface MountedRow {
  element: HTMLDivElement
  text: HTMLDivElement
  spans: HTMLSpanElement[]
  nodes: Text[]
  buttons: HTMLButtonElement[]
  /** 隐藏/显示按钮及其图标，随行状态切换。 */
  visibilityButton?: HTMLButtonElement
  visibilityIcon?: SVGSVGElement
  data: LegendRow
}

/** 将主题与交互样式限制在当前图表拥有的 Legend 容器中。 */
function createStyles(document: Document): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = `
    .klc-legend-root { position:absolute; inset:0; z-index:9; pointer-events:none; }
    .klc-legend-row { position:absolute; width:max-content; box-sizing:border-box; z-index:0;
      font-family:${FONT_FAMILY}; font-size:12px; font-weight:400; font-style:normal;
      line-height:18px; letter-spacing:normal; white-space:nowrap; pointer-events:none; }
    .klc-legend-row[data-indicator] { pointer-events:auto; }
    .klc-legend-text { display:flex; align-items:center; min-height:inherit; width:max-content; max-width:100%; overflow:hidden; }
    .klc-legend-text > span { flex-shrink:0; }
    .klc-legend-row[data-hidden] .klc-legend-text { filter:grayscale(1); opacity:.55; }
    .klc-legend-frame { position:absolute; left:-5px; top:50%; transform:translateY(-50%);
      width:calc(100% + ${FRAME_EXTRA_WIDTH_PX}px); height:28px; box-sizing:border-box;
      display:none; align-items:center; justify-content:flex-end; padding:2px 3px;
      border:1px solid var(--klc-color-ui-border); border-radius:4px;
      background:var(--klc-color-ui-surface); z-index:-1; pointer-events:auto; }
    .klc-legend-actions { display:flex; align-items:center; gap:2px; }
    .klc-legend-row[data-indicator]:hover, .klc-legend-row[data-indicator]:focus-within { z-index:1; }
    .klc-legend-row:hover > .klc-legend-frame, .klc-legend-row:focus-within > .klc-legend-frame { display:flex; }
    .klc-legend-button { display:grid; place-items:center; flex:0 0 22px;
      width:22px; height:22px; padding:0; border:0; border-radius:3px;
      background:transparent; color:var(--klc-color-ui-text-soft); cursor:pointer; }
    .klc-legend-button:hover, .klc-legend-button:focus-visible {
      background:color-mix(in srgb,var(--klc-color-ui-text) 8%,transparent); outline:none; }
    .klc-legend-button:disabled { opacity:.3; cursor:default; }
    .klc-legend-button:disabled:hover { background:transparent; }
    .klc-legend-button > svg { display:block; width:14px; height:14px; overflow:visible; }
    .klc-legend-collapse { position:absolute; z-index:1; display:flex; align-items:center; gap:2px;
      height:16px; padding:0 2px; border:1px solid var(--klc-color-ui-border); border-radius:3px;
      background:var(--klc-color-ui-surface); color:var(--klc-color-ui-text-soft); cursor:pointer; pointer-events:auto; }
    .klc-legend-collapse[hidden] { display:none; }
    .klc-legend-collapse:hover, .klc-legend-collapse:focus-visible {
      background:color-mix(in srgb,var(--klc-color-ui-text) 8%,transparent); outline:none; }
    .klc-legend-collapse > svg { display:block; width:14px; height:14px; overflow:visible; }
    .klc-legend-collapse-count { font-family:${FONT_FAMILY}; font-size:12px; line-height:1;
      color:var(--klc-color-ui-text-soft); }
    .klc-legend-collapse-count[hidden] { display:none; }
  `
  return style
}

/** 创建每个指标独立的操作按钮，事件只携带低频操作身份。 */
function addActions(document: Document, row: MountedRow): void {
  // frame 是独立于文本流的包裹层，依据同一文本 DOM 的尺寸定位，不改变文字坐标。
  const frame = document.createElement('div')
  frame.className = 'klc-legend-frame'
  const actions = document.createElement('div')
  actions.className = 'klc-legend-actions'
  for (const item of ACTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'klc-legend-button'
    button.title = item.label
    button.setAttribute('aria-label', item.label)
    const icon = document.createElementNS(SVG_NAMESPACE, 'svg')
    icon.setAttribute('viewBox', `0 0 ${item.icon.width ?? 24} ${item.icon.height ?? 24}`)
    icon.setAttribute('aria-hidden', 'true')
    // 仅使用本地已安装图标包的完整 SVG 内容，不手工拆解或重绘图标。
    icon.innerHTML = item.icon.body
    button.append(icon)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const indicator = row.data.indicator
      if (!indicator) return
      row.element.dispatchEvent(
        new CustomEvent(LEGEND_ACTION_EVENT, {
          bubbles: true,
          detail: {
            action: item.action,
            paneId: row.data.paneId,
            definitionId: indicator.definitionId,
            ...(item.action === 'toggle-visibility' ? { hidden: !row.data.hidden } : {}),
          },
        }),
      )
    })
    row.buttons.push(button)
    actions.append(button)
    if (item.action === 'toggle-visibility') {
      row.visibilityButton = button
      row.visibilityIcon = icon
    }
  }
  frame.append(actions)
  row.element.append(frame)
}

/** 创建 DOM renderer，通过 hasSelectedSymbol 读取当前品种选择状态。 */
export function createLegendDomRenderer(
  host: HTMLElement,
  hasSelectedSymbol: () => boolean,
): LegendDomRenderer {
  const document = host.ownerDocument
  const root = document.createElement('div')
  root.className = 'klc-legend-root'
  root.append(createStyles(document))
  host.append(root)
  const mounted = new Map<string, Map<string, MountedRow>>()

  // 主图图例整块收起状态只存在于当前图表实例内存；收起只是切换已有行的显示，不改发布数据。
  let mainCollapsed = false
  // 收起时在图标右侧显示的主图指标数量。
  let mainIndicatorCount = 0
  // 收起按钮定位到首行；展开时定位到最后一行下方。
  let firstRowTop: string | null = null
  let lastRowBottom: string | null = null
  const collapseButton = document.createElement('button')
  collapseButton.type = 'button'
  collapseButton.className = 'klc-legend-collapse'
  collapseButton.hidden = true
  const collapseIcon = document.createElementNS(SVG_NAMESPACE, 'svg')
  collapseIcon.setAttribute('viewBox', '0 0 24 24')
  collapseIcon.setAttribute('aria-hidden', 'true')
  const collapseCount = document.createElement('span')
  collapseCount.className = 'klc-legend-collapse-count'
  collapseCount.hidden = true
  collapseButton.append(collapseIcon, collapseCount)
  collapseButton.addEventListener('click', (event) => {
    event.stopPropagation()
    mainCollapsed = !mainCollapsed
    applyCollapseState()
  })
  // 收起按钮阻止画布拖拽，点击不触发画布指针流程。
  for (const event of ['pointerdown', 'pointermove', 'dblclick']) {
    collapseButton.addEventListener(event, (event) => event.stopPropagation())
  }
  root.append(collapseButton)

  /** 切换主图行的显示，并把按钮放到首行（收起）或末行下方（展开）。 */
  function applyCollapseState(): void {
    // 收起态隐藏全部已发布行；行节点保留，展开时无需重绘即可恢复。
    const display = mainCollapsed ? 'none' : ''
    for (const [paneId, entries] of mounted) {
      if (paneId !== MAIN_PANE_ID) continue
      for (const row of entries.values()) {
        if (row.element.style.display !== display) row.element.style.display = display
      }
    }
    const icon = mainCollapsed ? COLLAPSE_ICONS.collapsed : COLLAPSE_ICONS.expanded
    const label = mainCollapsed ? '展开指标' : '收起指标'
    if (collapseButton.title !== label) {
      collapseIcon.innerHTML = icon.body
      collapseButton.title = label
      collapseButton.setAttribute('aria-label', label)
      collapseButton.setAttribute('aria-expanded', String(!mainCollapsed))
    }
    // 收起态才在图标右侧显示主图指标数量。
    if (collapseCount.hidden === mainCollapsed) collapseCount.hidden = !mainCollapsed
    const countText = mainCollapsed ? String(mainIndicatorCount) : ''
    if (collapseCount.textContent !== countText) collapseCount.textContent = countText
    const top = (mainCollapsed ? firstRowTop : lastRowBottom) ?? ''
    if (collapseButton.style.top !== top) collapseButton.style.top = top
  }

  /** 清理全部标题节点，保留容器及主题样式；收起状态复位为展开。 */
  function clear(): void {
    for (const rows of mounted.values()) for (const row of rows.values()) row.element.remove()
    mounted.clear()
    collapseButton.hidden = true
    mainIndicatorCount = 0
    firstRowTop = null
    lastRowBottom = null
    if (mainCollapsed) {
      mainCollapsed = false
      applyCollapseState()
    }
  }

  return {
    update(paneId, rows, paneOrder) {
      for (const [id, entries] of mounted) {
        if (paneOrder.includes(id)) continue
        for (const row of entries.values()) row.element.remove()
        mounted.delete(id)
      }
      let entries = mounted.get(paneId)
      if (!entries) {
        entries = new Map()
        mounted.set(paneId, entries)
      }
      const keys = new Set(rows.map((row) => row.key))
      for (const [key, row] of entries) {
        if (keys.has(key)) continue
        row.element.remove()
        entries.delete(key)
      }
      const indicatorRows = rows.filter((row) => row.indicator)
      for (const data of rows) {
        let row = entries.get(data.key)
        if (!row) {
          const element = document.createElement('div')
          element.className = 'klc-legend-row'
          const text = document.createElement('div')
          text.className = 'klc-legend-text'
          element.append(text)
          row = { element, text, spans: [], nodes: [], buttons: [], data }
          if (data.indicator) {
            element.dataset.indicator = data.indicator.instanceId
            addActions(document, row)
            // Legend 本身阻止画布拖拽，悬浮数值不触发 Vue 或画布指针流程。
            for (const event of ['pointerdown', 'pointermove', 'dblclick']) {
              element.addEventListener(event, (event) => event.stopPropagation())
            }
          }
          // 收起期间新建的行同样保持隐藏，避免展开前闪出。
          if (data.paneId === MAIN_PANE_ID && mainCollapsed) element.style.display = 'none'
          root.append(element)
          entries.set(data.key, row)
        }
        const previous = row.data
        const style = row.element.style
        const left = `${data.x}px`
        const top = `${data.y}px`
        const maxWidth = `${Math.max(0, data.maxWidth - (data.indicator ? FRAME_EXTRA_WIDTH_PX : 0))}px`
        const minHeight = `${data.height}px`
        const gap = `${data.gap}px`
        if (style.left !== left) style.left = left
        if (style.top !== top) style.top = top
        if (style.maxWidth !== maxWidth) style.maxWidth = maxWidth
        if (style.minHeight !== minHeight) style.minHeight = minHeight
        if (row.text.style.gap !== gap) row.text.style.gap = gap
        while (row.spans.length > data.texts.length) {
          row.spans.pop()?.remove()
          row.nodes.pop()
        }
        for (let index = 0; index < data.texts.length; index++) {
          const segment = data.texts[index]!
          let span = row.spans[index]
          const created = !span
          if (!span) {
            span = document.createElement('span')
            const node = document.createTextNode(segment.text)
            span.append(node)
            row.nodes.push(node)
            row.spans.push(span)
            row.text.append(span)
          }
          const node = row.nodes[index]!
          if (node.data !== segment.text) node.data = segment.text
          if (created || previous.texts[index]?.color !== segment.color)
            span.style.color = segment.color
          const marginLeft =
            index > 0 && segment.gapBefore !== undefined ? `${segment.gapBefore - data.gap}px` : ''
          if (span.style.marginLeft !== marginLeft) span.style.marginLeft = marginLeft
        }
        if (data.indicator) {
          const hidden = data.hidden === true
          if (row.element.hasAttribute('data-hidden') !== hidden) {
            row.element.toggleAttribute('data-hidden', hidden)
          }
          const label = hidden ? '隐藏指标' : '显示指标'
          const icon = hidden ? VISIBILITY_ICONS.hidden : VISIBILITY_ICONS.visible
          if (row.visibilityButton && row.visibilityIcon && row.visibilityButton.title !== label) {
            row.visibilityButton.title = label
            row.visibilityButton.setAttribute('aria-label', label)
            row.visibilityIcon.innerHTML = icon.body
          }
        }
        if (row.buttons.length) {
          const order =
            paneId === MAIN_PANE_ID
              ? indicatorRows.map((row) => row.key)
              : paneOrder.filter((id) => id !== MAIN_PANE_ID)
          const index = order.indexOf(paneId === MAIN_PANE_ID ? data.key : paneId)
          const upDisabled = index <= 0
          const downDisabled = index < 0 || index >= order.length - 1
          if (row.buttons[0]!.disabled !== upDisabled) row.buttons[0]!.disabled = upDisabled
          if (row.buttons[1]!.disabled !== downDisabled) row.buttons[1]!.disabled = downDisabled
        }
        row.data = data
      }
      // 已选择品种且主图有指标行时启用按钮，避免默认指标让空图显示展开/收起入口。
      if (paneId === MAIN_PANE_ID) {
        const first = rows[0]
        const last = rows[rows.length - 1]
        mainIndicatorCount = indicatorRows.length
        const enable =
          hasSelectedSymbol() &&
          indicatorRows.length > 0 &&
          first !== undefined &&
          last !== undefined
        if (collapseButton.hidden === enable) collapseButton.hidden = !enable
        if (enable) {
          firstRowTop = `${first.y}px`
          lastRowBottom = `${last.y + last.height + COLLAPSE_GAP_PX}px`
          const left = `${first.x}px`
          if (collapseButton.style.left !== left) collapseButton.style.left = left
        } else {
          firstRowTop = null
          lastRowBottom = null
        }
        applyCollapseState()
      }
    },
    clear,
    dispose() {
      clear()
      root.remove()
    },
  }
}
