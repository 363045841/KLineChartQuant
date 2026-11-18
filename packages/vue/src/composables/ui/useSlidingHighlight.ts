/**
 * 滑动高亮的统一事件委托：宿主只声明“指针/焦点命中哪一行”，其余移动与隐藏逻辑共用。
 *
 * 高亮块自身位于 `components/common/SlidingHighlight.vue`；本 composable 只负责
 * `pointerover` / `focusin` 到目标条目的映射，避免每个列表各写一套。
 */

import type { Ref } from 'vue'

/** SlidingHighlight 暴露的实例能力；与组件 defineExpose 结构一致。 */
export interface SlidingHighlightHandle {
  moveTo(target: HTMLElement): void
  hide(): void
}

/** 把事件目标解析成需要高亮的条目；返回 null 表示收起高亮。 */
export type SlidingHighlightResolver = (target: Element) => HTMLElement | null

/**
 * 创建滑动高亮的事件处理。
 *
 * @param highlight 面板内唯一的 SlidingHighlight 实例
 * @param resolve 事件目标到条目元素的映射；非条目返回 null
 * @returns 指针、焦点事件处理与手动收起
 */
export function useSlidingHighlight(
  highlight: Readonly<Ref<SlidingHighlightHandle | null>>,
  resolve: SlidingHighlightResolver,
) {
  function targetOf(event: Event): HTMLElement | null {
    const target = event.target instanceof Element ? event.target : null
    return target ? resolve(target) : null
  }

  function onPointerOver(event: PointerEvent): void {
    const target = targetOf(event)
    if (target) highlight.value?.moveTo(target)
    else highlight.value?.hide()
  }

  function onFocusIn(event: FocusEvent): void {
    const target = targetOf(event)
    if (target) highlight.value?.moveTo(target)
    else highlight.value?.hide()
  }

  function hide(): void {
    highlight.value?.hide()
  }

  return { onPointerOver, onFocusIn, hide }
}
