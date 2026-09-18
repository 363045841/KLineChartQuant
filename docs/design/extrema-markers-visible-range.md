# 极值标记可见范围

## 决策

可视区最高/最低价标注只在「真正进入内容区」的 bar 范围内取极值，不再维护「±1 缓冲内全局极值 + 严格范围极值」两套候选做 fallback。

`findVisibleBarRange(range, kLineCenters, scrollLeft, paneWidth)` 是该范围的唯一来源：可见区间左右各扩 1 根，函数按屏幕 x 把 `range.start` / `range.end` 收缩到首个 `center - scrollLeft >= 0`、最后一个 `center - scrollLeft <= paneWidth` 的 bar，返回闭区间 `{ first, last }`；无 bar 可见时返回 `last < first` 的空区间。

## 边界

- 极值循环只在 `[first, last]` 上运行，标记点屏幕 x 由同一次投影得到；线段长度固定，不再因贴近 pane 边缘而翻倍。
- `first` 在无 bar 可见时回退到 `max(0, range.start)`，保证比较视图的百分比基准索引始终可用；该回退不参与极值标记（渲染器先判 `last < first`）。
- 比较视图的基准 bar（`comparisonLine`、`getComparisonViewLineRange`、`renderPanes` 的 base price）复用同一函数，保证折线与极值标记对「首根可见 bar」的定义一致。
