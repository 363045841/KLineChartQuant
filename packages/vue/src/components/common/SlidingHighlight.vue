<!--
  滑动高亮块：跟随指针/焦点在相邻条目之间平滑移动，而不是逐项淡入淡出。

  宿主契约（违反只会静默变丑，不会报错）：
  1. 容器必须是定位元素，且高亮块与条目处在同一滚动内容内，块才会随内容一起滚动；
  2. 条目必须 position: relative + z-index: 1，否则绝对定位的块会盖住文字；
  3. 条目不要再画自己的 :hover 底色，悬停底色只由本组件提供。
-->
<template>
  <div ref="element" class="sliding-highlight" :style="style" aria-hidden="true"></div>
</template>

<script setup lang="ts">
  import { type CSSProperties, shallowRef, useTemplateRef } from 'vue'

  /** 完全隐藏的初始值：位置留给首次 moveTo 落位。 */
  const HIDDEN: CSSProperties = { opacity: 0 }

  const style = shallowRef<CSSProperties>(HIDDEN)
  const element = useTemplateRef<HTMLElement>('element')
  /** 上一次高亮目标：同一行内的子元素会重复冒泡 pointerover，目标未变时不必重新测量。 */
  let lastTarget: HTMLElement | null = null

  /**
   * 把高亮块对齐到目标条目。
   * @param target 目标条目；必须与高亮块处在同一个定位容器内
   */
  function moveTo(target: HTMLElement): void {
    if (target === lastTarget) return
    const parent = element.value?.offsetParent
    if (!(parent instanceof HTMLElement)) return
    // 用视口矩形换算到容器内容坐标，兼容条目外层的相对定位包裹与容器滚动。
    const parentRect = parent.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    lastTarget = target
    style.value = {
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      transform: `translate(${
        targetRect.left - parentRect.left - parent.clientLeft + parent.scrollLeft
      }px, ${targetRect.top - parentRect.top - parent.clientTop + parent.scrollTop}px)`,
      opacity: 1,
    }
  }

  /** 指针或焦点离开条目集合时淡出，但保留当前位置，重新出现时继续从上一项滑过去。 */
  function hide(): void {
    lastTarget = null
    if (style.value.opacity === 0) return
    style.value = { ...style.value, opacity: 0 }
  }

  /** 暴露给宿主：容器通过委托事件驱动位置。 */
  defineExpose({ moveTo, hide })
</script>

<style scoped>
  /*
   * 宿主容器必须是定位元素，块的位置才能与条目的 offsetLeft/offsetTop 对上。
   * 圆角通过 --sliding-highlight-radius 传入，并设在块元素自身上：
   * 该变量会被继承，挂在容器上会扩散到容器里所有高亮块和嵌套列表。
   */
  .sliding-highlight {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    border-radius: var(--sliding-highlight-radius, var(--klc-radius-xs, 4px));
    background: var(--klc-color-ui-hover);
    pointer-events: none;
    opacity: 0;
    transition:
      transform var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      width var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      height var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }
</style>
