# 成交量分布：SVP 与 PVP

## 背景

用户按 TradingView 的使用习惯提出两个诉求：一是「SVP/FWVP 效果和我以前用的不一样」，二是「需要指标有这些自定义选项」。对照 TV 官方文档（交易时段成交量分布图 SVP、周期性成交量分布图 PVP、成交量分布图基本概念）后确认，差异不在配色或默认值，而在**口径**：旧实现每个指标只画「最后一期」一个分布图，且贴在面板右缘；TV 是**每期一个分布图**，宽度按该期数据跨度缩放、可居左或居右。

TV 用两个指标覆盖两种语义：SVP 按交易时段（可为盘前/盘中/盘后分段），PVP 按「周期乘数 × 单位（K 线/天/周/月）」分段。用户日常是「两个不同周期的 PVP 组合出周固定范围的效果」，因此本实现提供 SVP 与 PVP 两个定义，后者承载阶段参数。

## 决策

1. **逐期绘制**：`resolveVolumeProfileSlices` 先把 K 线切成若干段（每 N 根/每 N 天/周/月），每段独立聚合、独立绘制。段的几何取自该段首尾 K 线的中心与 `kWidth`，因此缩放、滚动、周期切换都不需要额外布局。
2. **计算与绘制分离**：`buildVolumeProfile`（摊分、POC、价值区）与 `resolveVolumeProfileSlices`（分段）都是纯函数，单测覆盖守恒、涨跌归属、POC、价值区、时区日/周边界、合并与段数上限。
3. **渲染期聚合**：`runtime.compute` 返回 `null`。分布依赖价格域与可见范围，放进逐 bar 计算端口会在每次缩放时重放，且无法表达横向直方图。
4. **口径按 TV 对齐**：成交量 = 合计 / 上/下 / 差值；价值区从 POC 起步、**每次比较上方两行与下方两行之和，取较大一侧**扩张；POC/VAH/VAL 可分别「向右延长至价格穿越」。
5. **参数可调**：阶段数量与单位、成交量口径、价值区占比、行数、box 宽度（占该段跨度的百分比）、居左/居右、三条参考线的显隐与延长，全部通过 `runtime.inputDefs` 暴露，中文标签由 `IndicatorInputOption { value, label }` 承载。
6. **SVP 只在日内周期绘制**：日线及以上直接 return。与本轮 TV 语义一致（会话分布脱离盘中数据没有意义）。
7. **配色进令牌**：`colors.volumeProfile = { up, down, valueAreaUp, valueAreaDown, pointOfControl, valueAreaHigh, valueAreaLow, boxBackground }`，深浅主题各自定义，渲染器不写死颜色。

## 样式对齐 TradingView

参照 TV 的 PVP 设置页与实盘截图，绘制口径统一如下：

- **贴段左沿**：默认 `boxPosition = 'left'`，横条从该段首根左沿向右生长；「右」作为可选项保留给需要贴最新价位的用法。
- **连续填充**：行间不留缝（`PROFILE_BAR_GAP = 0`），只有行高不足 3 像素的极端情况才退化为逐行细线。
- **四档配色**：横条颜色由「价值区内/外」与「上涨/下跌」共同决定——价值区内用蓝（`valueAreaUp`）/黄（`valueAreaDown`）强调，价值区外用中性半透明灰（`up`/`down`）；`total` 口径统一用上涨色，`delta` 口径按差值符号取色。判定用桶中心是否落在 `[valueAreaLow, valueAreaHigh]`。
- **参考线**：POC 红实线、VAH/VAL 蓝实线，各自独立显隐；默认**横跨整段跨度**（与 TV 一致），只有勾选「向右延长」时才从段末继续延伸，直到首次被某根 K 线覆盖。
- **背景框**：先铺一层 `boxBackground` 底色再画横条，对应 TV 的「直方图框底色」；默认极淡，不干扰 K 线可读性。

## 目录元数据合并（顺带修掉的链路缺口）

静态目录（`generated/builtinIndicators.ts`）只提取编译期可求值的字段（`name`/`category`/`defaultParams` 等），**不含 `inputDefs`**；而实现加载后 `publishDefinition` 原本在目录已存在时跳过写入，导致内置指标的参数面板拿不到标题与下拉选项（表现为「参数只有原始字段名、下拉退化成文本框」）。

改为：目录已存在时，把实现提供的有值字段**合并**进静态目录（`definedDescriptor` 过滤 `undefined`）。静态目录仍负责「未加载前的可读元数据」，实现加载后补齐 `inputDefs`/`title`/`info`。这条修复同时让 SVP/PVP 的中文参数标签生效，且不改生成器。

## 备选方案与否决理由

- **脚本指标（`packages/script/scripts/*.ts`）**：脚本端口只能逐 bar 输出序列（Line/Columns/Histogram），成交量分布是「价格 → 成交量」的横向直方图，与逐 bar 输出模型正交。
- **一个指标 + `scope` 下拉参数**：周期可见性规则与阶段参数都要按参数分支走，配置面与语义面同时放大；拆成两个定义后，SVP 的参数表天然不含阶段项。
- **每根 bar 的成交量全部落到收盘价桶**：实现更简单，但会把分布压成单点，POC 与价值区失真；这里按 `[low, high]` 与桶的重叠长度比例摊分。
- **每行 tick 数布局**：TV 支持按 tick 数设行高，但 `RenderContext` 目前不提供 `tickSize`/价格精度，无法在渲染器内还原；留待把精度引入渲染契约后再做。

## 语义细节

- **摊分**：每根 bar 的成交量按价格区间与各价位桶的重叠长度线性摊分；一字线（`high === low`）整笔落到收盘价所在桶。
- **涨跌归属**：`close >= open` 记为上涨量，否则记为下跌量；同一根 bar 不跨方向拆分。
- **价值区**：从 POC 起步，每次比较上方两行与下方两行之和（`VALUE_AREA_STEP_ROWS = 2`），取较大一侧纳入，累计到 `valueAreaPercent`（默认 70%）为止；两侧相等时优先向上。
- **分段边界**：日/周/月按 `marketSession.timeZone` 取自然边界，周边界以周一为起点；`candle` 单位直接按 N 根切分。段数超过 `MAX_PROFILE_SLICES`（240）时只保留最近的段，避免远端历史把单帧绘制量拉爆。
- **宽度**：横条最大宽度 = 该段跨度 × `boxWidthPercent`，并受面板宽度 60% 上限约束；段内按成交量（或差值）归一化。
- **延长**：向右延长时从该段末根之后逐根查找第一条覆盖该价格的 K 线，取其右沿为终点；没有覆盖时停在面板右缘。
- **绘制**：横条贴该段左沿或右沿；POC 实线、VAH/VAL 实线，默认横跨整段，见上节「样式对齐 TradingView」。

## 渲染期易错点（实现时踩过）

- **几何索引是相对可视区的**：`kLineCenters` 只覆盖本帧可视 K 线，下标必须减去 `range.start`；直接用数据下标会取到 `undefined`，表现为「没有任何报错但什么都不画」。
- **参数表必须归一化**：指标实例首帧的 `params` 是 `undefined`，用户改参后也可能只记录被改字段；渲染器要按默认值补齐并逐项做类型与区间校验，不能把参数表断言成完整契约。
- **细行间距**：行高不足 3 像素时不再留 1 像素缝，否则高价区分行会碎成看不清的细线。

## 注册路径

`#352` 之后 core 只保留系统定义（`IndicatorKind.System`），纯数值指标全部由 `packages/script` 的脚本提供；`loadSystemIndicators()` 原本也只装配 System 定义。成交量分布需要自定义 `Layer.paint`，脚本端口无法表达，因此作为**渲染型指标**留在 core：

- 两个定义声明 `kind: IndicatorKind.Indicator`，选择器目录（`indicatorCatalog()` 只收 `kind === Indicator`）因此能看到并添加它们；
- `loadSystemIndicators()` 的装配范围放宽为「System ∪ core 自带的 Indicator」，否则定义不会被注册，主图白名单（`ChartIndicatorManager.mainCatalog`）也不含它们，添加时会被拒绝；
- `registerBuiltins.test.ts` 相应拆成「系统图层名」与「渲染型指标名」两组断言，防止后续把数值指标继续塞回 core。

## 周期可见性契约

SVP 只在日内周期有意义，日线及以上不应出现。这个「可见范围」在 TradingView 里是指标输入的一项，属平台能力，因此契约下沉到 core 而不是写死在 SVP 内部：

- `IndicatorMetadata.visiblePeriods?: readonly IndicatorPeriodVisibility[]`，每项是 `{ unit: 'minute'|'hour'|'day'|'week'|'month'|'quarter', min?, max? }`；省略即该单位全段可见，整个字段缺省即所有周期可见（既有 58 个指标零改动）。
- `indicatorPeriodVisibility.ts` 提供两个纯函数：`parseIndicatorPeriod(period)` 把 `'15min' | '4h' | 'daily' | …` 解析成 `{ unit, value }`，`isIndicatorVisibleOnPeriod(period, ranges)` 做区间判定；未知周期按可见处理，避免新周期一上线就把指标全藏起来。
- 拦截点只有两处，且都在 core：
  1. `renderers/Indicator/factory.ts` 的 `createIndicatorLayer` 用 `visiblePeriods` 包一层 `paint`，周期不匹配直接返回，所有指标渲染器自动获得该能力（未声明的定义原样复用 Layer，零开销）；
  2. `legend/impl/LegendManager.ts` 在建主图模板与收集副图行时按 `context.period` 过滤，图例与画面同进同退——图例是 core 投影出来的（`projectFrame` → `collectFrameRows`），vue 层没有过滤入口。
- `@Indicator` 装饰器与静态目录提取器（`scripts/generate-indicator-entrypoints.mjs` 的字段白名单）同步支持该字段，选择器在定义未加载前也能读到。
- SVP 声明 `visiblePeriods: [{ unit: 'minute' }, { unit: 'hour' }]`；原来的 `isIntradayPeriod` 守卫随之删除，避免「渲染器自检 + 工厂拦截」两套真相。

## 影响


- 新增 `packages/core/src/engine/renderers/volumeProfile/`（`types.ts`、`impl/period.ts`、`impl/build.ts`、`impl/render.ts`、`index.ts`），删除旧的单段实现 `renderers/volumeProfile.ts`。
- `packages/core/src/foundation/tokens/types.ts` 新增 `VolumeProfileColors`；`theme-{dark,light}.ts` 新增 `volumeProfile` 配色。
- `indicatorCatalog.ts` 支持 `{ value, label }` 形式的选项；`indicatorMetadata.ts` 的 `IndicatorInputDef.options` 相应放宽，新增 `IndicatorInputOption`。
- `indicatorDefinitionRegistry.ts` 增加目录字段合并（`definedDescriptor`）。
- `packages/vue/preview/App.vue` 的 `?indicators=` 联调口子同步为 `SVP,PVP`。

## 验证

- `packages/core` 的 `volumeProfile` 单测 13 例：摊分守恒、涨跌归属、POC 与价值区覆盖、空/退化区间、四种分段单位、时区、合并、段数上限、目录登记（主图身份 + 中文选项）。
- `pnpm indicators:generate` 输出「已自动发现 7 个 @Indicator 定义」；`pnpm indicators:check` 无漂移。
- `pnpm type-check:src` 通过；`src/engine/renderers/volumeProfile` 与 `src/engine/indicators` 合计 8 个测试文件 / 54 例通过。
