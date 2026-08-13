## 📡 Data Sources

KLineChart requires a market data backend. Supported data sources:

| Data Source | Description | Docs |
|---|---|---|
| `gotdx` | Tongdaxin (GOTDX) quotes: A-share / futures / MAC, served by `GoTDX-Connecter` | [GoTDX-Connecter]({{root}}docs/data-sources/klinechartquantgo.zh-CN.md) |
| `baostock` | BaoStock A-share daily / weekly / monthly & minute K-lines, served by `Baostock-Tradingview-Connecter` | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `tradingview` | TradingView global instruments, served by `Baostock-Tradingview-Connecter` | [BaoStock]({{root}}docs/data-sources/baostock.zh-CN.md) |
| `mock` | Debug only: local MOCK-100 / MOCK-10000 K-lines, no backend needed, always online | — |

Backend repos live alongside this one (outside the monorepo).

### One-Command Dev Startup

Clone the data-source backends first (idempotent: skips directories that already exist):

```bash
pnpm setup
```

Then run `pnpm dev` with a `-c` argument to start the frontend and the selected connecters together:

```bash
pnpm dev                      # frontend only (Vite dev server)
pnpm dev -c all               # frontend + all backends (gotdx + binance + baostock)
pnpm dev -c gotdx baostock    # frontend + selected backends
pnpm dev -c tdx               # aliases supported (tdx / g / b / bnb / all)
pnpm dev -c all --lan         # same, dev server bound to 0.0.0.0 (LAN accessible)
```

Common shorthands:

```bash
pnpm dev:all                  # frontend + all backends
pnpm dev:g                    # frontend + gotdx (Tongdaxin)
pnpm dev:b                    # frontend + BaoStock / TradingView
pnpm dev:bnb                  # frontend + Binance depth
pnpm dev:lan:all              # frontend (0.0.0.0) + all backends
```

Parallel process logs stay in one terminal and are separated by colored source prefixes: `[vite]`, `[gotdx]`, `[binance]`, and `[baostock]`.

Backend only (no frontend):

```bash
pnpm connecter                # all backends
pnpm connecter gotdx          # gotdx (Tongdaxin) :8080
pnpm connecter baostock       # BaoStock / TradingView :8000
```

After `pnpm setup`, no extra setup is needed. The dev server proxies `/api/stock` → `:8000` (Baostock-Tradingview-Connecter) and `/api/public` → `:8080` (GoTDX-Connecter).
