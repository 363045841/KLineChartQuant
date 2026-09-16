/**
 * @klinechart-quant/core/renderer-tier — 渲染后端选择：从调用方 registry 中挑选一个 factory。
 *
 * 能力探测（`detectRendererTier` 等）已下移到 `foundation/utils/rendererCapability`，
 * 由设置解析用于推导 `rendererBackend` 的初始偏好默认，不再作为 runtime 状态源。
 */

export {
  type BackendFactory,
  type BackendRegistry,
  type BackendSelection,
  type SelectBackendOptions,
  selectBackend,
  selectBackendOrThrow,
} from './selectBackend.js'
