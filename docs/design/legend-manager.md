# 统一图例管理

图例通过 `ChartController.legend` 统一查询与写入。`list/get/create/update/remove` 管理指标、比较品种和自定义行，`move/replace/execute` 管理排序、原位替换和按钮操作。创建返回稳定图例 ID，后续操作始终使用该 ID。

指标和比较品种仍以各自领域状态为唯一事实来源。图例操作委托指标、Pane 和 ComparisonCommands 的现有写原语，不复制领域集合。主图 ID 为实例 ID，比较品种 ID 使用完整品种身份，自定义 ID 使用 `custom:` 命名空间。

ChartRenderer 在一帧完成后，把全部 Pane 的帧上下文一次性交给 LegendManager。主副图共享指标标题取值与格式化，管理器原子发布 `context` 和 `rows`。`context.rows` 提供主图展示行，自定义 Vue slot 和默认 DOM 使用同一份数据。`legend.visible` 只控制默认主图 DOM，外部模板仍能读取完整投影。

比较品种按主图当前时间戳读取自身真实行情。无十字线时使用主图最新时间戳，有十字线时使用指向时间戳。价格直接使用真实 close，涨幅沿用比较折线的基准；缺失行情或基准显示 `—`，不生成虚假的 0%。原始匹配行情同时暴露给外部模板。隐藏品种仍保留同一份行情与基准投影，只从曲线绘制和轴范围中排除。

K 线行情行在收盘价右侧依次显示涨跌额与 `(涨跌幅%)`，两者作为一组读数只空 1/4 格（如 `+2.00(+20.00%)`），与其它字段保持 OHLC 的常规间距；基准为光标所指 K 线的前一根收盘价，无十字线时取最新一根。首根 K 线没有前收，直接省略涨跌文本，不生成虚假的 0%。分时行情行复用同一套涨跌读数，以当日/首日前收为基准，涨跌额、涨跌幅、两位小数、括号格式与颜色规则和 K 线完全一致；前收无效时与 K 线一样保留行情行，只省略涨跌文本。涨跌文本颜色随正负取涨跌色，读数为零用正文色。

每条展示行的 `actions` 声明按钮集合、标签与边界状态，规则集中在 Core 的 `projectLegendActions`。DOM renderer 按集合展示按钮并调用统一 `execute`。显隐、关闭和排序在 Core 执行；主图指标没有排序行为，不生成上移/下移按钮，副图按 Pane 顺序保留；设置和替换通过 `LEGEND_UI_EVENT` 请求宿主打开界面，选择器提交时调用 `legend.replace`。框架和 renderer 不再按主图、副图或比较品种分发领域操作。

图例行情读数（价格精度、涨跌符号与括号格式、成交量/额缩写、涨跌颜色）只在 `legend/impl/legendQuote.ts` 定义，K 线与分时共用；成交量/成交额统一按万/亿缩写，图例不拼接单位（分时 volume 的“手”由数据契约定义），投影层只提供原始数值，不各自拼文本。图例四个语义颜色槽只在 `legend/impl/legendColors.ts` 投影，主图上下文与副图标题共用。行文本片段的间距在投影层解析为每段的最终值（首段为 0），DOM renderer 只写 `margin-left`，不再按段落位置推断容器间距。图例行统一由 `legend/impl/legendRow.ts` 创建，主图、副图与自定义行共用同一套行盒几何与文本间距解析；行几何常量（行盒高度、间距、紧凑断点、收起控件高度）只在 `legend/impl/legendGeometry.ts` 定义，`LegendRow.y` 是行盒顶部，DOM 直接使用该坐标。行盒反过来按文本行高上移半行距，保证行情行的上、左内边距一致。只有主图按图例高度预留内容区，副图标题仍叠加在指标上，详见 `pane-header-inset.md`。

主图整块收起状态属于图例领域（`legend.mainCollapsed`），DOM renderer 只提交切换意图并发起重绘；收起后主图行全部隐藏，占位只保留收起控件高度，指标全部移除时投影自动回到展开态。

旧 mainIndicatorLegend Layer、Pane title Layer、帧内 publishLegendRows、独立 legendTemplateContext 信号及 Vue 领域分发链路移除，不保留兼容入口。图例不再参与 Canvas Layer 目录或指标 renderer 元数据。
