# BaoStock（`stockbao`）

## 简介

BaoStock 是免费的证券数据平台，提供 A 股日 / 周 / 月及分钟 K 线。前端通过同级仓库 `stockbao`（FastAPI 服务）作为本地代理访问；该服务还通过 tvDatafeed 提供 TradingView 全球品种数据（`/api/tradingview/kdata`）。

本地仓库与 `stockbao` 保持同级目录（不在本 monorepo 内）：

```
workspace/
├── KLineChartQuant/  # 本仓库
└── stockbao/         # BaoStock 数据后端
```

## 使用方法

- fetcher 名：`baostock`（`packages/core/src/data/baostock.ts`）
- 默认地址：`http://localhost:8000`，请求 `/api/stock/kdata`
- 支持周期：`daily` / `weekly` / `monthly`、`5min` / `15min` / `30min` / `60min`
- 复权：`none`（3）/ `qfq`（2）/ `hfq`（1）
- 语义配置 `source` 字段取值：`baostock`
- 运行时可通过 `setFetcherBaseUrl('baostock', ...)` 覆盖默认地址

## 启动方式

前置：Python 3.12 + [uv](https://docs.astral.sh/uv/)。`stockbao` 与本仓库同级：

```bash
# 在本仓库根目录执行（等价于 cd ../stockbao && uv run python ./server.py）
pnpm stockbao

# 或在 stockbao 目录手动启动
cd ../stockbao
uv sync
uv run python server.py
```

Docker 方式：

```bash
cd ../stockbao
docker build -t stockbao .
docker run -p 8000:8000 stockbao
```

启动后服务地址为 `http://localhost:8000`，API 文档为 `http://localhost:8000/docs`。
