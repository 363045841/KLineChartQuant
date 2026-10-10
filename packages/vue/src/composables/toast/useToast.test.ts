/** Toast + Undo：计时、暂停、撤销、延迟提交、视口优先级与 live region。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import ToastViewport from '../../components/common/ToastViewport.vue'
import { createToastStore, provideToast, type ToastStore, useToast } from './useToast.js'

describe('createToastStore', () => {
  it('到时自动关闭，原因 timeout', () => {
    vi.useFakeTimers()
    const store = createToastStore()
    const onDismiss = vi.fn()
    store.show({ message: '已保存', timeout: 1000, onDismiss })
    expect(store.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(999)
    expect(store.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.toasts.value).toHaveLength(0)
    expect(onDismiss).toHaveBeenCalledWith('timeout')
  })

  it('暂停期间不计时，恢复后只走剩余时间', () => {
    vi.useFakeTimers()
    const store = createToastStore()
    store.show({ message: 'x', timeout: 1000 })
    vi.advanceTimersByTime(600)
    store.pause('hover')
    vi.advanceTimersByTime(5000)
    expect(store.toasts.value).toHaveLength(1)
    store.resume('hover')
    vi.advanceTimersByTime(399)
    expect(store.toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store.toasts.value).toHaveLength(0)
  })

  it('showUndo：未撤销时提交，撤销时不提交', () => {
    vi.useFakeTimers()
    const store = createToastStore()
    const onUndo = vi.fn()
    const onCommit = vi.fn()
    store.showUndo({ message: '已删除', onUndo, onCommit, timeout: 1000 })
    vi.advanceTimersByTime(1000)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onUndo).not.toHaveBeenCalled()

    const commit2 = vi.fn()
    const handle = store.showUndo({ message: '已删除', onUndo, onCommit: commit2 })
    expect(store.toasts.value[0]?.action?.label).toBe('撤销')
    store.dismiss(handle.id, 'action')
    expect(commit2).not.toHaveBeenCalled()
  })

  it('超过上限时挤出最旧的（replaced），同 id 替换', () => {
    const store = createToastStore({ max: 2 })
    const first = vi.fn()
    store.show({ message: '1', onDismiss: first })
    store.show({ message: '2', id: 'same' })
    store.show({ message: '3' })
    expect(first).toHaveBeenCalledWith('replaced')
    store.show({ message: '2b', id: 'same' })
    expect(store.toasts.value.map((toast) => toast.message)).toEqual(['3', '2b'])
  })

  it('timeout <= 0 时常驻', () => {
    vi.useFakeTimers()
    const store = createToastStore()
    store.show({ message: 'sticky', timeout: 0 })
    vi.advanceTimersByTime(60_000)
    expect(store.toasts.value).toHaveLength(1)
  })
})

describe('ToastViewport', () => {
  it('isolates independent component scopes and commits pending work on disposal', () => {
    const first = createToastStore()
    const second = createToastStore()
    const onCommit = vi.fn()
    const Host = defineComponent({
      props: { second: Boolean },
      setup(props) {
        provideToast(props.second ? second : first)
        useToast().showUndo({
          message: props.second ? 'second' : 'first',
          onUndo: vi.fn(),
          onCommit,
        })
        return () => h('div')
      },
    })
    const left = mount(Host)
    const right = mount(Host, { props: { second: true } })
    expect(first.toasts.value.map((item) => item.message)).toEqual(['first'])
    expect(second.toasts.value.map((item) => item.message)).toEqual(['second'])
    left.unmount()
    expect(first.toasts.value).toHaveLength(0)
    expect(second.toasts.value).toHaveLength(1)
    expect(onCommit).toHaveBeenCalledOnce()
    right.unmount()
  })
  function mountWithStore(store: ToastStore, children: () => unknown) {
    const Host = defineComponent({
      setup() {
        provideToast(store)
        return children
      },
    })
    return mount(Host, { attachTo: document.body })
  }

  it('渲染 aria-live=polite 区域；点击撤销调用 onAction 并关闭', async () => {
    const store = createToastStore()
    const wrapper = mountWithStore(store, () => h(ToastViewport))
    await nextTick()
    const onUndo = vi.fn()
    store.showUndo({ message: '已删除预警', onUndo })
    await nextTick()
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toContain('已删除预警')
    const action = document.querySelector<HTMLButtonElement>('.klc-toast__action')
    expect(action?.textContent?.trim()).toBe('撤销')
    action?.click()
    await nextTick()
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(store.toasts.value).toHaveLength(0)
    wrapper.unmount()
  })

  it('多个视口时只有最后挂载的渲染（模态内视口优先）', async () => {
    const store = createToastStore()
    const wrapper = mountWithStore(store, () =>
      h('div', [h(ToastViewport, { id: 'outer' }), h('div', [h(ToastViewport, { id: 'inner' })])]),
    )
    await nextTick()
    store.show({ message: 'hello' })
    await nextTick()
    const regions = document.querySelectorAll('.klc-toast-viewport')
    expect(regions).toHaveLength(1)
    expect(regions[0]?.id).toBe('inner')
    wrapper.unmount()
  })

  it('useToast() 可在组件外调用（默认 store）', () => {
    const api = useToast()
    const handle = api.show({ message: 'outside' })
    expect(api.toasts.value.some((toast) => toast.id === handle.id)).toBe(true)
    handle.dismiss()
    expect(api.toasts.value.some((toast) => toast.id === handle.id)).toBe(false)
  })
})
