# 时间轴刻度的唯一入口

## 背景

时间轴刻度曾按「可见槽位逐格扫描 + `formatDate` 判日期 key」生成：

```ts
for (let index = firstIndex; index <= lastIndex; index++) {
  const key = formatDate(logicalToTime(index)).slice(0, keySize)
  if (key !== previousKey) { /* 落一个刻度 */ }
}
```

这是 `#376` 为统一留白日期引入的实现。它把每帧成本从 O(标签数) 变成
O(可见槽位 × Intl)：缩放到全览时可见槽位超过 1024，而 `dateFormat` 的字符串缓存
上限正好 1024 且「满即 `clear()`」，命中率归零。实测每帧约 1000 次
`Intl.DateTimeFormat.formatToParts`，单此一项 3.3ms，超过 200Hz 的 5ms 帧预算。

同类问题还有三处：`chartDataManager.resolveTradingDate` 就地构造 Intl、
网格线与时间轴各自计算日历边界、脚本包自带一套时区换算。

## 约定

- **成本只随标签数增长。** 刻度由「时间区间 + 目标数量」经 nice step 阶梯生成，
  与可见槽位、数据长度无关。
- **标签粒度由周期决定，不由密度决定。** 分钟/小时出日期，日线出月份，
  更高周期只出年份；密度只决定步长，不会把日期标签变成时分。
- **时间语义只有一个入口。** 格式化、时区偏移、日历边界都在 `foundation/time`；
  其它层只消费结果，不构造 Intl，也不在帧循环里格式化单个时间戳。
- **网格线与时间轴共用同一份日历引擎。** 轴要全部边界时省略 `target`，
  要标签密度时传 `target`，两者不再各写一套边界推导。

## 契约

`packages/core/src/foundation/time/`

| 文件 | 职责 |
|------|------|
| `types.ts` | `TimeFormatter`、`TimeTick`、`TimeTickUnit`、`TimeProjection` |
| `impl/dtf.ts` | 时区解析器复用、`zoneOffsetMs`、`readParts` |
| `impl/format.ts` | 按时区复用的 formatter、独立文本与交易日格式化、市场时段 `HH:mm` |
| `impl/seriesTime.ts` | 时间 ↔ 连续逻辑槽位的唯一实现（插值 + 两端外推） |
| `impl/ticks.ts` | 阶梯 + 日历边界枚举 + 吸附到槽位 + 标签 |

`frameTimeTicks(request)` 是唯一刻度入口：

```ts
frameTimeTicks({ projection, firstIndex, lastIndex, unit, timeZone, target? })
```

- `target` 省略：枚举该单位的全部边界（纵向网格线）。
- `target` 给定：按 `span / target` 取阶梯步长（轴标签）。
- 每个刻度带 `index`（吸附后的整数槽位）、`time`、`label`、`major`；
  时间轴与网格线各自用已有的坐标/中心点换算像素，不重复吸附。

渲染层接线：

- `ChartRenderer.prepareFrameData` 每帧投影一次 `timeTicks`，写入 `FrameContext`；
  Overlay 帧复用缓存（纯十字线移动不改变可见区间）。
- `RenderContext.timeTicks` 是唯一读数；`timeAxis` 只做可见区过滤与绘制。
- `gridLines` 用同一引擎按历史区间取 `day` / `month` 边界，再叠加序列起点分隔线。

## 时区与 DST 取舍

日历边界在显示时区里按「可见区间中点的一次偏移」换算：边界与标签共用同一偏移，
两者始终自洽；DST 切换处最多产生 1 小时的位置差，最多影响一根分钟级 K 线。
UTC 显示时区不需要任何 Intl 调用。逐标签精确换时区会让成本重新随标签数线性增长，
且引入第二套「标签与位置可能不一致」的可能，因此不采用。

## 删除的东西

- `foundation/utils/dateFormat.ts` 全部单值 API（含 `getMonthBoundaries`、
  `getDayBoundaries`、`formatAxisDay`、`formatAxisMonthOrYear`）与 1024 条字符串缓存。
- `timeAxis` 的逐槽扫描、`gridLines` 的边界缓存、`chartDataManager` 的就地 Intl。

## 验证

- `packages/core/src/foundation/time/__tests__/time.test.ts` 守住三条护栏：
  5000 根 K 线全览时 `formatToParts` 在 UTC 下调用 0 次、非 UTC 下不超过 1 次；
  未来留白仍产出推导日期；标签数量由 `target` 约束。
- `engine/renderers/__tests__/timeAxis.derived.test.ts` 与 `gridLines.mode.test.ts`
  的既有文案与落点断言保持不变，证明重构前后对外行为一致。
