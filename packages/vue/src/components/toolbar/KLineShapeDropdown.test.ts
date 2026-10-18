/** K 线形态下拉：能力不足的形态置灰，其余形态保持可选。 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import KLineShapeDropdown from './KLineShapeDropdown.vue'

async function flush(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** 打开菜单后按文案取条目按钮；面板 Teleport 到 body，故从文档查询。 */
async function openMenu(props: Record<string, unknown>) {
  const wrapper = mount(KLineShapeDropdown, { attachTo: document.body, props })
  const trigger = wrapper.get('button').element as HTMLButtonElement
  trigger.click()
  await flush()
  const items = [...document.querySelectorAll<HTMLButtonElement>('.drop-menu__item-main')]
  return {
    wrapper,
    /** 按选项文案取按钮；缺失即抛错，避免断言静默通过。 */
    item: (label: string): HTMLButtonElement => {
      const found = items.find((element) => element.textContent?.trim() === label)
      if (!found) throw new Error(`形态选项不存在：${label}`)
      return found
    },
  }
}

describe('KLineShapeDropdown', () => {
  it('品种不支持足迹图时该项置灰，其他形态仍可选', async () => {
    const { wrapper, item } = await openMenu({ modelValue: 'candlestick', disabledValues: ['footprint'] })
    expect(item('足迹图').disabled).toBe(true)
    expect(item('实心 K 线').disabled).toBe(false)
    wrapper.unmount()
  })

  it('未声明禁用形态时全部可选', async () => {
    const { wrapper, item } = await openMenu({ modelValue: 'candlestick' })
    expect(item('足迹图').disabled).toBe(false)
    wrapper.unmount()
  })
})
