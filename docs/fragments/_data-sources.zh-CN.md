## 📡 数据源

KLineChart 需要行情数据后端支持。支持的数据源如下：

| 数据源 | 说明 | 文档 |
|---|---|---|
| `gotdx` | 通达信（GOTDX）行情：A 股 / 期货 / MAC，由 `GoTDX-Connector` 提供 | [GoTDX-Connector]({{root}}docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A 股日 / 周 / 月及分钟 K 线，由 `Baostock-Tradingview-Connector` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView 全球品种，由 `Baostock-Tradingview-Connector` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `mt5` | MT5（Exness）本地终端：外汇 / 金属 / 加密 CFD，由 `KCQ-MT5-connector` 提供 | [MT5]({{root}}docs/data-sources/mt5.zh-CN.md) |
| `mock` | 调试用：本地生成 MOCK-100 / MOCK-10000 K 线，无需后端，探测恒为在线 | — |

后端仓库与本仓库同级（不在 monorepo 内）。

### 一条命令启动开发环境

先安装数据源后端：

```bash
pnpm setup:backends
```

再 `pnpm dev` 带 `-c` 参数即可同时启动前端与选定的数据源后端：

```bash
pnpm dev                      # 仅前端（Vite 开发服务器）
pnpm dev -c all               # 前端 + 全部后端（gotdx + binance + baostock，不含 mt5）
pnpm dev -c gotdx baostock    # 前端 + 指定的后端
pnpm dev -c mt5               # 前端 + MT5 本地终端（Windows + 已登录 MT5 (Exness) 终端）
pnpm dev -c tdx               # 支持别名（tdx / g / b / bnb / m / all）
pnpm dev -c all --lan         # 同上，前端绑定 0.0.0.0（局域网可访问）
```

常用简写命令：

```bash
pnpm dev:all                  # 前端 + 全部后端
pnpm dev:g                    # 前端 + gotdx 通达信
pnpm dev:b                    # 前端 + BaoStock / TradingView
pnpm dev:bnb                  # 前端 + 币安深度
pnpm dev:mt5                  # 前端 + MT5 本地终端
pnpm dev:lan:all              # 前端（0.0.0.0）+ 全部后端
```

并行进程的日志集中在同一终端，并用彩色来源前缀区分：`[vite]`、`[gotdx]`、`[binance]`、`[baostock]`、`[mt5]`。

仅启动后端（不带前端）：

```bash
pnpm connector                # 全部后端（不含 mt5）
pnpm connector gotdx          # gotdx 通达信（:8080）
pnpm connector baostock       # BaoStock / TradingView（:8000）
pnpm connector mt5            # MT5 本地终端（:8090，Windows + 已登录 MT5 (Exness) 终端）
```

执行 `pnpm setup:backends` 后无需任何额外配置。开发服务器代理 `/api/stock` → `:8000`（Baostock-Tradingview-Connector）、`/api/public` → `:8080`（GoTDX-Connector）。
