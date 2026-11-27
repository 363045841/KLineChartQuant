# klinechart-server

Node 宿主。把行情、定义、计算与警报装进一个进程，不渲染图表。

浏览器宿主（`packages/vue`）装同一批模块再加 Chart；这里只少 Chart。两个宿主各有一个组合根，库本身不知道自己在哪运行。

## 能力边界

| 做 | 不做 |
| --- | --- |
| 行情：连接、历史、实时流、缓存 | 图表渲染、画布、窗格、图例 |
| 定义：加载脚本与警报的计算描述 | 指标渲染器（`rendererFactory`） |
| 计算：`CalculationHub` | 布局、模板、自选股等 UI 状态 |
| 警报：规则、触发、冷却、过期、落库 | 指标选择器、参数面板、交互输入 |
| 持久化：规则与触发记录（SQLite） | 浏览器本地偏好（localStorage / IndexedDB） |

一句话：**只负责算出来并通知，不负责画出来。**

## 快速开始

先构建 Core（服务通过包入口引用 `dist`）：

```bash
pnpm --filter @363045841yyt/klinechart-core build
pnpm --filter @363045841yyt/klinechart-server build
```

启动：

```bash
node apps/server/dist/main.js \
  --port=8787 \
  --db=./data/state.db \
  --scripts=./data/scripts \
  --workers=4 \
  --sources=gotdx,binance
```

## 命令行参数

全部必填，缺项直接报错，没有隐式默认。

| 参数 | 含义 |
| --- | --- |
| `--port` | HTTP 监听端口（1–65535） |
| `--db` | SQLite 文件路径；目录需已存在 |
| `--scripts` | 脚本工作区目录；不存在会自动创建 |
| `--workers` | 脚本执行线程数（正整数），编译线程另起一条 |
| `--sources` | 启用的数据源 id，逗号分隔 |

数据源与浏览器使用同一份内置清单；未列出的源仍会注册，但状态为 `enabled: false`，不参与路由。

## HTTP 接口

当前只读。

| 路径 | 返回 |
| --- | --- |
| `GET /health` | 存活、运行时长、每个数据源的启用状态 |
| `GET /alerts` | 当前规则快照 |
| `GET /fires` | 触发记录（新到旧） |

非 `GET` 返回 405，未知路径返回 404。

## 目录

```
src/
  main.ts                 入口：flag、启动、信号处理
  config.ts               命令行解析与校验
  compose/
    market.ts             行情宿主 + 内置数据源装配
    definitions.ts        空定义注册表
    calculation.ts        共享运行时（行情 + 定义 + 计算中枢）
    alerts.ts             警报运行时 + SQLite 存储
    root.ts               组合根与逆序释放
  node/
    fetchEventStream.ts   fetch + ReadableStream 的 SSE 实现
    sqliteDriver.ts       node:sqlite 实现的 DocumentDriver
    scriptThread.ts       worker_threads 承载浏览器 Worker 产物
    fileScriptPersistence.ts  脚本工作区（JSON + 原子替换）
  http/
    server.ts             只读 HTTP 路由
```

## 持久化

`node:sqlite`（Node 26 内置），单表：

```sql
CREATE TABLE documents (
  store TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (store, key)
);
```

警报规则与触发记录共用 `alerts` 这一个 store，键分别是 `rules` 与 `fires`，值为整份 JSON 文档。键为数组时会 JSON 序列化，与 IndexedDB 侧的键语义保持一致。

事务串行执行；读改写发生在同一个事务内，避免并发覆盖。

## 生命周期

`SIGINT` / `SIGTERM` 触发关闭：先停止接收请求，再按创建顺序的逆序释放——警报运行时、共享运行时、行情宿主。警报释放会关闭 SQLite 连接。

## 尚未实现

- **写入接口**：创建、启停警报的 API 还没有，目前只有只读路由。
- **实时推送**：SSE / WebSocket 未提供。
- **警报投递**：目前只有落库；`onError` 是唯一出口，外部渠道（webhook 等）后续从此处接。
- **运行时闭包审计**：类型边界由 `core/node` 与 `type-check:node` 守住；打包产物的依赖图还没有自动检查。

## 校验

```bash
pnpm --filter @363045841yyt/klinechart-server type-check
pnpm --filter @363045841yyt/klinechart-server build
```

服务入口只依赖 `@363045841yyt/klinechart-core/node`，该入口在 `lib: ["ESNext"]` 下编译通过——DOM 类型进不来。
