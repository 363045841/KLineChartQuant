<!-- 成交量分布的样式参数与可见周期参数：契约、默认值与生效链路。 -->

# 成交量分布的配色与可见周期

SVP 与 PVP 共用同一套参数与绘制实现。本次让用户可调两件原本写死的事：各部位的颜色与不透明度、指标在哪些周期出现。

## 要解决的问题

调整前这两项都只有一处来源，且都不暴露给用户：

- 颜色只有主题的 `colors.volumeProfile` 一个来源，用户无法改；
- 可见周期只有定义级 `visiblePeriods` 一个来源，且只有 SVP 声明了它。

参数面板的控件契约 `IndicatorInputDef` 当时只支持数值（min/max/step）与下拉（options），没有颜色控件，所以「加颜色参数」不只是给指标加字段，必须先扩面板契约。

## 决策

### 1. 颜色参数用空串表示「跟随主题」

参数 `upColor` 等效位取值是 `''` 或 `#rrggbb`。空串表示继续用主题色，非空表示覆盖。

不把主题色复制进默认参数，理由有两个：主题色分深浅两套且各自调过，复制会立刻产生第二份事实来源；复制之后主题改色，指标不会跟。空串语义让「默认等于主题」成为结构上的保证，而不是靠人同步。

### 2. 不透明度是相对主题 alpha 的缩放，不是绝对取值

参数 `upOpacity` 是百分比，最终 alpha = 主题色 alpha × 该百分比。

若按「绝对 alpha」实现，默认值必须写成各部位的具体数字（深浅主题的 up 分别是 50% 与 10%，boxBackground 是 4% 与 3%），这些数字会与主题脱钩；主题一旦调透明度，指标又不跟。按缩放实现时默认统一为 100，语义是「保持主题原样」，深浅主题都自动一致。

代价是「不透明度 100」不等于「完全不透明」，而是「不打折」。这与参数标题「不透明度」略有出入，因此参数标题写成「不透明度」并在字段注释里写明是相对主题的缩放。

### 3. 可见周期用实例参数表达区间，不新增定义级机制

参数 `visibleFrom` / `visibleTo` 取周期键（`1min`…`yearly`），两端都含，按 `PERIOD_PARTS` 的声明顺序比较长短。

SVP 原本靠定义级 `visiblePeriods: [minute, hour]` 隐藏日线以上。改为把默认区间写成 `1min`–`4h` 之后，定义级声明对它是多余的，因此从 SVP 定义里删除，避免「参数说年线、声明说小时」的双重真相。定义级 `visiblePeriods` 机制保留（其他指标仍可声明硬上限），`isIndicatorVisibleOnPeriod` 把两者按交集叠加。

由此得到一个有用的性质：SVP 在默认参数下的行为与改动前完全一致（日线及以上不绘制、不进图例），而用户若明确改成「1 分钟 ~ 年线」，日线上的会话分布会正常出现，不会被隐藏声明否决。

区间由 `resolveIndicatorPeriodRange(定义默认参数, 实例参数)` 解析：实例参数只保存改动过的字段，缺失项用定义默认值补齐。不补齐会让「没改过参数」与「改成默认值」产生不同可见性——已保存的旧布局正属于前者，它们没有这两个新字段。

### 4. 参数必须真正到达渲染层：主图链路此前漏传

主图指标 Layer 由 `ChartIndicatorManager.buildMainIndicatorLayer` 构造，此前只传了 `paneId` / `indicatorId` / `instanceId` / `definition`，没有传 `params`。副图链路（`SubPaneManager.mount`）一直传，所以这个缺口只影响主图叠加指标。

后果是主图指标的参数改动全部无效：参数变更确实重建了 Layer，但新建出来的 Layer 仍然拿 `undefined` 参数，`readParams` 只能回落默认值。新增的颜色与周期参数都依赖这条链路，因此同一次改动里补上。

回归用例：启用 SVP 后在 `daily` 周期绘制应为零次 `fillRect`，在 `5min` 周期应至少一次。移除 `params` 传参后该用例失败（实测 121 次绘制），证明用例不是形同虚设。

### 5. 图例与绘制用同一判定

图例过滤原来只读定义级 `visiblePeriods`。参数化之后两处必须一致，否则会出现「画布上没有、图例里还在」。`LegendManager.isVisibleOnPeriod` 增加可选参数入参：主图按定义 id 从实例目录取参数，副图直接用当前实例的参数；两处都用同一个 `resolveIndicatorPeriodRange` 补齐默认值。

## 默认值对照

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `*Color`（8 个部位） | `''` | 跟随主题 |
| `*Opacity`（8 个部位） | `100` | 保持主题原有 alpha |
| `visibleFrom` | `1min` | |
| `visibleTo` | PVP `yearly` / SVP `4h` | SVP 停在日内 |

可调部位与主题 `colors.volumeProfile` 字段一一对应：`up`、`down`、`valueAreaUp`、`valueAreaDown`、`pointOfControl`、`valueAreaHigh`、`valueAreaLow`、`boxBackground`。

## 面板契约

`IndicatorInputDef` 增加 `color?: boolean`。面板把它映射成 `ParamConfig.type === 'color'`，渲染成色块按钮 + 原生取色器（隐藏）+ 恢复主题按钮；空值态用斜纹底纹加「主题」字样，避免与纯黑混淆。

只加一个布尔开关而不是完整控件模型，是因为当前需要只有「取色」这一种；等出现第二种非标控件再抽通用类型。

## 验证

- `pnpm -C packages/core test`：全量通过（见提交说明）。
- 颜色解析、参数归一化、区间判定、Layer 拦截、主图参数透传均有单测；图例过滤只经类型检查，没有专门单测（`LegendManager` 目前没有用例夹具）。
