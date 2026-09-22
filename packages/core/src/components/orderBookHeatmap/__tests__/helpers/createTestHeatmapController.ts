/**
 * orderBookHeatmap 控制器测试夹具。
 */

import { createHeatmapController } from '../../impl/createHeatmapController'
import type { HeatmapController, HeatmapControllerConfig } from '../../types'

/** 测试默认配置：小容量 ring / archive，便于断言。 */
const TEST_HEATMAP_CONFIG = {
  tickSize: 0.01,
  snapshotIntervalMs: 100,
  snapshotRingCapacity: 10,
  deltaArchiveMaxSize: 1000,
  logColorRange: { sizeMin: 1, sizeMax: 1000 },
} satisfies HeatmapControllerConfig

/**
 * 创建带测试默认配置的 HeatmapController。
 * @param overrides 覆盖默认配置字段。
 * @returns 新的 HeatmapController 实例。
 */
export function createTestHeatmapController(
  overrides: Partial<HeatmapControllerConfig> = {},
): HeatmapController {
  return createHeatmapController({ ...TEST_HEATMAP_CONFIG, ...overrides })
}
