/** 验证共用菜单自己持有焦点与键盘：打开聚焦首个可用项，Escape/Tab 关闭并归还焦点。 */
import { afterEach, describe, expect, it } from 'vitest'
import { createScriptMenu, type ScriptMenu } from '../impl/scriptMenu.js'
import { press } from './helpers/menuEvents.js'

let menu: ScriptMenu | undefined

/** 建立挂载点与触发按钮，还原菜单打开前的焦点位置。 */
function setup(): HTMLButtonElement {
  const host = document.createElement('div')
  const trigger = document.createElement('button')
  trigger.textContent = '触发'
  host.append(trigger)
  document.body.append(host)
  trigger.focus()
  menu = createScriptMenu(document, { host })
  return trigger
}

afterEach(() => {
  menu?.destroy()
  menu = undefined
  document.body.replaceChildren()
})

describe('脚本菜单焦点与键盘', () => {
  it('打开后聚焦第一个可用项，关闭时把焦点还给打开前的元素', () => {
    const trigger = setup()
    menu!.open(10, 10)
    menu!.button('禁用项', () => {}, { disabled: true })
    const enabled = menu!.button('可用项', () => {})

    expect(document.activeElement).toBe(enabled)

    menu!.close()
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape 关闭菜单、归还焦点且不再冒泡给宿主弹窗', () => {
    const trigger = setup()
    menu!.open(10, 10)
    const item = menu!.button('项', () => {})
    const bubbled: string[] = []
    const listener = (event: Event) => bubbled.push((event as KeyboardEvent).key)
    document.addEventListener('keydown', listener)
    try {
      press(item, 'Escape')
    } finally {
      document.removeEventListener('keydown', listener)
    }

    expect(menu!.isOpen).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(bubbled).toEqual([])
  })

  it('Tab 关闭菜单并把焦点交回打开前的元素', () => {
    const trigger = setup()
    menu!.open(10, 10)
    const item = menu!.button('项', () => {})

    press(item, 'Tab')

    expect(menu!.isOpen).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('方向键在可用项之间移动焦点', () => {
    setup()
    menu!.open(10, 10)
    const first = menu!.button('第一项', () => {})
    const second = menu!.button('第二项', () => {})

    expect(document.activeElement).toBe(first)
    press(first, 'ArrowDown')
    expect(document.activeElement).toBe(second)
    press(second, 'ArrowDown')
    expect(document.activeElement).toBe(first)
  })

  it('没有按钮的状态消息仍能用键盘关闭', () => {
    const trigger = setup()
    menu!.open(10, 10)
    menu!.message('未找到目标')

    expect(document.activeElement).toBe(menu!.element)

    press(menu!.element, 'Escape')
    expect(document.activeElement).toBe(trigger)
  })
})
