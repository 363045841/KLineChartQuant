/** 编辑器底部工具面板：Tab 切换、拖拽高度及输出跟随滚动。 */

import type { LogEvent } from '@363045841yyt/klinechart-plot-contracts'
import { nextTick, onMounted, onScopeDispose, type Ref, ref, watch } from 'vue'

/** 绑定输出列表；用户向上阅读历史时保留当前位置。 */
export function useScriptEditorPanels(
  host: Readonly<Ref<HTMLElement | null>>,
  separator: Readonly<Ref<HTMLElement | null>>,
  panelHost: Readonly<Ref<HTMLElement | null>>,
  logs: () => readonly LogEvent[],
) {
  const expanded = ref(true)
  const activePanel = ref<'output' | 'problems'>('output')
  const scrollPositions = { output: 0, problems: 0 }
  const height = ref(160)
  const minHeight = 48
  const minEditorHeight = 80
  const maxHeight = ref(160)
  const dragging = ref(false)
  let drag: { pointerId: number; startY: number; startHeight: number } | undefined
  let observer: ResizeObserver | undefined
  let follow = true

  /** 切换工具页并展开，分别保留输出和问题列表的阅读位置。 */
  function selectPanel(panel: 'output' | 'problems'): void {
    if (host.value) scrollPositions[activePanel.value] = host.value.scrollTop
    activePanel.value = panel
    expanded.value = true
  }

  /** Tab 支持左右方向键、Home 和 End，并把焦点移到所选标签。 */
  function onTabKeyDown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const panel =
      event.key === 'Home'
        ? 'output'
        : event.key === 'End'
          ? 'problems'
          : activePanel.value === 'output'
            ? 'problems'
            : 'output'
    selectPanel(panel)
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-panel="${panel}"]`)
        ?.focus()
  }

  watch(activePanel, async (panel) => {
    await nextTick()
    const element = host.value
    if (element)
      element.scrollTop =
        panel === 'output' && follow ? element.scrollHeight : scrollPositions[panel]
  })

  /** 输出区只使用编辑区之外的可用高度，窗口缩小时仍保留代码操作空间。 */
  function updateBounds(): void {
    const content = host.value
    const panel = panelHost.value
    const workspace = panel?.parentElement
    if (!expanded.value || !content || !panel || !workspace) return
    const occupied = Array.from(workspace.children)
      .filter((element) => element !== panel && !element.classList.contains('script-editor'))
      .reduce((total, element) => total + element.getBoundingClientRect().height, 0)
    const panelChrome = panel.getBoundingClientRect().height - height.value
    maxHeight.value = Math.max(
      minHeight,
      workspace.clientHeight - occupied - panelChrome - minEditorHeight,
    )
    height.value = Math.max(minHeight, Math.min(height.value, maxHeight.value))
  }

  /** 指针捕获使拖出分隔条后仍能连续调整，松开时由浏览器释放。 */
  function startResize(event: PointerEvent): void {
    if (event.button !== 0 || !expanded.value || !separator.value || !host.value) return
    event.preventDefault()
    updateBounds()
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: host.value.getBoundingClientRect().height,
    }
    separator.value.setPointerCapture(event.pointerId)
    dragging.value = true
  }

  /** 向上拖动增高输出区，向下拖动缩小输出区。 */
  function resize(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    height.value = Math.max(
      minHeight,
      Math.min(maxHeight.value, drag.startHeight + drag.startY - event.clientY),
    )
  }

  /** 完成、取消或丢失捕获时统一结束拖拽。 */
  function stopResize(): void {
    const pointerId = drag?.pointerId
    drag = undefined
    dragging.value = false
    if (pointerId !== undefined && separator.value?.hasPointerCapture(pointerId))
      separator.value.releasePointerCapture(pointerId)
  }

  /** 分隔条也支持方向键微调，Home / End 跳到高度边界。 */
  function resizeWithKeyboard(event: KeyboardEvent): void {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    updateBounds()
    const next =
      event.key === 'Home'
        ? minHeight
        : event.key === 'End'
          ? maxHeight.value
          : height.value + (event.key === 'ArrowUp' ? 16 : -16)
    height.value = Math.max(minHeight, Math.min(maxHeight.value, next))
  }

  onMounted(() => {
    updateBounds()
    const workspace = panelHost.value?.parentElement
    if (!workspace) return
    observer = new ResizeObserver(updateBounds)
    observer.observe(workspace)
  })
  onScopeDispose(() => {
    stopResize()
    observer?.disconnect()
  })
  /** 在用户滚动后更新是否跟随最新输出。 */
  function onScroll(): void {
    const element = host.value
    if (!element) return
    scrollPositions[activePanel.value] = element.scrollTop
    if (activePanel.value === 'output')
      follow = element.scrollHeight - element.scrollTop - element.clientHeight < 24
  }
  watch(
    [logs, expanded],
    async () => {
      await nextTick()
      updateBounds()
      const element = host.value
      if (element && follow && activePanel.value === 'output')
        element.scrollTop = element.scrollHeight
    },
    { flush: 'post' },
  )
  return {
    expanded,
    activePanel,
    selectPanel,
    onTabKeyDown,
    height,
    minHeight,
    maxHeight,
    dragging,
    onScroll,
    startResize,
    resize,
    stopResize,
    resizeWithKeyboard,
  }
}
