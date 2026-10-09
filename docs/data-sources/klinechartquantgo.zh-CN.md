# GoTDX-Connector（GOTDX，原 KlineChartQuantGo）

## 简介

GoTDX-Connector 是 Go 实现的多数据源代理，单一 module（`KlineChartQuantGo`），当前提供 tdx-api 服务：

- **tdx-api**（`:8080`）：通达信协议（gotdx），提供 A 股 / 期货 / MAC K 线、分笔、列表与搜索

> 币安现货 K 线与逐笔成交已独立为 `Binance-Connector`，不再由此仓库提供。

本地仓库与 `GoTDX-Connector` 保持同级目录（不在本 monorepo 内）。用 `pnpm setup:backends` 一键克隆：

```
workspace/
├── KLineChartQuant/           # 本仓库
└── GoTDX-Connector/           # GOTDX 数据代理
```

```bash
pnpm setup:backends   # 幂等：目录已存在则跳过
```

## 使用方法

- gotdx fetcher：`packages/core/src/data/provider/impl/sources/gotdx.ts`
  - 默认地址 `http://127.0.0.1:8080`，请求 `/api/stock/kline-by-date`、`/api/ex/kline-by-date`、`/api/symbol/search`、`/api/stock/history-tick` 等
  - 支持周期：`1min` ~ `yearly`，以及搜索
- 运行时可通过 `setFetcherBaseUrl('gotdx', ...)` 覆盖默认地址

## 启动方式

在本仓库根目录统一启动：

```bash
pnpm connector tdx        # gotdx 通达信，默认 8080
```

或在 `GoTDX-Connector` 根目录执行：

```bash
# 通达信，默认 8080
go run . tdx
# 或：go run ./services/tdx-api
```

构建产物：

```bash
go build -o tdx-api.exe ./services/tdx-api
```

环境变量：

| 服务 | 变量 | 默认值 | 说明 |
|---|---|---|---|
| tdx-api | `PORT` | `8080` | HTTP 监听端口 |
| tdx-api | `GOTDX_AUTO_SELECT` | 空 | 设为 `"1"` 自动选择最优服务器 |
| tdx-api | `GOTDX_MAIN_HOSTS` / `GOTDX_EX_HOSTS` / `GOTDX_MAC_HOSTS` | 内置列表 | 服务器探测地址，逗号分隔 |
