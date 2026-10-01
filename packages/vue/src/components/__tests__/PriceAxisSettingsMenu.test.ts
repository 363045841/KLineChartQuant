// 验证价格轴设置菜单的快捷按钮渲染、切换写入与菜单内当前模式勾选。
import { type ChartSettings, ScaleType } from '@363045841yyt/klinechart-core/config'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createMockChartController } from '../../__tests__/_mockController'
import PriceAxisSettingsMenu from '../PriceAxisSettingsMenu.vue'

/** 以给定设置挂载菜单组件。 */
function mountMenu(settings: ChartSettings) {
  const controller = createMockChartController()
  controller._setSettings(settings)
  const wrapper = mount(PriceAxisSettingsMenu, {
    props: { controller, height: 200 },
    attachTo: document.body,
  })
  return { wrapper }
}

/** 在展开的菜单面板内按文本取条目。 */
function menuItem(label: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>('.drop-menu__item')].find(
    (el) => el.querySelector('.drop-menu__item-main')?.textContent?.trim() === label,
  )
  if (!item) throw new Error(`missing menu item: ${label}`)
  return item
}

describe('价格轴设置菜单', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染三个快捷按钮并标记当前轴类型', () => {
    const { wrapper } = mountMenu({ mainRightAxisTypeSetting: ScaleType.Log })
    const buttons = wrapper.findAll('.price-axis-shortcuts button')
    expect(buttons.map((button) => button.text())).toEqual(['A', 'L', '%'])
    expect(buttons.map((button) => button.attributes('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ])
    wrapper.unmount()
  })

  it('点击快捷按钮按当前设置快照写出轴类型', async () => {
    const { wrapper } = mountMenu({
      mainRightAxisTypeSetting: ScaleType.Linear,
      priceAxisPosition: 'left',
    })
    await wrapper.findAll('.price-axis-shortcuts button')[2]!.trigger('click')
    expect(wrapper.emitted('settings-change')).toEqual([
      [{ mainRightAxisTypeSetting: ScaleType.Percent, priceAxisPosition: 'left' }],
    ])
    wrapper.unmount()
  })

  it('菜单中仅当前轴类型与摆放位置显示勾选', async () => {
    const { wrapper } = mountMenu({
      mainRightAxisTypeSetting: ScaleType.Log,
      priceAxisPosition: 'right',
    })
    await wrapper.get('.axis-settings-button').trigger('click')
    await nextTick()

    expect(menuItem('对数').querySelector('.price-axis-menu-check')).not.toBeNull()
    expect(menuItem('价格').querySelector('.price-axis-menu-check')).toBeNull()
    expect(menuItem('右侧').querySelector('.price-axis-menu-check')).not.toBeNull()
    expect(menuItem('左侧').querySelector('.price-axis-menu-check')).toBeNull()

    wrapper.unmount()
  })
})
