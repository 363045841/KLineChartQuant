# K 线周期清单的唯一事实来源

## 契约

`packages/core/src/data/provider/types.ts` 的 `KLINE_PERIODS` 是周期清单唯一书写处。

- 顺序即由小到大的比较顺序，`KLinePeriod` 类型由它派生。
- `isKLinePeriod()` 是字符串收窄的唯一入口，内部复用模块私有的校验集合。
- 新增周期只改这一处，下列消费方随之生效。

## 派生关系

| 消费方 | 用法 |
| --- | --- |
| Provider 能力、缓存身份、会话恢复 | `KLinePeriod` 类型 |
| ChartDataManager 与 MarketDataCache 入参校验 | `isKLinePeriod()`，不再各自维护 Set |
| Agent 设置周期工具参数 | `Type.Enum(KLINE_PERIODS)` |
| request.security 的高低周期比较 | `KLINE_PERIODS.indexOf()` |

## Request 写法别名为什么不并入清单

`'60' → '60min'`、`'D' → 'daily'` 这类写法不是周期清单的副本，而是对外写法的解析规则，
只登记「写法与标准名不同」的差异项：标准名由 `isKLinePeriod()` 恒等放行，别名表逐条显式映射，
两侧都不做近似替代。脚本持久化保存源码文本，已保存脚本里的裸写法必须继续解析成功，
因此别名表保留在 `requestPeriod.ts`，与清单分离。

## 脚本侧对应物

Script 包的 `Timeframe` 枚举是同一份周期集在脚本作者面前的写法，取值即周期短写法，
由 `generate-script-enums.mjs` 从 plot-contracts 生成为 VM 全局枚举，成员上的 `@summary` 也一并生成，
编辑器补全因此能给出中文名。枚举收窄的是作者输入面，计划值是字符串，最终仍由 `requestPeriod()` 解析。
