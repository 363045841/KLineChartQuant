# 图表设置分层解析

`resolveSettings(overrides, stored)` 是设置解析的唯一入口，逐 key 取值优先级：

| 优先级     | 来源                                                            |
| ---------- | --------------------------------------------------------------- |
| 1 显式覆盖 | 组件 `settings` prop 显式声明的 key                             |
| 2 存量偏好 | `loadStoredSettings()` 读 localStorage；`stored` 省略时自动读取 |
| 3 默认值   | `DEFAULT_SETTINGS` 补齐所有缺失 key                             |

规则：

- 逐 key 合并，不做整体替换：prop 未声明的 key 回落到存量，不会被默认值顶掉。
- 显式 `undefined` 视为未声明，不覆盖存量。
- `stored` 传 `{}` 表示不读取存量，用于纯默认解析。
- `normalizeSettings(partial)` 只做旧字段迁移、默认值补齐与扩展字段保留，不做分层；`resolveSettings` 合并后交给它收尾。
- 默认值可为函数（`SettingItem.default`），消费处用 `resolveSettingDefault` 求值。`rendererBackend` 的默认即由能力探测提供，见 `docs/design/renderer-backend-default-detection.md`。

背景：旧行为在传入 `settings` prop 时丢弃 localStorage，prop 未声明的 key 直接补默认值；设置弹窗再把这份结果整包写回 localStorage，用户已存的偏好因此被覆盖。改为分层后，prop 仍是其显式 key 的权威源，未声明部分由存量偏好接管。

调用方：`createChartController`、Angular `ngOnChanges`、`KLineChart`、`LeftToolbar`、`ChartSettingsDialog` 统一走 `resolveSettings`；`settingsState.snapshotSettings` 走 `normalizeSettings`（内核状态不做 localStorage 回退）。
