/** 菜单测试共用的键盘事件派遣：冒泡到菜单面板才说明焦点真的落在菜单里。 */

/** 向目标派发可冒泡的键盘事件。 */
export function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}
