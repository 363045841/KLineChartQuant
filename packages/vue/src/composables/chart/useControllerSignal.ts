/** 将 Core ReadonlySignal 接入 Vue 响应式系统。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

type ReadonlyControllerSignal<T> = {
  peek(): T
  subscribe(listener: () => void): () => void
}

/** 订阅 Controller 信号并返回只读 Vue computed，不镜像业务状态。 */
export function useControllerSignal<T>(
  controllerRef: Ref<ChartController | null>,
  select: (controller: ChartController) => ReadonlyControllerSignal<T>,
  fallback: () => T,
): ComputedRef<T> {
  const version = ref(0)
  watch(
    controllerRef,
    (controller, _previous, onCleanup) => {
      if (!controller) {
        version.value++
        return
      }
      const unsubscribe = select(controller).subscribe(() => {
        version.value++
      })
      version.value++
      onCleanup(unsubscribe)
    },
    { immediate: true },
  )
  return computed(() => {
    void version.value
    const controller = controllerRef.value
    return controller ? select(controller).peek() : fallback()
  })
}
