# 统一图例管理

图例通过 `ChartController.legend` 统一查询与写入。`list/get/create/update/remove` 管理指标、比较品种和自定义行，`move/replace/execute` 管理排序、原位替换和按钮操作。创建返回稳定图例 ID，后续操作始终使用该 ID。

指标和比较品种仍以各自领域状态为唯一事实来源。图例操作委托指标、Pane 和 ComparisonCommands 的现有写原语，不复制领域集合。主图 ID 为实例 ID，比较品种 ID 使用完整品种身份，自定义 ID 使用 `custom:` 命名空间。

ChartRenderer 在一帧完成后，把全部 Pane 的帧上下文一次性交给 LegendManager。主副图共享指标标题取值与格式化，管理器原子发布 `context` 和 `rows`。`context.rows` 提供主图展示行，自定义 Vue slot 和默认 DOM 使用同一份数据。`legend.visible` 只控制默认主图 DOM，外部模板仍能读取完整投影。

比较品种按主图当前时间戳读取自身真实行情。无十字线时使用主图最新时间戳，有十字线时使用指向时间戳。价格直接使用真实 close，涨幅沿用比较折线的基准；缺失行情或基准显示 `—`，不生成虚假的 0%。原始匹配行情同时暴露给外部模板。隐藏品种仍保留同一份行情与基准投影，只从曲线绘制和轴范围中排除。

每条展示行的 `actions` 声明按钮集合、标签与边界状态，规则集中在 Core 的 `projectLegendActions`。DOM renderer 按集合展示按钮并调用统一 `execute`。显隐、关闭和排序在 Core 执行；设置和替换通过 `LEGEND_UI_EVENT` 请求宿主打开界面，选择器提交时调用 `legend.replace`。框架和 renderer 不再按主图、副图或比较品种分发领域操作。

旧 mainIndicatorLegend Layer、Pane title Layer、帧内 publishLegendRows、独立 legendTemplateContext 信号及 Vue 领域分发链路移除，不保留兼容入口。图例不再参与 Canvas Layer 目录或指标 renderer 元数据。
