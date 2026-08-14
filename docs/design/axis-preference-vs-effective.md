# 主图坐标偏好与轴展示拆分

`settings` 只保存用户偏好，`kernel.pane.paneScaleTypes` 只保存当前生效刻度。

| 字段 | 含义 |
| --- | --- |
| `mainRightAxisTypeSetting` | 用户希望主图右轴是什么：`none / linear / log / percent`。`linear/log/percent` 同时决定坐标怎么算 |
| `mainLeftAxisDisplaySetting` | 用户希望左轴显示什么：`none / price / percent` |
| `paneScaleTypes` | 每个 pane 当前真正使用的坐标类型 |

分时/比较只覆盖 `paneScaleTypes` 和展示推算，不改 Setting。退出后恢复进入前的 `paneScaleTypes`。`none` 只隐藏右轴，不改当前刻度。

展示由 `resolveEffectiveAxisDisplay()` 推算：分时固定左百分比、右价格；比较视图右轴默认百分比。

旧键 `rightAxisType` / `leftAxisType`，以及短暂存在的 `mainPriceScaleTypeSetting` / `mainRightAxisDisplaySetting`，在 `migrateStoredSettings` 中迁到 `mainRightAxisTypeSetting`。
