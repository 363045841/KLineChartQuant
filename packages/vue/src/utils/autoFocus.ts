/** 挂载即聚焦的通用指令；传 'select' 时同时全选输入框内容。 */
import type { Directive } from 'vue'

export const vAutoFocus: Directive<HTMLElement, 'select' | undefined> = {
  mounted(element, binding) {
    element.focus()
    if (binding.value === 'select' && element instanceof HTMLInputElement) element.select()
  },
}
