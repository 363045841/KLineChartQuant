# 布局级指标收藏

指标收藏的运行时唯一数据源为 `kernel.indicator.readonly.favoriteIndicatorIds`。
收藏记录规范指标定义 ID，独立于已开启的指标实例，不修改计算 revision，也不加载指标实现。
所有写入通过指标状态动作完成，Controller 暴露只读信号与 `setIndicatorFavorite` 动作。

`LayoutDocument.favoriteIndicatorIds` 是该状态的持久化快照。导出、恢复、复制、切换和自动保存
复用现有布局链路，不新增浏览器存储或 UI 缓存。旧布局省略字段时恢复为空，新布局初始化为空。
两个数据视图共享当前布局的收藏；切换布局恢复目标文档的收藏。

Vue composable 只保存导航选择，收藏集合和列表由 Core 信号派生。
搜索与更换目标位置先筛选目录，「收藏」再对结果按收藏身份筛选。
取消收藏会立即从收藏列表移除；收藏操作不改变指标开启状态。
