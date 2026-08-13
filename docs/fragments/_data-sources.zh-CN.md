## 📡 数据源

KLineChart 需要行情数据后端支持。支持的数据源如下：

| 数据源 | 说明 | 文档 |
|---|---|---|
| `gotdx` | 通达信（GOTDX）行情：A 股 / 期货 / MAC，由 `GoTDX-Connecter` 提供 | [GoTDX-Connecter]({{root}}docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A 股日 / 周 / 月及分钟 K 线，由 `Baostock-Tradingview-Connecter` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView 全球品种，由 `Baostock-Tradingview-Connecter` 提供 | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `mock` | 调试用：本地生成 MOCK-100 / MOCK-10000 K 线，无需后端，探测恒为在线 | — |

后端仓库与本仓库同级（不在 monorepo 内）。一条命令即可全部拉取：

```bash
pnpm setup   # 幂等：目录已存在则跳过
```

### 一条命令启动开发环境

`pnpm dev` 带 `-c` 参数即可同时启动前端与选定的数据源后端：

```bash
pnpm dev                      # 仅前端（Vite 开发服务器）
pnpm dev -c full              # 前端 + 全部后端（gotdx + binance + baostock）
pnpm dev -c gotdx baostock    # 前端 + 指定的后端
pnpm dev -c tdx               # 支持别名（tdx / g / b / bnb / all）
pnpm dev -c full --lan        # 同上，前端绑定 0.0.0.0（局域网可访问）
```

常用简写命令：

```bash
pnpm dev:full                 # 前端 + 全部后端
pnpm dev:g                    # 前端 + gotdx 通达信
pnpm dev:b                    # 前端 + BaoStock / TradingView
pnpm dev:bnb                  # 前端 + 币安深度
pnpm dev:lan:full             # 前端（0.0.0.0）+ 全部后端
```

并行进程的日志集中在同一终端，并用彩色来源前缀区分：`[vite]`、`[gotdx]`、`[binance]`、`[baostock]`。

仅启动后端（不带前端）：

```bash
pnpm connecter                # 全部后端
pnpm connecter gotdx          # gotdx 通达信（:8080）
pnpm connecter baostock       # BaoStock / TradingView（:8000）
```

执行 `pnpm setup` 后无需任何额外配置。开发服务器代理 `/api/stock` → `:8000`（Baostock-Tradingview-Connecter）、`/api/public` → `:8080`（GoTDX-Connecter）。
