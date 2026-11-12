# 锁定垂直光标

## 决策

右键菜单「锁定垂直光标」把十字线所在的逻辑槽位固定为一条独立竖线，不再跟随鼠标；再次选择解除。
鼠标侧只保留水平线，避免同时出现两条竖线。

- **锁的是时间，槽位只是入口**：`CrosshairLock` 只保存 `{ timestamp, intervalMs }`。时间戳让锁定在
  缩放、平移、数据前置插入和周期切换后保持稳定；`intervalMs` 是锁定当时序列的常规槽距，用来判断
  目标周期比锁定周期更粗还是更细。
- **未来槽位同样可锁**：槽位有真实 K 线时直接取其时间戳；没有时用
  `createSeriesTimeProjection(data).logicalToTime(index)` 按常规槽距外推时间，与 `FrameCoordinates`
  和时间轴刻度共用同一份实现。负槽位、空序列或无法推算时间时不建立锁定。
  不锁 index：槽位会随周期、数据插入和视图变化漂移，时间不会。
- **跨周期映射复用绘图的时间投影**：`FrameCoordinates.timeToLogical` 把时间映射为连续槽位，
  `logicalToX` 再投影为像素。`resolveLockedCrosshair` 的取整规则：目标周期更细取 `ceil`
  （该桶第一根），更粗取 `floor`（包含该时间的桶），同周期精确命中。绘图用的 `timeToSlot`
  是最近槽位（`round`），不满足「第一根」，因此没有直接复用取整。
- **覆盖不到就隐藏**：目标 Bar 的时间范围必须真正覆盖锁定时间；否则视为该周期没有对应位置，
  不画锁线。过去的数据缺口走这条规则；未来时间由同一套外推覆盖，因此不受目标序列长度限制。
- **状态归属**：锁定字段放在现有 `interaction` 子状态（`crosshairLock`），不新增第二份十字线状态。
  它不属于瞬时交互：`InteractionController.reset()` 与状态层 `reset()` 都不清空，只有显式解锁和
  `dispose()` 清除。屏幕 x 每帧由时间投影现算，不把派生坐标写回 kernel。
- **公开入口**：`ChartController.lockCrosshairAt(index)` / `unlockCrosshair()` 转发到
  `Chart.interaction`，与 `setTooltipSize` 一致；锁定状态经 `interactionState.crosshairLock` 暴露，
  菜单只桥接布尔值。

## 渲染

- `ChartRenderer.renderCrosshair` 每帧用首个 Pane 的 `FrameCoordinates` 解析锁定槽位，传给
  `CrosshairOverlay.paint` 的 `lockedX`；时间轴标签复用同一份本帧结果，保证标签与竖线同一条。
- 锁定时只画锁定竖线；鼠标水平线仍跟随指针，空隙以锁定竖线为交点。鼠标离开后只保留锁定竖线。
- `overlayContentVersion` 纳入 `crosshairLock`，锁定/解锁触发覆盖层重绘。

## 边界

- 不写入布局文档或模板，属于运行时视图状态。
- 切换品种后如果新数据没有该时间：过去的时间点隐藏，未来的时间点按常规槽距外推显示；
  不自动解除，切回后恢复。
- 打开菜单时十字线仍有效，但指针移入菜单会 `pointerleave`，因此锁定与复制价格一样在
  `contextmenu` 打开瞬间快照 `crosshairIndex`。
- 负槽位和空序列不建立锁定（`lockCrosshairAt` 返回 `false`）。

## 回归

- `resolveLockedCrosshair`：同周期精确命中、切小周期取桶第一根、切大周期取包含桶、
  未来外推（超出数据长度）、更粗周期的未来桶、过去缺口与早于起点隐藏。
- `crosshairOverlay`：鼠标离开后保留锁定竖线；锁定后只画锁定竖线与鼠标水平线。
- `interaction.crosshairLock`：真实 K 线保存时间、`reset()` 后保留、未来槽位外推、
  负索引与空数据拒绝、显式解锁清除。
- `useChartContextMenu`：锁定项禁用条件、对勾图标、按快照 K 线锁定与解除。
