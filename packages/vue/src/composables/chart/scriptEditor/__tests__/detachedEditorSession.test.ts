/** 验证宿主与独立页面的交接、失败恢复、保存反馈及最终草稿接收。 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { useScriptEditor } from '../../useScriptEditor.js'
import { useScriptEditorWindow } from '../../useScriptEditorWindow.js'
import type { DetachedWindow } from '../impl/detachedWindow.js'
import type { DetachedEditorEvent } from '../windowTypes.js'

const transport = vi.hoisted(() => ({
  open: vi.fn<
    (
      title: string,
      host: HTMLElement | null,
      receive: (message: DetachedEditorEvent) => void,
    ) => DetachedWindow
  >(),
}))

vi.mock('../impl/detachedWindow.js', () => ({
  supportsDetachedWindow: () => true,
  openDetachedWindow: transport.open,
}))

const mounted: Array<ReturnType<typeof createApp>> = []

/** 使用真实编辑会话，替换浏览器传输边界以控制页面就绪和消息到达顺序。 */
function mountSession() {
  let resolveReady: () => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  let receive: (message: DetachedEditorEvent) => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const update = vi.fn<DetachedWindow['update']>()
  const dispose = vi.fn()
  transport.open.mockImplementation((_title, _host, listener) => {
    receive = listener
    return { window, ready, update, dispose }
  })
  let state!: {
    session: ReturnType<typeof useScriptEditor>
    detached: ReturnType<typeof useScriptEditorWindow>
  }
  const app = createApp({
    setup() {
      const session = useScriptEditor(undefined)
      session.openBlank()
      const detached = useScriptEditorWindow(session, ref(document.body), ref<'light' | 'dark'>('dark'))
      state = { session, detached }
      return () => h('div')
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  mounted.push(app)
  return {
    ...state,
    update,
    dispose,
    resolveReady,
    rejectReady,
    receive: (message: DetachedEditorEvent) => receive(message),
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount()
  document.body.replaceChildren()
})

describe('独立编辑器宿主交接', () => {
  it('同步输出快照，清空输出不会改动正在编辑的草稿', async () => {
    const context = mountSession()
    const opening = context.detached.open('新建脚本')
    context.resolveReady()
    await opening
    context.session.logs.value = [
      { kind: 'log', level: 'warn', time: 1, barIndex: 2, message: 'output' },
    ]
    await nextTick()
    expect(context.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ logs: context.session.logs.value }),
    )
    context.session.source.value = 'local draft'
    context.receive({ type: 'clear-output' })
    await nextTick()
    expect(context.session.logs.value).toEqual([])
    expect(context.session.source.value).toBe('local draft')
  })
  it('页面就绪前保留弹窗，交接初始化期间的最新草稿', async () => {
    const context = mountSession()
    const opening = context.detached.open('新建脚本')
    expect(context.session.open.value).toBe(true)
    context.session.source.value = 'const latest = 42'
    context.resolveReady()
    await opening
    expect(context.session.open.value).toBe(false)
    expect(context.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'const latest = 42' }),
    )
  })

  it('启动失败后保留原弹窗和草稿，释放失败窗口', async () => {
    const context = mountSession()
    context.session.source.value = 'const draft = 1'
    const opening = context.detached.open('新建脚本')
    const rejected = expect(opening).rejects.toThrow('入口加载失败')
    context.rejectReady(new Error('入口加载失败'))
    await rejected
    expect(context.dispose).toHaveBeenCalledOnce()
    expect(context.session.open.value).toBe(true)
    expect(context.session.source.value).toBe('const draft = 1')
  })

  it('拒绝旧版本草稿，返回时接收命令携带的最终文本和信任状态', async () => {
    const context = mountSession()
    const opening = context.detached.open('新建脚本')
    context.resolveReady()
    await opening
    const activeTabId = context.session.activeTabId.value
    context.receive({ type: 'draft', activeTabId, source: 'newer', trusted: false, editVersion: 2 })
    context.receive({ type: 'draft', activeTabId, source: 'older', trusted: true, editVersion: 1 })
    expect(context.session.source.value).toBe('newer')
    expect(context.session.trusted.value).toBe(false)
    context.receive({ type: 'return', activeTabId, source: 'final', trusted: true, editVersion: 3 })
    await nextTick()
    expect(context.session.source.value).toBe('final')
    expect(context.session.trusted.value).toBe(true)
    expect(context.session.open.value).toBe(true)
    expect(context.dispose).toHaveBeenCalledOnce()
  })

  it('标签导航携带离开前的最终输入，旧标签消息不覆盖新标签', async () => {
    const context = mountSession()
    const first = context.session.activeTabId.value
    context.session.openBlank('library')
    const second = context.session.activeTabId.value!
    const opening = context.detached.open('编辑脚本')
    context.resolveReady()
    await opening
    context.receive({ type: 'select-tab', id: first!, activeTabId: second, source: 'library final', trusted: false, editVersion: 1 })
    expect(context.session.activeTabId.value).toBe(first)
    context.receive({ type: 'draft', activeTabId: second, source: 'late library', trusted: true, editVersion: 2 })
    expect(context.session.source.value).toBe('')
    context.receive({ type: 'select-tab', id: second, activeTabId: first, source: 'indicator final', trusted: false, editVersion: 3 })
    expect(context.session.source.value).toBe('library final')
    await nextTick()
    expect(context.dispose).not.toHaveBeenCalled()
  })

  it('保存直接提交消息中的最新草稿，并将实际会话错误反馈给新页面', async () => {
    const context = mountSession()
    const opening = context.detached.open('新建脚本')
    context.resolveReady()
    await opening
    context.receive({ type: 'save', activeTabId: context.session.activeTabId.value, source: 'latest', trusted: false, editVersion: 1 })
    await flushPromises()
    expect(context.session.source.value).toBe('latest')
    expect(context.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'latest',
        error: '此环境没有可编辑的脚本服务',
        editVersion: 1,
      }),
    )
  })
})
