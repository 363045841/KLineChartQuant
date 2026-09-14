# 渲染后端默认值由能力探测提供

`rendererBackend` 的默认值不再硬编码 `'webgl'`，而是在设置回填时调用一次能力探测，取探测结果作为默认偏好。

## 取值来源

| 优先级     | 来源                                              |
| ---------- | ------------------------------------------------- |
| 1 显式覆盖 | 组件 `settings` prop 显式声明的 `rendererBackend` |
| 2 存量偏好 | localStorage 中已存的 `rendererBackend`           |
| 3 探测默认 | `detectRendererTier()` 的层级映射结果             |

前两级由 `resolveSettings` 的逐 key 合并负责，第三级由 `normalizeSettings` 在补齐缺失 key 时求值。

## 探测与映射

复用既有同步探测 `detectRendererTier()`（位于 `foundation/utils/rendererCapability.ts`），层级映射：

| RendererTier | rendererBackend |
| ------------ | --------------- |
| `webgpu`     | `webgpu`        |
| `webgl2`     | `webgl`         |
| `canvas2d`   | `canvas`        |
| `none`       | `webgl`         |

`none`（SSR / 无 document / 无 2D context）沿用 `webgl`，与改造前行为一致。映射函数 `mapRendererTierToBackend` 为纯函数，单独可测。

## 机制：SettingItem.default 支持函数

`SettingItem.default` 允许为 `() => boolean | string | number`。`resolveSettingDefault(value)` 在消费处求值：函数则取返回值，否则原样返回。消费点：

- `normalizeSettings`：缺失 key 时 `source?.[key] ?? resolveSettingDefault(item.default)`。
- `ChartSettingsDialog.resetSettings`：重置时同样解析，避免把函数写回 settings。

`rendererBackend` 项的 `default` 指向 `defaultRendererBackend`：首次调用执行一次 `detectRendererTier()` 并缓存到模块级变量，保证「只探测一次」；函数惰性求值，import 时不触发探测，Node/SSR 下 import 安全。

## 分层

能力探测是纯工具（只依赖 `errors`），放在 `foundation/utils/rendererCapability.ts`，因此 `foundation/config` 引用它属于同层依赖，不产生 foundation → rendering 的反向依赖。后端选择 `selectBackend` 仍留在 `rendering/renderer-tier/`，从 foundation 上引。

## 边界

探测结果只作为**初始偏好默认**，不作为 runtime 生效状态源。生效后端仍以 `RendererHost.runtime.effective` 为准（见 `docs/rendering-pipeline.md` §14.1 与 `docs/design/axis-preference-vs-effective.md` 的偏好/生效拆分）。
