/** 独立 DOM Legend renderer：复用节点、差量写入，不经框架响应式状态。 */

import arrowDown from '@iconify-icons/tabler/arrow-down'
import arrowUp from '@iconify-icons/tabler/arrow-up'
import arrowsMove from '@iconify-icons/tabler/arrows-move'
import chevronDown from '@iconify-icons/tabler/chevron-down'
import chevronUp from '@iconify-icons/tabler/chevron-up'
import code from '@iconify-icons/tabler/code'
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import refresh from '@iconify-icons/tabler/refresh'
import settings from '@iconify-icons/tabler/settings'
import x from '@iconify-icons/tabler/x'
import { LEGEND_COLLAPSE_HEIGHT_PX } from '@/engine/legend/impl/legendGeometry.js'
import {
  LEGEND_TEXT_LINE_HEIGHT,
  LEGEND_UI_EVENT,
  type LegendAction,
  type LegendRow,
  type LegendUiRequest,
} from '@/engine/legend/types.js'
import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import { FONT_FAMILY } from '@/foundation/tokens/fonts.js'
import type { LegendDomFrame, LegendDomRenderer } from '../types.js'

/** 隐藏/显示按钮的图标反映当前状态：显示状态用睁眼图标，隐藏状态用划线图标。 */
const VISIBILITY_ICONS = { visible: eye, hidden: eyeOff } as const
const ACTION_ICONS: Record<LegendAction, typeof arrowUp> = {
  'move-up': arrowUp,
  'move-down': arrowDown,
  'move-pane-up': chevronUp,
  'move-pane-down': chevronDown,
  'move-to': arrowsMove,
  replace: refresh,
  'edit-code': code,
  'toggle-visibility': eye,
  settings,
  close: x,
}
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const ACTION_BUTTON_STEP_PX = 24
const ACTION_FRAME_PADDING_PX = 12
/** 收起按钮图标：展开态用收起图标，收起态用展开图标。 */
const COLLAPSE_ICONS = { expanded: chevronUp, collapsed: chevronDown } as const
/** 收起按钮与最后一行图例之间的间距。 */
const COLLAPSE_GAP_PX = 2

interface MountedRow {
  element: HTMLDivElement
  name: HTMLDivElement
  text: HTMLDivElement
  /** 加载圈元素，位于文本流最前；加载结束由 hidden 隐藏。 */
  spinner: HTMLSpanElement
  errorBanner: HTMLDivElement
  spans: HTMLSpanElement[]
  nodes: Text[]
  buttons: HTMLButtonElement[]
  actionFrame?: HTMLDivElement
  /** 隐藏/显示按钮及其图标，随行状态切换。 */
  visibilityButton?: HTMLButtonElement
  visibilityIcon?: SVGSVGElement
  data: LegendRow
}

/** 仅在值变化时写入样式，减少高频帧的 DOM 变更。 */
function applyStyle(
  style: CSSStyleDeclaration,
  property: 'left' | 'top' | 'maxWidth' | 'minHeight',
  value: string,
): void {
  if (style[property] !== value) style[property] = value
}

/** 将主题与交互样式限制在当前图表拥有的 Legend 容器中。 */
function createStyles(document: Document): HTMLStyleElement {
  const style = document.createElement('style')
  style.textContent = `
    .klc-legend-root { position:absolute; inset:0; z-index:9; pointer-events:none; }
    .klc-legend-row { position:absolute; display:flex; align-items:center; gap:0; width:max-content; box-sizing:border-box; z-index:0;
      font-family:${FONT_FAMILY}; font-size:12px; font-weight:400; font-style:normal;
      line-height:${LEGEND_TEXT_LINE_HEIGHT}px; letter-spacing:normal; white-space:nowrap; pointer-events:none;
      margin-left:-4px; padding-inline:4px;
      background:color-mix(in srgb,var(--klc-color-ui-surface) 80%,transparent); }
    .klc-legend-row[data-actions] { pointer-events:auto; }
    .klc-legend-name { position:relative; display:flex; align-items:center; justify-content:center;
      flex:0 0 auto; min-height:inherit; z-index:1; }
    .klc-legend-text { display:flex; align-items:center; gap:0; min-width:0; min-height:inherit; width:max-content; max-width:100%; overflow:hidden; }
    .klc-legend-text > span { flex-shrink:0; }
    .klc-legend-row[data-hidden] .klc-legend-text,
    .klc-legend-row[data-hidden] .klc-legend-name > span { filter:grayscale(1); opacity:.55; }
    .klc-legend-frame { position:absolute; left:-5px; top:50%; transform:translateY(-50%);
      height:28px; box-sizing:border-box;
      display:none; align-items:center; justify-content:flex-end; padding:2px 3px;
      border:1px solid var(--klc-color-ui-border); border-radius:4px;
      background:color-mix(in srgb,var(--klc-color-ui-surface) 80%,transparent); z-index:-1; pointer-events:auto; }
    .klc-legend-actions { display:flex; align-items:center; gap:2px; }
    .klc-legend-row[data-actions]:hover, .klc-legend-row[data-actions]:focus-within { z-index:1; }
    .klc-legend-row:hover .klc-legend-frame, .klc-legend-row:focus-within .klc-legend-frame { display:flex; }
    .klc-legend-button { display:grid; place-items:center; flex:0 0 22px;
      width:22px; height:22px; padding:0; border:0; border-radius:3px;
      background:transparent; color:var(--klc-color-ui-text-soft); cursor:pointer; }
    .klc-legend-button:hover, .klc-legend-button:focus-visible {
      background:color-mix(in srgb,var(--klc-color-ui-text) 8%,transparent); outline:none; }
    .klc-legend-button:disabled { opacity:.3; cursor:default; }
    .klc-legend-button:disabled:hover { background:transparent; }
    .klc-legend-button > svg { display:block; width:14px; height:14px; overflow:visible; }
    .klc-legend-menu { position:absolute; z-index:12; display:flex; flex-direction:column; min-width:160px;
      padding:4px; border:1px solid var(--klc-color-ui-border); border-radius:6px;
      background:var(--klc-color-ui-surface); box-shadow:0 6px 20px rgba(0,0,0,.28); pointer-events:auto; }
    .klc-legend-menu[hidden] { display:none; }
    .klc-legend-menu-item { display:block; width:100%; padding:6px 10px; border:0; border-radius:4px;
      background:transparent; color:var(--klc-color-ui-text); font-family:${FONT_FAMILY}; font-size:12px;
      line-height:18px; text-align:left; white-space:nowrap; cursor:pointer; }
    .klc-legend-menu-item:hover, .klc-legend-menu-item:focus-visible {
      background:color-mix(in srgb,var(--klc-color-ui-text) 8%,transparent); outline:none; }
    .klc-legend-menu-item:disabled { opacity:.35; cursor:default; }
    .klc-legend-collapse { position:absolute; z-index:1; display:flex; align-items:center; gap:2px;
      height:${LEGEND_COLLAPSE_HEIGHT_PX}px; padding:0 2px; border:1px solid var(--klc-color-ui-border); border-radius:3px;
      background:var(--klc-color-ui-surface); color:var(--klc-color-ui-text-soft); cursor:pointer; pointer-events:auto; }
    .klc-legend-collapse[hidden] { display:none; }
    .klc-legend-collapse:hover, .klc-legend-collapse:focus-visible { outline:none; }
    .klc-legend-collapse > svg { display:block; width:14px; height:14px; overflow:visible; }
    .klc-legend-collapse-count { font-family:${FONT_FAMILY}; font-size:12px; line-height:1;
      color:var(--klc-color-ui-text-soft); }
    .klc-legend-collapse-count[hidden] { display:none; }
    .klc-legend-spinner { flex:0 0 12px; width:12px; height:12px; box-sizing:border-box; margin-inline:4px;
      border:2px solid currentColor; border-top-color:transparent; border-radius:50%;
      color:var(--klc-color-ui-text-soft); animation:klc-legend-spin 0.6s linear infinite; }
    .klc-legend-spinner[hidden] { display:none; }
    .klc-legend-error-banner { padding:1px 8px; border-radius:3px;
      background:color-mix(in srgb,var(--klc-color-ui-danger-background) 80%,transparent); color:var(--klc-color-ui-danger-text); }
    @keyframes klc-legend-spin { to { transform:rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .klc-legend-spinner { animation:none; } }
  `
  return style
}

/** 按 Core 发布的按钮集合创建 DOM，点击统一调用图例操作入口。 */
function addActions(
  document: Document,
  row: MountedRow,
  execute: (id: string, action: LegendAction) => LegendUiRequest | null,
  openMoveMenu: (
    id: string,
    anchor: HTMLElement,
    options: Extract<LegendUiRequest, { action: 'move-to' }>['options'],
  ) => void,
): void {
  // frame 以名称为定位容器，按钮紧跟名称，悬浮时覆盖后续参数且不改变文字坐标。
  const frame = document.createElement('div')
  frame.className = 'klc-legend-frame'
  frame.style.width = `calc(100% + ${row.data.actions.length * ACTION_BUTTON_STEP_PX + ACTION_FRAME_PADDING_PX}px)`
  const actions = document.createElement('div')
  actions.className = 'klc-legend-actions'
  for (const item of row.data.actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'klc-legend-button'
    button.title = item.label
    button.disabled = !item.enabled
    button.setAttribute('aria-label', item.label)
    const icon = document.createElementNS(SVG_NAMESPACE, 'svg')
    const image =
      item.action === 'toggle-visibility' && row.data.hidden ? eyeOff : ACTION_ICONS[item.action]
    icon.setAttribute('viewBox', `0 0 ${image.width ?? 24} ${image.height ?? 24}`)
    icon.setAttribute('aria-hidden', 'true')
    // 仅使用本地已安装图标包的完整 SVG 内容，不手工拆解或重绘图标。
    icon.innerHTML = image.body
    button.append(icon)
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const request = execute(row.data.key, item.action)
      if (!request) return
      if (request.action === 'move-to') {
        openMoveMenu(row.data.key, button, request.options)
        return
      }
      row.element.dispatchEvent(
        new CustomEvent(LEGEND_UI_EVENT, { bubbles: true, detail: request }),
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
  row.name.append(frame)
  row.actionFrame = frame
}

/** 创建 DOM renderer；收起状态由 Core 持有，渲染器只提交切换意图。 */
export function createLegendDomRenderer(
  host: HTMLElement,
  setMainCollapsed: (collapsed: boolean) => void,
  execute: (id: string, action: LegendAction) => LegendUiRequest | null,
  moveTo: (id: string, target: import('@/engine/pane/types.js').InstanceMoveTarget) => boolean,
): LegendDomRenderer {
  const document = host.ownerDocument
  const root = document.createElement('div')
  root.className = 'klc-legend-root'
  root.append(createStyles(document))
  host.append(root)
  const mounted = new Map<string, Map<string, MountedRow>>()

  // 最近一帧的主图收起结果；真正的状态在 Core，这里只用于显隐与按钮定位。
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
    setMainCollapsed(!mainCollapsed)
  })
  // 收起按钮阻止画布拖拽，点击不触发画布指针流程。
  for (const event of ['pointerdown', 'pointermove', 'dblclick']) {
    collapseButton.addEventListener(event, (event) => event.stopPropagation())
  }
  root.append(collapseButton)

  // 移动菜单由 Core DOM 绘制：目标列表来自布局命令面，宿主不参与推导。
  const moveMenu = document.createElement('div')
  moveMenu.className = 'klc-legend-menu'
  moveMenu.hidden = true
  // 菜单属于图例交互，不能进入画布的拖拽与指针捕获流程。
  // 否则 pointerup/click 被重定向到 chart-container，目标命令不会执行。
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'dblclick']) {
    moveMenu.addEventListener(type, (event) => event.stopPropagation())
  }
  root.append(moveMenu)
  let menuCleanup: (() => void) | null = null

  /** 关闭移动菜单并释放全局监听。 */
  function closeMoveMenu(): void {
    if (moveMenu.hidden) return
    moveMenu.hidden = true
    moveMenu.replaceChildren()
    menuCleanup?.()
    menuCleanup = null
  }

  /** 在按钮下方打开目标菜单；越界时贴住图表右缘。 */
  function openMoveMenu(
    id: string,
    anchor: HTMLElement,
    options: Extract<LegendUiRequest, { action: 'move-to' }>['options'],
  ): void {
    closeMoveMenu()
    const rootRect = root.getBoundingClientRect()
    const buttonRect = anchor.getBoundingClientRect()
    moveMenu.style.left = `${Math.max(0, buttonRect.left - rootRect.left)}px`
    moveMenu.style.top = `${buttonRect.bottom - rootRect.top + 4}px`
    for (const option of options) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'klc-legend-menu-item'
      item.textContent = option.label
      item.disabled = !option.enabled
      item.addEventListener('click', (event) => {
        event.stopPropagation()
        if (!option.enabled) return
        moveTo(id, option.target)
        closeMoveMenu()
      })
      moveMenu.append(item)
    }
    moveMenu.hidden = false
    const onPointer = (event: PointerEvent): void => {
      if (moveMenu.contains(event.target as Node)) return
      closeMoveMenu()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMoveMenu()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    menuCleanup = () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }

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
    closeMoveMenu()
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

  /** 移除已不在当前 Pane 顺序中的行容器。 */
  function prunePanes(paneOrder: ReadonlyArray<string>): void {
    for (const [id, entries] of mounted) {
      if (paneOrder.includes(id)) continue
      for (const row of entries.values()) row.element.remove()
      mounted.delete(id)
    }
  }

  /** 取当前 Pane 的行表，并按最新 key 集合清理失效行。 */
  function pruneRows(paneId: string, rows: ReadonlyArray<LegendRow>): Map<string, MountedRow> {
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
    return entries
  }

  /** 新建一行 DOM，并挂载按钮与指针隔离。 */
  function createRow(data: LegendRow): MountedRow {
    const element = document.createElement('div')
    element.className = 'klc-legend-row'
    const name = document.createElement('div')
    name.className = 'klc-legend-name'
    const text = document.createElement('div')
    text.className = 'klc-legend-text'
    const spinner = document.createElement('span')
    spinner.className = 'klc-legend-spinner'
    spinner.setAttribute('aria-hidden', 'true')
    spinner.hidden = data.loading !== true
    const errorBanner = document.createElement('div')
    errorBanner.className = 'klc-legend-error-banner'
    errorBanner.setAttribute('role', 'status')
    element.append(name, text)
    const row: MountedRow = {
      element,
      name,
      text,
      spinner,
      errorBanner,
      spans: [],
      nodes: [],
      buttons: [],
      data,
    }
    if (data.indicator) element.dataset.indicator = data.indicator.instanceId
    if (data.comparison) element.dataset.comparison = data.comparison.identity
    if (data.actions.length) {
      element.toggleAttribute('data-actions', true)
      addActions(document, row, execute, openMoveMenu)
    }
    // 能力集合后续可变化，行节点始终隔离画布指针流程。
    for (const event of ['pointerdown', 'pointermove', 'dblclick']) {
      element.addEventListener(event, (event) => event.stopPropagation())
    }
    // 收起期间新建的行同样保持隐藏，避免展开前闪出。
    if (data.paneId === MAIN_PANE_ID && mainCollapsed) element.style.display = 'none'
    root.append(element)
    return row
  }

  /** 按钮集合变化时重建操作区，保持与文本 DOM 解耦。 */
  function syncActions(row: MountedRow, data: LegendRow): void {
    const previous = row.data
    const changed =
      previous.actions.length !== data.actions.length ||
      previous.actions.some((action, index) => action.action !== data.actions[index]?.action)
    if (!changed) return
    row.actionFrame?.remove()
    row.actionFrame = undefined
    row.buttons = []
    row.visibilityButton = undefined
    row.visibilityIcon = undefined
    // addActions 依据行上最新的按钮集合创建 DOM。
    row.data = data
    row.element.toggleAttribute('data-actions', data.actions.length > 0)
    if (data.actions.length) addActions(document, row, execute, openMoveMenu)
  }

  /** 写入行几何与加载态；maxWidth 预留按钮区宽度。 */
  function syncGeometry(row: MountedRow, data: LegendRow): void {
    const actionWidth = data.actions.length
      ? data.actions.length * ACTION_BUTTON_STEP_PX + ACTION_FRAME_PADDING_PX
      : 0
    applyStyle(row.element.style, 'left', `${data.x}px`)
    applyStyle(row.element.style, 'top', `${data.y}px`)
    applyStyle(row.element.style, 'maxWidth', `${Math.max(0, data.maxWidth - actionWidth)}px`)
    applyStyle(row.element.style, 'minHeight', `${data.height}px`)
    const loading = data.loading === true
    if (row.spinner.hidden === loading) row.spinner.hidden = !loading
  }

  /** 差量同步文本片段：复用 span 与文本节点，只写变化的样式。 */
  function syncTexts(row: MountedRow, data: LegendRow, previous: LegendRow): void {
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
        if (index === 0) row.name.prepend(span)
        else row.text.append(span)
      }
      const node = row.nodes[index]!
      if (node.data !== segment.text) node.data = segment.text
      if (created || previous.texts[index]?.color !== segment.color)
        span.style.color = segment.color
      // 间距由行投影解析成每段的最终值，renderer 不按下标推断。
      const marginLeft = index === 0 ? '' : `${segment.gapBefore}px`
      if (span.style.marginLeft !== marginLeft) span.style.marginLeft = marginLeft
    }
    // 加载圈始终跟在文本（含参数）之后；span 增删后再校正顺序。
    if (data.error) {
      if (
        row.text.lastElementChild !== row.errorBanner ||
        row.errorBanner.previousElementSibling !== row.spinner
      )
        row.text.append(row.spinner, row.errorBanner)
    } else {
      row.errorBanner.remove()
      if (row.text.lastElementChild !== row.spinner) row.text.append(row.spinner)
    }
  }

  /** 同步隐藏态、按钮标签与可用性、显隐图标。 */
  function syncState(row: MountedRow, data: LegendRow, previous: LegendRow): void {
    const message = data.error ?? ''
    if (row.errorBanner.textContent !== message) row.errorBanner.textContent = message
    const hidden = data.hidden === true
    if (row.element.hasAttribute('data-hidden') !== hidden)
      row.element.toggleAttribute('data-hidden', hidden)
    for (const [index, action] of data.actions.entries()) {
      const button = row.buttons[index]!
      if (button.title !== action.label) {
        button.title = action.label
        button.setAttribute('aria-label', action.label)
      }
      if (button.disabled === action.enabled) button.disabled = !action.enabled
    }
    if (row.visibilityIcon && previous.hidden !== data.hidden) {
      row.visibilityIcon.innerHTML = (
        hidden ? VISIBILITY_ICONS.hidden : VISIBILITY_ICONS.visible
      ).body
    }
  }

  /** 主图行就绪后更新收起按钮的位置、可见性与计数。 */
  function syncMainCollapse(rows: ReadonlyArray<LegendRow>, canCollapse: boolean): void {
    const first = rows[0]
    const last = rows[rows.length - 1]
    mainIndicatorCount = rows.filter((row) => row.indicator).length
    // 只有在 Core 判定可收起且确实有行时才展示入口，空图不显示展开/收起。
    const enable = canCollapse && first !== undefined && last !== undefined
    if (collapseButton.hidden === enable) collapseButton.hidden = !enable
    if (enable) {
      // 收起按钮与首行文本垂直居中；展开时落在末行行盒下方。
      firstRowTop = `${first.y + (first.height - LEGEND_COLLAPSE_HEIGHT_PX) / 2}px`
      lastRowBottom = `${last.y + last.height + COLLAPSE_GAP_PX}px`
      applyStyle(collapseButton.style, 'left', `${first.x}px`)
    } else {
      firstRowTop = null
      lastRowBottom = null
    }
    applyCollapseState()
  }

  return {
    update(frame: LegendDomFrame) {
      mainCollapsed = frame.mainCollapsed
      prunePanes(frame.rowsByPane.map((pane) => pane.paneId))
      let mainRows: ReadonlyArray<LegendRow> = []
      for (const { paneId, rows } of frame.rowsByPane) {
        const entries = pruneRows(paneId, rows)
        for (const data of rows) {
          let row = entries.get(data.key)
          if (!row) {
            row = createRow(data)
            entries.set(data.key, row)
          }
          const previous = row.data
          syncActions(row, data)
          syncGeometry(row, data)
          syncTexts(row, data, previous)
          syncState(row, data, previous)
          row.data = data
        }
        if (paneId === MAIN_PANE_ID) mainRows = rows
      }
      syncMainCollapse(mainRows, frame.canCollapse)
    },
    clear,
    dispose() {
      clear()
      root.remove()
    },
  }
}
