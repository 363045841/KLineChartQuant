<!-- 滑动高亮块：跟随指针/焦点在相邻条目之间平滑移动，而不是逐项淡入淡出。 -->
<template>
  <div ref="element" class="sliding-highlight" :style="style" aria-hidden="true"></div>
</template>

<script setup lang="ts">
  import { type CSSProperties, shallowRef, useTemplateRef } from 'vue'

  /** 完全隐藏：保留 transform，避免重新出现时从左上角滑入。 */
  const HIDDEN: CSSProperties = { opacity: 0 }

  const style = shallowRef<CSSProperties>(HIDDEN)
  const element = useTemplateRef<HTMLElement>('element')

  /**
   * 把高亮块对齐到目标条目。
   * @param target 目标条目；必须与高亮块处在同一个定位容器内
   */
  function moveTo(target: HTMLElement): void {
    const parent = element.value?.offsetParent
    if (!(parent instanceof HTMLElement)) return
    // 用视口矩形换算到容器内容坐标，兼容条目外层的相对定位包裹与容器滚动。
    const parentRect = parent.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    style.value = {
      width: `${targetRect.width}px`,
      height: `${targetRect.height}px`,
      transform: `translate(${
        targetRect.left - parentRect.left - parent.clientLeft + parent.scrollLeft
      }px, ${targetRect.top - parentRect.top - parent.clientTop + parent.scrollTop}px)`,
      opacity: 1,
    }
  }

  /** 指针或焦点离开条目集合时收起高亮块。 */
  function hide(): void {
    if (style.value.opacity === 0) return
    style.value = HIDDEN
  }

  /** 暴露给宿主：容器通过委托事件驱动位置。 */
  defineExpose({ moveTo, hide })
</script>

<style scoped>
  /* 宿主容器必须是定位元素，块的位置才能与条目的 offsetLeft/offsetTop 对上。 */
  .sliding-highlight {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 0;
    border-radius: var(--sliding-highlight-radius, var(--klc-radius-xs, 4px));
    background: var(--sliding-highlight-background, var(--klc-color-ui-hover));
    pointer-events: none;
    opacity: 0;
    transition:
      transform var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      width var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      height var(--klc-motion-dur-press) var(--klc-motion-ease-out),
      opacity var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }
</style>
