/**
 * viewport 测试共享夹具：统一 deps 构造、resize 参数与 import 路径。
 *
 * 只做构造，不预设滚动位置；用例只声明与自身相关的差异。
 */
import {
  createViewportStateDeps,
  type ViewportStateDepsOverrides,
} from '../../../state/__tests__/helpers/createViewportStateDeps'
import { createViewportState } from '../../../state/viewportState'

export type ViewportFixtureOverrides = ViewportStateDepsOverrides & {
  /** 逻辑视口宽度，默认 800。 */
  width?: number
  /** 逻辑视口高度，默认 400。 */
  height?: number
  /** 设备像素比，默认 1。 */
  dpr?: number
}

/** 构造已完成 resize 的 viewportState 模块。 */
export function createViewportFixture(overrides: ViewportFixtureOverrides = {}) {
  const { width = 800, height = 400, dpr = 1, ...deps } = overrides
  const viewport = createViewportState(createViewportStateDeps(deps))
  viewport.actions.resize(width, height, dpr)
  return viewport
}

export { createViewportStateDeps }
