/** 指标收藏视图：订阅 Core 唯一状态，仅持有当前导航项，不复制收藏数据。 */
import type {
  ChartController,
  IndicatorDefinition,
} from '@363045841yyt/klinechart-core/controllers'
import { computed, type Ref, ref } from 'vue'
import { useControllerSignal } from './chart/useControllerSignal.js'

export const INDICATOR_SELECTOR_SECTIONS = {
  favorites: 'favorites',
  indicators: 'indicators',
} as const

/** 根据导航与搜索后的目录派生列表，收藏写入由控制器统一处理。 */
export function useIndicatorFavorites(
  controller: Ref<ChartController | null>,
  availableIndicators: Ref<ReadonlyArray<IndicatorDefinition>>,
) {
  const section = ref<
    (typeof INDICATOR_SELECTOR_SECTIONS)[keyof typeof INDICATOR_SELECTOR_SECTIONS]
  >(INDICATOR_SELECTOR_SECTIONS.indicators)
  const favoriteIds = useControllerSignal(
    controller,
    (api) => api.favoriteIndicatorIds,
    () => [],
  )
  const favoriteSet = computed(() => new Set(favoriteIds.value))
  const filteredIndicators = computed(() =>
    section.value === INDICATOR_SELECTOR_SECTIONS.favorites
      ? availableIndicators.value.filter((indicator) => favoriteSet.value.has(indicator.id))
      : availableIndicators.value,
  )

  /** 使用当前 Core 快照决定下一状态，不做本地乐观写入。 */
  function toggleFavorite(indicatorId: string): void {
    controller.value?.setIndicatorFavorite(indicatorId, !favoriteSet.value.has(indicatorId))
  }

  return { section, favoriteSet, filteredIndicators, toggleFavorite }
}
