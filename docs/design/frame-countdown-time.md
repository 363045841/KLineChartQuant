# 倒计时的帧时间快照

每个实际执行的帧在 derive 开始时从可注入的 Clock 读取一次 Unix 毫秒时间。同步 draw 和 rAF flush 共用该入口；generation 0 占位不读取时间。倒计时剩余时间、显示文本和 timer 延迟都使用本帧的 now，Layer 只读取 RenderContext 中已派生的 countdown。

ChartRenderer 继续作为倒计时 timer 的唯一所有者，在帧事务的副作用阶段管理 timer，不在 paint 内安排刷新。timer 只请求 Overlay 帧，实际绘制仍经过 FrameTransaction。保留现有每秒 Overlay 刷新，不新增通用时间驱动注册机制，也不改变交互帧的强制刷新规则。

Overlay 仅复用几何缓存，时间和倒计时每帧重新派生；版本键使用倒计时文本，绘制后的版本记录使用同一帧文本。收线、无数据、不支持的视图或周期、销毁时停止 timer。后台延迟后直接显示当前值，不补播过期秒数。

第二阶段新增 main 分组的布尔设置 showLastPriceCountdown，默认 true。关闭时 derive 不输出倒计时，也不安排 timer，右轴价签自然恢复单行。设置 UI 和持久化沿用 DEFAULT_SETTINGS 的通用链路，Vue 无需改动。
