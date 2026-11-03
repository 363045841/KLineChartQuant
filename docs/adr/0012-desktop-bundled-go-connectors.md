# 0012. 桌面端随包分发 Go 行情后端

- Status: Accepted
- Date: 2026-11-03
- Deciders: tseka

## Context

桌面端（`packages/desktop-electron`）的行情数据来自五个独立 connector 仓库，地址写在 core 的
`dataSourceRegistry`（`127.0.0.1:8080 / 8000 / 8090 / 8091 / 8092`）。仓库内没有任何启动逻辑：
开发时靠 `pnpm connector <name>`，打包后的应用则**完全没有后端**——用户不会自己装 Go / Python
并按仓库文档起服务。

两类后端的成本差别很大：

| connector | 实现 | 体积（实测） | 外部依赖 |
|---|---|---|---|
| gotdx | Go（`modernc.org/sqlite`，纯 Go 无 cgo） | 29.6 MB | 无 |
| binance | Go | 7.6 MB | 无 |
| baostock / tradingview | Python + pandas | venv 134 MB | 解释器 |
| mt5 | Python + pandas + `MetaTrader5` | venv 109 MB | 解释器 + 已登录的 MT5 终端 |
| ths | Python + fastapi | venv 26 MB | 解释器 + API Key |

## Decision

只随安装包分发两个纯 Go connector；三个 Python 后端继续由用户以外部服务提供。

1. 二进制由 `scripts/build-backends.mjs` 按 `packages/desktop-electron/backends.json` 固定的
   commit 构建到 `resources/backends/<platform>-<arch>/`，`CGO_ENABLED=0` 交叉编译。
2. `electron-builder.yml` 用 `extraResources` 把它放到 `process.resourcesPath/backends`；
   可执行文件不能进 asar。
3. 主进程 `electron/backends.ts` 在**建窗口前**启动后端，只探测「端口是否在服务」：gotdx 用
   `/health/live` 而不是 `/health/ready`——后者在通达信服务器不可达时返回 503，会让无外网的
   环境白等超时；上游可用性由数据源面板的 probe 呈现。`before-quit` 时回收。
   开发态从 `<包目录>/resources/backends` 找二进制，打包态从 `process.resourcesPath`。
4. 端口沿用 connector 出厂默认值，与 `dataSourceRegistry` 的默认 baseUrl 对齐，不做动态分配：
   动态端口需要把实际地址注入渲染进程的持久化配置，收益不抵复杂度。
5. 端口上已有同款服务（开发者手动起的）时直接复用，既不重复拉起，也不在退出时代替别人回收。
6. 数据与日志改写到 `app.getPath('userData')`：connector 默认把 SQLite / 归档写在 cwd 下，
   安装目录不可写。

## Consequences

- 安装体积增加约 37 MB（压缩后的安装包增量更小），换来开箱可用的 A 股 / 加密行情。
- 打包链路新增 Go 工具链依赖；`pnpm --filter …klinechart-desktop build` 会先跑 `build:backends`。
  交叉编译一次产出全部目标平台，不需要按平台分开构建。
- 后端版本与应用版本解耦：升级 connector 只改 `backends.json` 的 commit。
- 只想出安装包时用手动工作流 `desktop.yml`（`workflow_dispatch`，产物走 artifact），不必触发
  `release.yml` 里的 npm 发布。
- `Binance-Connector` 仓库当前**没有 LICENSE 文件**，`GoTDX-Connector` 是 Apache-2.0。
  正式对外发布前必须先确定前者的许可，否则不能随安装包分发。
- Python 三个后端保持现状：数据源面板里显示连接错误，由用户自行启动或改为远端地址。
