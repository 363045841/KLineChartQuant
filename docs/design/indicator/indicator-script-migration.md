# 内置指标迁移到脚本框架

## 目标

把 core 中「纯逐 bar 数值序列」类内置指标改为脚本指标（`packages/script/scripts/*.ts`），
删除对应的原生定义、calculator、renderer 与 state 契约：一个指标只有一处实现。

非目标：结构类（`structure`/`zones`）、需要额外数据源的定义（`footprint`/`volumeProfile`）、
以及 `kind: system` 的系统定义不参与迁移。

## 契约层只增一个字段：业务分类

脚本走中立定义 `IndicatorDefinition`，core 经 `registerPlotIndicator` 翻译成 `IndicatorMetadata`。
迁移唯一需要补的是**业务分类**：它决定指标选择器分组，原生由 `@Indicator({ indicatorType })` 声明，
脚本此前没有对应字段，只能被写死成 `other`。

落地（已完成）：

- 词汇放叶子契约 `plot-contracts/src/indicatorType.ts`：`IndicatorType` 类型 + 同名枚举 + `isIndicatorType`。
  core 与 script 共用同一份取值，core 的 `IndicatorTypeRegistry` 改为从契约 re-export。
- `defineIndicator` 新增 `indicatorType?: IndicatorType`，宿主注入 `IndicatorType` 枚举，
  编辑器声明同名全局；跨 VM 边界校验非枚举值。
- `registerPlotIndicator` 落 `definition.indicatorType ?? IndicatorType.Other`，不再写死。

## 脚本身份只保留 name

脚本不再声明 `displayName`。原生 `@Indicator` 的 `name` 是被 renderer / calculator 按名字
引用的代码键，因此必须另有一个对外展示身份；脚本没有这层代码键引用，`name` 同时就是对外的
定义 id、目录展示名与实例身份，再声明一份 `displayName` 等于把同一个值填两遍。
注册表 `normalizeIndicatorId` 对大小写不敏感，纯大小写差异不产生新身份，只影响展示，
因此这类 `displayName` 连"别名"的作用都没有。

落地：

- 契约删字段：`IndicatorSourceDefinition`、`IndicatorDefinition`、`QuickJSScriptDefinition`，
  以及 VM 元数据读取与 `defineIndicator` 的跨边界校验。
- `registerPlotIndicator` 落 `displayName: definition.name`；core 的 `IndicatorMetadata.displayName`
  保留，原生指标仍以它为对外身份。
- 迁移脚本的 `name` 直接取原 `displayName`（`BOLL` / `RSI` / `KDJ` / `Donchian` …），
  选择器标签与目录键不变，副图 pane id 回到迁移前的 `sub_RSI` / `sub_FASTK` / `sub_STOCH`。
- 副本只改写 `name`，去掉"name 与 displayName 同为固定身份"的双身份校验。

## 明确不引入的东西

这些不是计算框架的职责，脚本自身就能表达，因此不往契约里加：

| 事项 | 处理方式 |
| --- | --- |
| 配色 | 脚本里直接写 CSS 串，常用色可用内置 `Color` 枚举（固定色值，仍不做 token/role 通道）；颜色本就是指标自身配置。 |
| 坐标轴范围 | `plotRange` 已按输出数据计算，输出 0~100 就渲染 0~100，无需声明。 |
| 参考线（如 RSI 80/50/20） | 脚本自己 `plot.Line(80, { id: 'overbought', dash: [4, 4], color })` 画。 |
| 逐线显隐 | 只有同族平行多线才声明逐线布尔 `input`（如 MA5/MA10/MA20、RSI6/12/24）；一个整体的多条线（BOLL 通道、KDJ 的 K/D/J）不做开关。 |
| 图形尺寸 | 所有 Plot 类型共用公共 `size: ShapeSize`（`auto/tiny/small/normal/large/huge`），各自不再声明 `width`/`radius`/`minHeight`/`maxHeight`；枚举到像素的换算只在渲染层 `plotSize.ts` 一处，`auto` 保持各类型原有基准尺寸。 |
| 轴精度、图例数值 | 沿用通用默认；不迁移 `getTitleInfo` / 专用 scale 插件。 |

## 分发与执行边界

迁移指标由 Script 包的 `scripts/*.ts` 单独实现，生成器自动纳入 `builtinScriptSources`。
应用通过 script-chart 的 `createScriptService([], { builtinSources })` 注册；core 不内置脚本引擎。
仅使用 core 的消费者需要显式接入 Script 包才能使用迁移指标，不保留原生兼容实现。
脚本沿用通用 inline 执行入口，不再出现在 core Worker calculator 映射中。

本批仅支持 K 线视图，不声明分时视图能力。分时输入和投影不属于本批迁移范围。

## 批次

| 批次 | 指标 | 说明 |
| --- | --- | --- |
| 第一批（已迁移） | `rsi` `mom` `roc` `wma` `boll` `donchian` `fastk` `wmsr` `stoch` | 仅 K 线；保留原默认参数、预热及计算规则；只有 RSI 是周期族多线，保留逐线开关 |
| 第二批 | `ma` 及状态机与位移型：`sar` `supertrend` `macd` `atr` `keltner` `ichimoku` `obv` `pvt` `vwap` `mfi` `cmf` `dpo` `trix` `kst` `stc` `fisher` `uo` `hv` `parkinson` `chaikinVol` `stochRSI` | 按需追加 ta 原语与确认视图范围 |
| 第三批 | 其余 MA 家族：`kama` `frama` `vidya` `t3` `hma` `zlema` `lsma` `alma` `trima` `smma`、`pivot` `fib` | 需追加 ta 原语 |
| 不迁移 | `footprint` `volumeProfile` `structure` `zones`、5 个 system 定义 | 需要新 plot 图元或额外数据源 |

## 落地切片（每片独立可测）

1. **ta 原语**（已完成）：`sum` / `stddev` / `mom` / `roc`，含参考实现对照与线性复杂度用例。
2. **业务分类字段**（已完成）：如上。
3. **第一批脚本 + 删除原生实现**（已完成）：删除原生定义、专用 scale、calculator、
   Worker 映射与静态身份条目，重新生成原生目录；保留其他指标仍依赖的通用计算原语。
   指标数值测试归 Script 包，core 通用布局、图例、投影测试改用仍在 core 的定义。
4. **分发**（已完成）：随 Script 包自动发现，script-chart 验证整份内置目录注册和实际计算。

## 计算规则

- RSI 使用通用 `ta.rsi`（Wilder 平滑，窗口内无下跌含平盘为 100），三周期各自预热；
  指标源码不含顶层可变状态，重算与追加历史都不依赖前一次运行。
- Stoch 保留原 KDJ 规则：K 为 RSV，D 为 K 的 m 周期均值，J = 3K - 2D；
  三线从 D 就绪时同时输出，J 可超出 0~100。D 依赖对 K 序列再平滑，目前仍在指标源码内维护窗口。
- BOLL 使用总体标准差；FastK/WMSR 平盘分别输出 50/-50；ROC 的零基期留空。
- 参考线由脚本绘制，坐标轴使用实际 Plot 范围，不保留原生固定范围和主题 token 通道。

## 验证边界

宿主应用与 QuickJS VM 使用不同的全局作用域。根类型检查分别检查 runtime 专用配置和
应用配置，避免把 VM 中的 `close`、`time`、`defineLibrary` 等全局误当成宿主模块变量。
发布脚本通过真实 VM 测试数值、预热、空输入、显隐和重算隔离；编辑器测试逐份检查内置源码。

## 约束

- 不做双写、不加运行期分支；迁移窗口内原生与脚本是**不同指标**共存，不是同一指标两份实现。
- 每片都必须通过 `pnpm test:packages` 与 `pnpm type-check`。
