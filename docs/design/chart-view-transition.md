# Chart 视图转移与编排函数重写

## 问题与决策

Chart 的品种、周期、对比命令分别决定 mode 和 dataView，导致分时中添加对比品种会被命令入口强制切回 K 线。重写这些入口，由纯函数 `resolveViewTransition` 唯一裁决周期与对比集合，Chart 的 `transitionView` 负责执行一次 `setActiveMode`、配置市场会话与投影刻度。保留现有 kernel、数据管理器和渲染器装配关系。

| 目标周期 | 对比集合为空 | 对比集合非空 | mode |
| --- | --- | --- | --- |
| K 线 / 未设置 | KLine | Comparison | KLine |
| 分时 | TimeShare | TimeShare | TimeShare |
| 五日分时 | FiveDayTimeShare | FiveDayTimeShare | TimeShare |

品种和周期入口在激活目标 buffer 前完成视图转移，随后恢复 K 线滚动快照；对比命令在写回集合后使用同一决策。退出对比时先恢复旧刻度，再进入目标视图，避免覆盖分时 percent 刻度。分时内修改对比集合保留分时视图，返回 K 线周期后集合重新生效。

自定义数据入口会替换对比集合，批量写入后使用最终快照选择视图。市场会话契约仍在写入前校验。真实 Chart 测试确认 `CustomDataSource.data` 是 K 线输入，分时周期会被现有数据管理器拒绝；旧替身把未发生的数据写入当作成功，现改为验证拒绝且状态不变。

## 几何契约

删除 `applyRenderState(kWidth, kGap, zoomLevel)` 的混合参数契约，改用 `{ zoomLevel }` 或 `{ kWidth, slotWidth }`。K 线缩放只输入等级；分时显式输入柱宽与交易槽宽度，两个字段批量写入。`kGap` 仍由 viewport 根据周期和 DPR 派生，调用方不得作为权威输入。槽宽变化也触发绘制，修复仅比较柱宽时漏绘的问题。所有仓库内调用方随契约更新。

分时数据就绪与 resize 共用几何初始化函数，resize 共用布局、悬停失效与重绘尾部。数据、渲染和指标共用 options 几何投影。价格平移和缩放共用守卫及 HAND 提交逻辑；绘图指针事件只预分发一次，保留移动预览的十字线行为。

## 状态与输入

右轴宽度仅保留 signal；交互快照直接公开 kernel 已有的只读信号，删除重复 computed 与惰性缓存。`updateOptions` 解构过滤几何字段，不修改调用方对象。`setSymbols` 拒绝多个主品种，消除静默丢弃；挂载入口已显式拆分主品种与对比集合。

## 验证

纯决策与真实 Chart 测试覆盖周期 × 对比集合矩阵、周期入口与对比命令的一致性、对比进出分时后的刻度、几何原子通知及槽宽变化、不可变 options 入参。复用现有 DOM 测试支架，不新增行情替身。运行 core 全量测试、类型检查及相关文件 Biome 检查；浏览器验收覆盖 K 线、分时、五日分时、对比切换与缩放。

本次自动验证：core 的 245 个测试文件、2634 项用例全部通过；`pnpm type-check`、相关文件 Biome 检查与 `git diff --check` 通过。未执行浏览器 E2E 或视觉回归，浏览器验收仍待执行。
