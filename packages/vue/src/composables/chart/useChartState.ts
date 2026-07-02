import { zoomLevelToKWidth, kGapFromKWidth } from '@363045841yyt/klinechart-core/controllers'
import { ref } from 'vue'

export interface ChartStateOptions {
  minKWidth?: number
  maxKWidth?: number
  zoomLevelCount?: number
  dpr?: number
}

export function useChartState(initialZoom: number, opts?: ChartStateOptions) {
  const symbolStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const zoomLevel = ref(initialZoom)
  const kWidth = ref(0)
  const kGap = ref(1)
  const viewWidth = ref(0)
  const viewportDpr = ref(1)
  const viewportVersion = ref(0)
  const dataLength = ref(0)
  const dataVersion = ref(0)
  const paneRatios = ref<Record<string, number>>({})
  const comparisonColorsMap = ref<Map<string, string>>(new Map())
  const comparisonLoading = ref(false)
  const activeToolId = ref('cursor')

  kWidth.value = zoomLevelToKWidth(initialZoom, {
    minKWidth: opts?.minKWidth ?? 1,
    maxKWidth: opts?.maxKWidth ?? 50,
    zoomLevelCount: opts?.zoomLevelCount ?? 20,
    dpr: opts?.dpr ?? 1,
  })
  kGap.value = kGapFromKWidth(kWidth.value, opts?.dpr ?? 1)

  return {
    symbolStatus,
    zoomLevel,
    kWidth,
    kGap,
    viewWidth,
    viewportDpr,
    viewportVersion,
    dataLength,
    dataVersion,
    paneRatios,
    comparisonColorsMap,
    comparisonLoading,
    activeToolId,
  }
}
