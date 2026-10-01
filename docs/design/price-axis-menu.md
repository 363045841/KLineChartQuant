# 价格轴菜单与重置

价格轴与时间轴交叉区域的入口复用 Vue 的 DropMenu，分为轴类型、纵轴模式、重置和位置四组。设置通过已有 handleSettingsChange 写入 controller，不增加独立状态。

价格轴仅保留一个 DOM 主机及一套刻度、装饰标签、十字线和交互实现。priceAxisPosition 设置决定该主机位于绘图区左侧或右侧，菜单位置组选项仅改变 flex 顺序，移动时不重新创建 Canvas、不改变价格范围。原来的独立左轴 renderer 与 layer 已移除。

ChartController 的 resetMainPriceAxis 转发主图 resetPriceTransform。手动缩放已提交到 kernel 的 handRange，仅清除 PriceScale 的临时变换不能恢复初始范围，因此重置同时清空 handRange；下一帧按可见行情重新初始化。重置保留轴类型和 AUTO/HAND 偏好。

重置使用点击时当前可见 range 的 Max/Min，滚动后的视图按新的可见行情适配，不恢复首次加载的价格范围。

resetHandRange 同时用于品种切换与用户重置，使手动范围的清除保持单一入口。
