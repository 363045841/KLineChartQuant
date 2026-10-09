# Footprint 接入主图图例

## 决策

足迹图作为主图指标，与其它指标一样在主图左上角图例中占一行，显示「足迹图 (每行跳数, 不平衡倍数)」；删除渲染器里自绘的状态文案。

## 原因

- 主图图例（`buildLegendTemplateContext` → DOM legend）是主图指标的展示 SSOT。未声明 `getTitleInfo` 的指标不进图例，也就游离于隐藏/显示、收起、操作工具条等既有机制之外。
- 足迹图此前在画布上 `ctx.fillText(message, 8, 16)` 自绘「加载中/缺口/失败」，与 DOM 图例形成双轨展示，破坏了单一事实来源。

## 实现

- `footprint.ts` 增加 `getTitleInfo`：只返回 `name` 与 `params`，不带逐柱数值。
- 该回调**不读取渲染状态**，因此数据未就绪（loading / gap / error，或当前无 bar）时仍会发布标题行；这与「无值返回 null」的常规指标不同，是刻意行为。
- 删除渲染器中的状态文本绘制；随之失去唯一消费方的 `TRADE_STATUS_LABEL` 一并删除。

## 边界

- 加载中 / 缺口 / 失败的提示本轮不再显示。后续由通用的「指标加载态」承接，加载圈方案另立文档；届时状态经 `predicate` 表达，而不是重新在画布上写字。
- `getTitleInfo` 直接使用实例参数（`runtime.defaultParams` 保证参数存在），不引入无意义的回退分支。
