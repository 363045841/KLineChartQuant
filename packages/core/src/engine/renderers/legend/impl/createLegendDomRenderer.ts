/** 独立 DOM Legend renderer：复用节点、差量写入，不经框架响应式状态。 */
import arrowDown from '@iconify-icons/tabler/arrow-down'
import arrowUp from '@iconify-icons/tabler/arrow-up'
import eye from '@iconify-icons/tabler/eye'
import eyeOff from '@iconify-icons/tabler/eye-off'
import refresh from '@iconify-icons/tabler/refresh'
import x from '@iconify-icons/tabler/x'
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
  { action: 'close', label: '关闭指标', icon: x },
]
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
/** 五个操作按钮所需的 frame 右侧扩展宽度。 */
const FRAME_EXTRA_WIDTH_PX = 130

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

/** 创建图表拥有的 DOM renderer，只在结构变化时创建或移除节点。 */
export function createLegendDomRenderer(host: HTMLElement): LegendDomRenderer {
  const document = host.ownerDocument
  const root = document.createElement('div')
  root.className = 'klc-legend-root'
  root.append(createStyles(document))
  host.append(root)
  const mounted = new Map<string, Map<string, MountedRow>>()

  /** 清理全部标题节点，保留容器及主题样式。 */
  function clear(): void {
    for (const rows of mounted.values()) for (const row of rows.values()) row.element.remove()
    mounted.clear()
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
            paneId === 'main'
              ? indicatorRows.map((row) => row.key)
              : paneOrder.filter((id) => id !== 'main')
          const index = order.indexOf(paneId === 'main' ? data.key : paneId)
          const upDisabled = index <= 0
          const downDisabled = index < 0 || index >= order.length - 1
          if (row.buttons[0]!.disabled !== upDisabled) row.buttons[0]!.disabled = upDisabled
          if (row.buttons[1]!.disabled !== downDisabled) row.buttons[1]!.disabled = downDisabled
        }
        row.data = data
      }
    },
    clear,
    dispose() {
      clear()
      root.remove()
    },
  }
}
