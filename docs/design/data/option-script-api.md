# 期权脚本接口：实施记录

状态：四步全部落地（2026-11-14），已用真实行情与真实期权数据在预览页目视确认（`ego lite` 未安装，用本机 Chrome 驱动）。

看盘解读（OI 墙与 Γ 加权墙的差别、正负 gamma 基调、误读清单）见
[option-walls-guide.md](./option-walls-guide.md)。

## 已完成

| 层 | 位置 | 内容 |
| --- | --- | --- |
| 契约 | `packages/plot-contracts/src/market.ts` | `OptionLevelsRequest`、`OptionLevelsRow`（含 `atmIvPercent`）、`IndicatorMarketContext.loadOptionLevels`、`optionUnderlying`、`DEFAULT_OPTION_HISTORY_ROWS = 1440` |
| 只读接口 | `packages/analytics/src/serve/impl/server.ts` | `GET /options/levels`（某日最新一行）、`GET /options/series`（跨日最近 N 条） |
| 宿主取数 | `packages/core/src/engine/data/marketRuntime/impl/optionLevelsLoader.ts` | 调 8093，按标的 60 秒缓存，失败返回空数组 |
| 品种映射 | `packages/core/src/foundation/config/optionUnderlying.ts` | `BTCUSDT` / `BTCUSDT.P` → `BTC`、`ETHUSDT` → `ETH`、`XAUUSD` → `XAUUSD`；无映射返回 null |
| 接线 | `marketRuntime.ts` 的 `context()` | 把 `loadOptionLevels` 与映射结果挂进指标上下文 |
| 脚本对象 | `packages/script/src/option/types.ts` + `quickjs/runtime/option.ts` | `option.levels()` / `option.history(limit)`；数据经 `__optionContext` 注入两个运行时 |
| 载荷 | `prepareScriptMarketData` → `ScriptRequestContext.optionLevels` → Worker 传输 | 一次只带一个标的；只在快照身份变化时发送，`null` 表示清空 |
| 指标 | `packages/script/scripts/option-levels.ts`（主图）、`option-volatility.ts`（副图） | 三条关键位（Gamma 翻转 / Call 墙 / Put 墙，墙位用 OI×Γ 加权）；ATM IV 与 P/C 比 |
| 采集 | NAS `kcq-collector`（Docker，`/volume1/kcq/analytics` 挂成 `K:`） | 新行 `schemaVersion: 2`；翻转位算法改动后需重建该容器才生效 |

## 实施中的决定

1. **数据用执行载荷，不走编译期改写**（原文档方案 A）。`option` 的完整实现在 runtime prelude 里，两个后端共用一份源码；新增字段只需改契约与序列化，不动 AST 改写链路。
2. **期权快照单独传输，不塞进 `RequestExecution`**。`RequestExecution` 只表示「request 对齐结果」；期权数据放 `ScriptRequestContext.optionLevels`，由传输层按身份差异发送（标的 + 行数 + 首末采集时刻），逐帧重发几千行会白白复制结构化克隆。
3. **`optionLevels` 在执行选项里是必填的 `Snapshot | null`**，而不是可选：可选会让「本次没有数据」和「沿用上次」在类型上分不开，换到没有映射的品种时会把上一只标的的线留在图上。
4. **契约新增两处**：`OptionLevelsRow.atmIvPercent`（副图需要，采集行里本来就有 `nearTerm.atmIvPercent`）、`IndicatorMarketContext.optionUnderlying`（脚本要知道本次数据属于哪个标的）。`IndicatorMarketContext` 加必填字段会让所有测试替身在编译期暴露，这是刻意的。
5. **映射键用裸代码**，解析时去掉展示用的 `.P` 后缀；`XAUUSD` 暂时是恒等映射（目前没有原生期权源），接入 GLD ETF 代理后改右侧一处即可，脚本不用动。
6. **两个指标脚本，而不是一个**。`position` 是整脚本级（`main` / `sub` 二选一），主图与副图无法合并；副图里 ATM IV 是百分数、P/C 是比值，P/C 按 ×100 画在同一百分比轴，图例写明「×100」。
7. **不画 ±σ 区间**（2026-11-14 用户反馈后改）。区间不是水位：两条填充带叠在 K 线后面既挡价格，也读不出方向。主图只保留 Call 墙、Put 墙与 Gamma 翻转三条水位。
8. **DTE 告警用末根 `label`**。`plot` 的图例名在第一次输出时固定，不能随 bar 变化；`label.new` 在末根标注「今天到期（DTE x.xx）」，每根 bar 先删后建，回滚重算不留残影。
9. **期权线只画最近 30 天**。更早的 bar 留空，主图让给结构类指标；这条规则写在脚本常量 `RECENT_DAYS` 里。
10. **按 bar 的收盘时刻取快照**。采集发生在 bar 之内，若按 bar 开盘时刻比较，当前 bar 永远取不到本周期刚采到的那一行，图上一条线都不会出（目视检查时就是这样暴露的）。取 `barEnd = barTime + timeframe.in_seconds() * 1000`，并用 `capturedAt < barEnd` 判断归属。
11. **关键位画阶梯线，不画折线**（2026-11-14 用户反馈后改）。关键位是「水位」不是趋势，折线会把每次换代连成斜线，看着像价格趋势。改用 `plot.StepLine`：换代前保持水平，换代处垂直跳一档。
12. **换代才有一次跳**：相对变化超过 `0.15%` 才算一次换代，与 cloudtradeagent 后端 `_merge_generations`（`_GEN_TOLERANCE = 0.0015`）同一口径。分钟级采集下关键位每分钟都在小幅漂移，不加这个阈值阶梯线会一分钟抖一次。归并在脚本里做（`generations()`），一次快照算一次并缓存。
13. **末根写价签**：在末根按价格打右对齐文字（`Call 墙 75000`、`Put 墙 69000`、`Gamma 翻转 …`），颜色沿用 cloudtradeagent 的语义（Call 绿 / Put 红 / 翻转紫），只靠图例读不出价位。价签用 `label` 绘图对象，不用 `plot.Char`，避免多出几条无意义的图例项。
14. **未移植 cloudtradeagent 的毛刺剔除**：它会在「换代后 1 小时内反向跳回、且前后两跳都 >5%」时丢弃该代际。我们的脚本只拿到最近 30 天的行，没有后端代际表，暂时不做；真出现毛刺时表现为一次离谱的竖跳，后续可补。
15. **Gamma 翻转位由宿主算，脚本只画**（2026-11-14 用户反馈「gamma 位没有计算和显示」后改）。原实现按行权价累计净 GEX 找负转正，那是价格轴的代理：单方向持仓占优时几乎总是同号，实测近月与全链长期为 null，图上一直没有这条线。改为扫现价轴（`packages/analytics/src/options/impl/aggregate.ts`）：±20% 分 41 个候选点，每点等比平移期货价重新定 gamma，取离现价最近的一次过零并插值，偏离现价超过 10% 视为本轮无翻转。
16. **到期提示右对齐**（`align: 'right'`，`offsetY: 14`），文字向历史方向展开，不压右侧价格轴。
17. **近月桶跳过薄日签**（2026-11-14，与 cloudtradeagent 对账后改）。原实现无条件取最近到期日，Deribit 的日签常常只有几千张，墙位只代表零星挂单。改为「`0.15 <= DTE <= 14` 天内、持仓达到窗口最大桶 30% 的最近到期日」，下限 0.15 天让指标在交割前自动换桶，窗口内没桶时退回最近的未来到期日。
18. **墙位主口径改 OI×Γ 加权**（2026-11-14，同上）。契约新增 `callGammaWallUsd` / `putGammaWallUsd`；主图三条水位与快速解读用加权墙，面板把加权墙与 OI 墙并排显示。OI 墙保留为「仓位聚集」的副口径，两个口径的语义写进描述，避免混读。

## 验证

1. 构建：`plot-contracts`、`core`、`script` 全部通过；`generated/runtime.ts`、`generated/builtinScripts.ts`、`editor/resources.ts`、`docs/script/api.md` 由构建重新生成。
2. 类型检查：`pnpm type-check:src` 通过；`pnpm type-check:tests` 只剩既有错误 `packages/analytics/src/__tests__/orderflow-panel.test.ts`（`VenueSnapshot` 缺 `cvd`，与本改动无关）。
3. 测试：`packages/script` 38 文件 / 597 例、`packages/script-chart` 19 例、`packages/core` 2902 例通过。新增用例：`option/__tests__/optionApi.test.ts`（双后端查数、NaN 保留、limit 校验）、`worker/__tests__/transport.test.ts`（只在变化时重发、null 清空）、`script-chart/scripts/__tests__/optionLevels.test.ts`（映射取数进脚本、映射消失后清空）、`foundation/config/__tests__/optionUnderlying.test.ts`。
4. 数据面：8093 服务在跑，`GET /options/series?currency=BTC&limit=3` 返回 schemaVersion 2 行，`nearTerm.atmIvPercent = 22.57`，与 loader 字段一致。
5. 用真实形状的数据直跑两个内置脚本（Node + QuickJS）：主图出 3 条阶梯线与 3 个末根价签（`Gamma 翻转` / `Call 墙` / `Put 墙`）、末根出现「今天到期」标签；副图出 `atm-iv` 与 `pcr`（×100）。
6. **目视已验证**（本机 Chrome + playwright-core 驱动预览页）：选 `BTCUSDT`（Binance 永续）、切 5min，挂期权关键位：

   | 检查项 | 结果 |
   | --- | --- |
   | 指标出现在指标面板并可挂载 | 通过 |
   | 图例数值与 8093 服务一致 | 通过（Call 墙 69000、Put 墙 66000、Gamma 翻转 68723.89） |
   | ±σ 填充带已移除 | 通过（图上只剩三条水位，无灰色区间） |
   | Gamma 翻转线渲染 | 通过（紫色虚线 + 末根价签，数据来自新算法算出的真实行） |
   | 末根「今天到期」标签 | 通过（`期权 2026-11-15 今天到期（DTE 0.90）`，右对齐不压价格轴） |
   | 控制台错误 | 无 |

   未覆盖：Docker 采集容器（`/volume1/kcq/analytics`）仍跑改动前的聚合代码，它每分钟写入的新行翻转位是 `null`；重建容器后这些行才会带上翻转位。脚本侧对 `null` 行是逐行跳过，所以图上不会因旧行消失。
   已知表现：1day 周期上 v2 历史只从当天 02:52 开始，只有最后一根 bar 有值，单点画不出线；换成 5min 就有可见线段。
7. **阶梯线版本复验**（2026-11-14，ego lite 0.6.3.14 驱动预览页，5min · BTCUSDT.P · 同挂 CHAN/PVP/SVP）：

   | 检查项 | 结果 |
   | --- | --- |
   | Call 墙 / Put 墙 画成水平直线并贯穿可见历史 | 通过（75000 / 69000） |
   | 末根价签 | 通过（`Call 墙 75000` 绿、`Put 墙 69000` 红） |
   | σ 上下界按阶梯跳变 | 通过（可见连续横段 + 垂直换档） |
   | 到期提示 | 通过（`期权 2026-11-14 今天到期（DTE 0.38）`） |
   | 图例数值 | 与 8093 一致 |
   | 控制台错误 | 无 |

   未覆盖：墙位**随时间移动**的可视证据。当前 78 行快照里 75000/69000 一直没换代，只有 σ 有换档；换代逻辑由 `generations()` 的阈值规则保证，等墙位真换代时才会看到竖跳。

## 已知约束

- 旧行（schemaVersion 1）不含 `nearTerm`，读取时跳过；历史线从 2026-11-14 起积累。
- 近月 DTE 很小时墙位持仓天然很小，绘制层显示 DTE 并在末根告警。
- 服务未启动时 `loadOptionLevels` 返回空数组，指标画空而不是报错。
- 最近 30 天的行上限是 1440 条（约一整天分钟级采集）；需要更长区间时调 `DEFAULT_OPTION_HISTORY_ROWS`，脚本不用改。
