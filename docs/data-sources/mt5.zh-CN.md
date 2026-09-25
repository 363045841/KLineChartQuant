# MT5（`KCQ-MT5-connector`，Exness 本地终端）

## 简介

`KCQ-MT5-connector` 是 MT5（Exness）的本地终端行情连接器：通过 MetaTrader5 Python 包 IPC 读取本机已登录的 MT5 终端，提供 KCQ market-data V1 协议（probe / instruments/search / bars）与 SSE 实时 K 线流（`snapshot` / `forming` / `closed` / `status`）。依赖 Windows + 已登录的 MT5 (Exness) 终端，不纳入 `pnpm dev -c all`。

本地仓库与 `KCQ-MT5-connector` 保持同级目录（不在本 monorepo 内）。用 `pnpm setup:backends` 一键克隆：

```
workspace/
├── KLineChartQuant/          # 本仓库
└── KCQ-MT5-connector/        # MT5 本地终端后端
```

```bash
pnpm setup:backends   # 幂等：目录已存在则跳过
```

## 使用方法

- source id：`mt5`（`packages/core/src/data/provider/sources/mt5.ts`）
- 默认地址：`http://127.0.0.1:8090`
- 支持周期：`1min` / `5min` / `15min` / `30min` / `60min` / `4h` / `daily` / `weekly` / `monthly`
- 复权：`none`
- 会话：`MT5`（7x24 UTC，仅用于时区解析，不裁剪 K 线）
- 实时消费：`Mt5LiveSource` + `RealtimeBarsConnector`（`packages/core/src/data/live/mt5BarsLive.ts`）驱动 `controller.updateBars`

## 启动方式

前置：Windows + 已安装并登录的 MT5 (Exness) 终端、Python 3.12+ 与 [uv](https://docs.astral.sh/uv/)。`KCQ-MT5-connector` 与本仓库同级：

```bash
# 仅后端（在本仓库根目录执行，等价于 cd ../KCQ-MT5-connector && uv run python ./server.py）
pnpm connector mt5

# 或连同前端一起启动
pnpm dev -c mt5

# 或在 KCQ-MT5-connector 目录手动启动
cd ../KCQ-MT5-connector
uv sync
uv run python ./server.py
```

> `mt5` 依赖 Windows + 本机 MT5 终端，**不纳入 `pnpm dev -c all`**，需显式指定。

启动后服务地址为 `http://127.0.0.1:8090`。常用环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MT5_TERMINAL_PATH` | 自动探测 | 终端 `terminal64.exe` 全路径 |
| `EXNESS_ONLY` | `1` | 仅允许 Exness 平台（company / server 校验）；`0` 放开 |
| `ALIGN_TZ` | `auto` | 对齐模式：`auto` / `gmt2` / `gmt3` / `off` |
| `EXNESS_SERVER_UTC_OFFSET` | 实测 | 服务器 UTC 偏移覆盖（小时） |
| `MT5_PORT` | `8090` | HTTP 端口 |
