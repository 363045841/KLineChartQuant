/** BaseTabs 横向滚动：标签溢出时接管滚轮，未溢出或已到边界时放行页面滚动。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseTabs from './BaseTabs.vue'

const tabs = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
]

/** happy-dom 没有布局，用显式宽度声明标签条是否溢出。 */
function setScrollMetrics(nav: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(nav, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(nav, 'clientWidth', { value: clientWidth, configurable: true })
}

function mountTabs() {
  return mount(BaseTabs, { attachTo: document.body, props: { modelValue: 'a', tabs } })
}

function wheelOn(nav: HTMLElement, deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true })
  nav.dispatchEvent(event)
  return event
}

describe('BaseTabs 横向滚动', () => {
  it('溢出时把滚轮增量写入 scrollLeft 并拦截默认滚动', () => {
    const wrapper = mountTabs()
    try {
      const nav = wrapper.get('nav').element as HTMLElement
      setScrollMetrics(nav, 600, 200)

      expect(wheelOn(nav, 120).defaultPrevented).toBe(true)
      expect(nav.scrollLeft).toBe(120)
    } finally {
      wrapper.unmount()
    }
  })

  it('未溢出时不拦截滚轮，交给页面滚动', () => {
    const wrapper = mountTabs()
    try {
      const nav = wrapper.get('nav').element as HTMLElement
      setScrollMetrics(nav, 200, 200)

      expect(wheelOn(nav, 120).defaultPrevented).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('已滚到右边界后放行滚轮', () => {
    const wrapper = mountTabs()
    try {
      const nav = wrapper.get('nav').element as HTMLElement
      setScrollMetrics(nav, 600, 200)
      nav.scrollLeft = 400

      expect(wheelOn(nav, 120).defaultPrevented).toBe(false)
      expect(nav.scrollLeft).toBe(400)
    } finally {
      wrapper.unmount()
    }
  })
})
