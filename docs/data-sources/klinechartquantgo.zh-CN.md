# GoTDX-Connecter（GOTDX + Binance，原 KlineChartQuantGo）

## 简介

GoTDX-Connecter 是 Go 实现的多数据源代理，单一 module（`KlineChartQuantGo`），包含两个独立服务：

- **tdx-api**（`:8080`）：通达信协议（gotdx），提供 A 股 / 期货 / MAC K 线、分笔、列表与搜索
- **binance-api**（`:8081`）：币安 L2 订单簿 + SSE 深度流

本地仓库与 `GoTDX-Connecter` 保持同级目录（不在本 monorepo 内）。用 `pnpm setup` 一键克隆：

```
workspace/
├── KLineChartQuant/           # 本仓库
└── GoTDX-Connecter/           # GOTDX + Binance 数据代理
```

```bash
pnpm setup   # 幂等：目录已存在则跳过
```

## 使用方法

- gotdx fetcher：`packages/core/src/data/provider/sources/gotdx.ts`
  - 默认地址 `http://127.0.0.1:8080`，请求 `/api/stock/kline-by-date`、`/api/ex/kline-by-date`、`/api/symbol/search`、`/api/stock/history-tick` 等
  - 支持周期：`1min` ~ `yearly`，以及搜索
- binance 深度：`packages/core/src/data/depth/binance.ts`
  - SSE 默认地址 `http://localhost:8081/api/binance/depth-events?symbol=<symbol>`
- 运行时可通过 `setFetcherBaseUrl('gotdx', ...)` 覆盖默认地址

## 启动方式

在本仓库根目录统一启动：

```bash
pnpm connecter tdx        # gotdx 通达信，默认 8080
pnpm connecter binance    # 币安深度，默认 8081
```

或在 `GoTDX-Connecter` 根目录执行：

```bash
# 通达信，默认 8080
go run . tdx
# 或：go run ./services/tdx-api

# 币安，默认 8081
go run . binance
# 或：go run ./services/binance-api
```

构建产物：

```bash
go build -o tdx-api.exe ./services/tdx-api
go build -o binance-api.exe ./services/binance-api
```

环境变量：

| 服务 | 变量 | 默认值 | 说明 |
|---|---|---|---|
| tdx-api | `PORT` | `8080` | HTTP 监听端口 |
| tdx-api | `GOTDX_AUTO_SELECT` | 空 | 设为 `"1"` 自动选择最优服务器 |
| tdx-api | `GOTDX_MAIN_HOSTS` / `GOTDX_EX_HOSTS` / `GOTDX_MAC_HOSTS` | 内置列表 | 服务器探测地址，逗号分隔 |
| binance-api | `PORT` | `8081` | HTTP 监听端口 |
| binance-api | `SYMBOLS` | `btcusdt,ethusdt` | 订阅交易对，逗号分隔 |
| binance-api | `HTTP_PROXY` / `HTTPS_PROXY` | `http://127.0.0.1:6666` | 访问币安的代理 |
