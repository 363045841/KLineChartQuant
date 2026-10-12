# 同花顺 THS（`KCQ-THS-connector`）

## 简介

`KCQ-THS-connector` 是同花顺金融数据 API（[fuyao.aicubes.cn](https://fuyao.aicubes.cn)）的行情连接器：把上游 REST 适配为 KCQ market-data V1 协议（probe / instruments/search / bars / trading-calendar），覆盖 **A 股 / 指数 / ETF / 期货 / 期权**。依赖同花顺 API Key，不纳入 `pnpm dev -c all`。

> **能力边界（重要）**：同花顺**端外（`X-api-key`）只提供日线级行情**。A 股分钟线与分时「未开放外部接入」（上游返回 `code=2004`，同花顺 AI 客户端专用），期货与期权端外仅有日线。因此本连接器**只声明并只提供 `daily`**——这不是实现取舍，是上游数据可得性的硬约束。需要分钟级请使用 `mt5`（:8090）或 `gotdx`（:8080）。
>
> 连接器按 capability 写实声明，KCQ 的 `SourceRouter` 会在请求分钟级周期时**自动流转**到其它数据源，无需任何特判。

本地仓库与 `KCQ-THS-connector` 保持同级目录（不在本 monorepo 内）。用 `pnpm setup:backends` 一键克隆：

```
workspace/
├── KLineChartQuant/          # 本仓库
└── KCQ-THS-connector/        # 同花顺日线后端
```

```bash
pnpm setup:backends   # 幂等：目录已存在则跳过
```

## 使用方法

- source id：`ths`（`packages/core/src/data/provider/impl/sources/ths.ts`）
- 默认地址：`http://127.0.0.1:8092`
- 支持周期：`daily`（**仅此一个**）
- 复权：`none` / `qfq` / `hfq`（**仅 A 股**；指数 / ETF / 期货 / 期权只有 `none`）
- 会话：A 股 / 指数 / ETF 复用内置 `CN`（`Asia/Shanghai`，09:30-11:30 + 13:00-15:00）；期货 / 期权不带 `sessionId`（其夜盘时段与股票不同）
- 成交量单位：A 股 / 指数 / ETF 为 `share`（股）；期货 / 期权为 `contract`（手）——由连接器显式返回
- 资产类别：`stock` / `index` / `etf` / `fund` / `future` / `option`

### 标的代码

标的使用**完整 `thscode`**（含交易所后缀）。纯代码在同花顺侧跨交易所歧义，不可用（实测 `000001` 同时命中 `000001.SZ` / `000001.OF` / `000001.CCI`）。

| 类型 | 示例 |
|---|---|
| A 股 | `600519.SH`（贵州茅台）、`000001.SZ` |
| 指数 | `000001.SH`（上证综指）、`000300.SH`（沪深 300）、`885525.TI`（白酒概念） |
| ETF | `510300.SH` |
| 期货 | `IC2612.CFE`（中证 500 2612） |
| 期权 | `10011425.SH`（50ETF购12月2800） |

## 启动方式

前置：Python 3.12+ 与 [uv](https://docs.astral.sh/uv/)，以及同花顺 API Key（在 [API Key 管理](https://fuyao.aicubes.cn/admin/) 页签发）。`KCQ-THS-connector` 与本仓库同级：

```bash
# 仅后端（在本仓库根目录执行，等价于 cd ../KCQ-THS-connector && uv run python ./server.py）
pnpm connector ths

# 或连同前端一起启动
pnpm dev -c ths

# 或在 KCQ-THS-connector 目录手动启动
cd ../KCQ-THS-connector
uv sync
uv run python ./server.py
```

> `ths` 依赖 API Key，**不纳入 `pnpm dev -c all`**，需显式指定。

启动后服务地址为 `http://127.0.0.1:8092`。常用环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `THS_API_KEY` | 无 | 同花顺 API Key；未配置时 probe 返回 `degraded` |
| `THS_BASE_URL` | `https://fuyao.aicubes.cn` | 上游地址 |
| `THS_PORT` | `8092` | HTTP 端口 |
| `THS_TIMEOUT_S` | `20.0` | 单次上游请求超时（秒） |
| `THS_MAX_RETRIES` | `2` | 可重试错误的最大重试次数 |
| `THS_RETRY_BACKOFF_S` | `1.0` | 退避基数（实际等待 = base × 2^attempt） |

Key 解析顺序：`THS_API_KEY` 环境变量 → `~/.cloudtrade/config.json` 的 `ths.api_key`。

## 上游契约

上游真实行为（含官方文档未记载的错误码与多处与文档不符之处）记录在连接器仓库的 `docs/UPSTREAM_CONTRACT.md`，实现时**以该文档为准**。
