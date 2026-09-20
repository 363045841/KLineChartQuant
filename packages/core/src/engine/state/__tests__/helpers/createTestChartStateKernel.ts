/**
 * ChartStateKernel 测试夹具。
 *
 * 统一各状态测试重复的 Kernel 布局默认值（与 createChartController 的生产
 * DEFAULT_OPTS 对齐），用例只声明自己真正关心的差异项。
 */

import { ChartStateKernel, type ChartStateKernelDeps } from '../../chartStateKernel'

/** 测试默认布局，与生产 DEFAULT_OPTS 保持一致。 */
const TEST_KERNEL_OPTIONS = {
  minKWidth: 1,
  maxKWidth: 50,
  zoomLevelCount: 20,
  bottomAxisHeight: 24,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  yPaddingPx: 20,
  panes: [{ id: 'main', ratio: 1, visible: true, role: 'price' }],
} satisfies ChartStateKernelDeps['initialOptions']

/** 测试 Kernel 依赖覆盖项；`options` 与默认布局浅合并。 */
export interface TestChartStateKernelOverrides
  extends Partial<
    Omit<ChartStateKernelDeps, 'initialOptions' | 'initialZoomLevel' | 'scheduleDraw'>
  > {
  /** 覆盖默认布局字段。 */
  options?: Partial<ChartStateKernelDeps['initialOptions']>
  /** 初始缩放级别，默认 3（与生产一致）。 */
  initialZoomLevel?: number
  /** 绘制调度回调，默认空实现。 */
  scheduleDraw?: ChartStateKernelDeps['scheduleDraw']
}

/**
 * 创建测试用 ChartStateKernel。
 * @param overrides 布局、缩放、工作区等依赖覆盖。
 * @returns 新的 ChartStateKernel 实例。
 */
export function createTestChartStateKernel(
  overrides: TestChartStateKernelOverrides = {},
): ChartStateKernel {
  const { options, initialZoomLevel = 3, scheduleDraw = () => {}, ...rest } = overrides
  return new ChartStateKernel({
    ...rest,
    initialZoomLevel,
    scheduleDraw,
    initialOptions: { ...TEST_KERNEL_OPTIONS, ...options },
  })
}
