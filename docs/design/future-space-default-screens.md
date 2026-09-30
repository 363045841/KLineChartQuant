# 未来区默认屏数：由 3 屏收窄为 1 屏

## 背景

未来区（最后一根 K 线右侧的可滚动空白）的屏数由 `DEFAULT_FUTURE_SCREENS` 单点决定。该值同时驱动三处几何：

- 内容宽度 `computeContentWidth`（未来槽位并入内容）
- 滚动上限 `computeMaxScrollLeftWithVisibleData`
- 可见区间上限 `rawVisibleRange.end` 夹取

三者必须同源，否则内容宽度先触顶会让未来区拖不出来。此前默认 `3`，滚动空间约 3 屏宽，用户反馈过大。

## 决策

**将 `DEFAULT_FUTURE_SCREENS` 从 `3` 改为 `1`。**

未来区是给"下一根尚未到来的 K 线"预留的落点，1 屏已足够摆放光标与画线；3 屏只是把可滚动空白拉长，不增加信息量，反而让拖到数据尾后失去方向感。

## 取舍

- **只改默认值，不改机制**：屏数本就是可配置项（`futureScreens`），本次仅调整默认。显式传入 `futureScreens` 的调用方行为不变。
- **不改单点解析位置**：`viewportState.readFutureScreens` 仍是唯一默认值解析点，三处几何继续共用同一数值，避免出现第二处 `?? DEFAULT`。

## 影响

- 默认未来滚动空间由 3 屏收窄为 1 屏，内容宽度与 `maxScrollLeft` 同步收窄。
- 分时 / 五日分时没有未来区（`futureScreens` 不作用于 timeshare），不受影响。
- 数据层、协议、渲染与后端接口均未改动。
