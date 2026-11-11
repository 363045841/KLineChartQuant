# 图表导航与视图重置

导航浮层位于 chartMain 底部中央、时间轴上方。鼠标进入底部按钮区域或键盘聚焦按钮时显示；触屏保持可见。

按钮只声明命令 id 和展示顺序。命令注册表持有名称、快捷键、可用条件和动作，按钮点击与键盘通过同一 execute 入口执行。Tooltip 订阅注册表的命令列表，改绑和移除快捷键后立即更新。

## 重置到哪里

重置遵循当前视图的"最新端"，位置由横向标尺策略给出，而不是由数据层反推滚动像素：

| 视图 | 最新端 | 来源 |
|------|--------|------|
| K 线 | 最新一根完整可见，右侧保留 `LATEST_RIGHT_MARGIN_BARS`（10）个未来槽位 | `scaleXStrategies.ts` 的 `latestBars` |
| 五日分时 | 内容最右端 | `latestSessions` |
| 单日分时 | 无（固定视图） | `latest: () => null` |

10 根与 Vela 的 `margins.right` 默认值一致。首次加载品种、`scrollToRight`、导航重置按钮共用 `viewport.actions.scrollToLatest()`，因此三者落在同一位置。

## 为什么在模型坐标里解算

`scrollToLatest` 读取当前投影快照，用 `seriesWidth + kGap - viewportWidth + 未来槽位 × step` 得到逻辑滚动位置，再交给策略的 `navigate` 钳制。DOM 侧的 `domScroll`、`domOffset`、`contentWidth` 只服务于滚动容器，属于输出，不参与命令解算。

这样做的直接后果：位置不依赖 DOM 像素换算，也不依赖"写入缩放后派生几何是否已经提交"。派生值按需求值（见 `state/reactivity-derived-state.md`），因此 `resetTimeAxis` 在同一批里先切缩放、再定位，读到的就是新网格。

## 重置的其余部分

`resetTimeAxis` 恢复初始缩放并定位到最新端；`resetChart` 在同一次提交里再清除主图价格轴的手动范围，价格轴按恢复后的可见数据重新适配。重置不保存易随前插数据、尺寸变化失效的 scrollLeft 像素快照，也不恢复切换品种前的用户视口快照。Alt+R、导航重置按钮和其他调用方共用该入口。
