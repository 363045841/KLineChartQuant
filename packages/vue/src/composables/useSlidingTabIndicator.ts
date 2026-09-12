// 下划线 Tabs 的滑动指示器：把指示条对齐到当前激活 tab，供 BaseTabs 复用。

import { nextTick, onMounted, ref, watch, type Ref } from 'vue'

/**
 * 追踪 Tabs 容器内激活项的位置与宽度，输出指示器的绝对定位样式。
 *
 * @param rootRef Tabs 根容器（需为定位上下文）
 * @param activeKey 激活项取值函数，变化时重新对齐指示器
 * @returns indicatorStyle 供指示器绑定的内联样式
 */
export function useSlidingTabIndicator(rootRef: Ref<HTMLElement | null>, activeKey: () => unknown) {
  const indicatorStyle = ref<{ left: string; width: string }>({ left: '0px', width: '0px' })

  /** 把指示器对齐到当前激活 tab 的位置与宽度。 */
  function syncIndicator(): void {
    const active = rootRef.value?.querySelector<HTMLElement>('.is-active')
    if (!active) return
    indicatorStyle.value = { left: `${active.offsetLeft}px`, width: `${active.offsetWidth}px` }
  }

  watch(activeKey, () => {
    void nextTick(syncIndicator)
  })

  onMounted(() => {
    void nextTick(syncIndicator)
  })

  return { indicatorStyle, syncIndicator }
}
