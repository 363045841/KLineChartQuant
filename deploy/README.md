# 部署 KCQ 分析采集器

状态（2026-11-17）：本机（Windows）与群晖 NAS 两种形态**已验证**；Linux 主机 / 云 VM 的 systemd 配方按同一套文件编写，**尚未在真机验证**。

这个目录负责两件事，别混在一起：

- **collector（采集）**：四个循环往数据根写分片。代码是 `packages/analytics` 的 CLI，本目录只负责打包与守护。
- **serve（只读服务）**：把分片读出来给面板与 Agent（HTTP，默认 8093，只绑 `127.0.0.1`）。同一个 CLI 的 `serve` 子命令。

NAS 只是采集器的一种宿主。换宿主要改的只有三样：**数据根路径、代理地址、谁来守护进程**。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `deploy/collector.env.example` | 全部 `KCQ_*` 变量的唯一事实来源（模板） |
| `deploy/instances/<名字>.env` | 线上实例的非机密配置副本（进仓库，换宿主时不必登录机器才知道配置） |
| `deploy/systemd/kcq-collector.service` | Linux 主机 / 云 VM 的 systemd 单元 |
| `deploy/nas-collector/build.mjs` | 把 CLI 打成单文件 ESM（`dist/collector.mjs`） |
| `deploy/nas-collector/collector.sh` | 四循环守护脚本：失败退避、心跳、20MB 日志轮转、信号处理 |
| `deploy/nas-collector/Dockerfile` / `docker-compose.yml` | 容器形态（群晖与通用 Docker 都用它） |
| `deploy/nas-collector/README.md` | 群晖 NAS 专用配方（DSM 任务计划、Docker 部署细节） |

## 数据根契约

数据根的形态是"按天 gzip 分片 + 路径即索引"，没有数据库；备份、清理、按天回读都不需要额外元数据。

| 相对路径 | 内容 | 保留 |
| --- | --- | --- |
| `options/aggregate/<CUR>/YYYY-MM-DD.jsonl.gz` | 期权聚合位分钟行 | 365 天 |
| `options/aggregate/<CUR>/hourly/…`、`daily/…` | 边界快照的小时行与日行 | 365 / 3650 天 |
| `options/chain/<CUR>/YYYY-MM-DD.jsonl.gz` | 期权原始链，每 `KCQ_CHAIN_EVERY` 分钟一组 | 90 天 |
| `volume/<SYMBOL>/<interval>/YYYY-MM-DD.jsonl.gz` | 买卖量拆分 | 短周期 90 天，日线及以上永久 |
| `orderflow/…` | 订单流快照与逐笔分层 | 见采集参数 |
| `logs/` | 四个循环的日志、心跳 (`.heartbeat`)、pid | 单文件 20MB 轮转，保留一份旧文件 |

口径与计算规则见 [期权关键位采集与接口](../docs/design/data/option-collection.md)。

体积估算（2026-11-17 实测，5 分钟原始链节奏）：期权聚合位约 1MB/天/品种；原始链单次快照 BTC 23.7KB、ETH 18.6KB、SOL 2.6KB、BNB 4.2KB、XRP 1.8KB，单品种 5–6.5MB/天，五品种合计约 14MB/天上界，90 天约 1.3GB。选址时按"数据根所在盘 ≥ 保留期内总量 × 2"留余量。

## 配置面

采集器只认环境变量，**一处定义，各处读取**：

- 模板：[collector.env.example](./collector.env.example) —— 每个变量、默认值、含义都在这里，不要在别处再排一份表。
- 实例：[instances/nas.env](./instances/nas.env) 这类文件记录线上非机密配置（主机路径、代理、循环、品种）。
- 凭据不进仓库：代理账号、API key 走宿主密钥或进程环境注入。

解释顺序：**进程环境变量 > 实例文件 > `collector.sh` 里的默认值**。

## 构建产物

采集器是单文件 ESM，运行目标 Node ≥ 20，只依赖 Node 内置模块：

```bash
node deploy/nas-collector/build.mjs
# 输出：deploy/nas-collector/dist/collector.mjs（约 199KiB）
```

- `dist/` 被 `.gitignore` 忽略，不入库；每次部署前在开发机构建一次。
- 构建脚本复用仓库已有的 esbuild，不新增依赖，也不用 npm/npx。

## 部署形态

四种形态共用同一个 `collector.sh`、同一个产物、同一份配置模板：

| 形态 | 进程守护 | 配置读取 | 详细步骤 |
| --- | --- | --- | --- |
| 本机（Windows） | 计划任务 / 前台窗口 | shell 环境变量 | 本文「本机」 |
| Linux 主机 / 云 VM | systemd | `/etc/kcq/collector.env` | 本文「Linux 主机 / 云 VM」 |
| 容器（群晖或通用 Docker） | `restart: unless-stopped` | 部署目录 `.env` | [nas-collector/README.md](./nas-collector/README.md) |
| 群晖 NAS 原生 Node | DSM 任务计划 | 命令内联环境变量 | [nas-collector/README.md](./nas-collector/README.md) |

### 本机（Windows）

以前台窗口跑采集器（关窗口即停），或用计划任务常驻：

```powershell
# 前台试跑：直接用仓库源码（够用，便于改代码后立刻验）
$env:KCQ_DATA_ROOT = 'D:\kcq-data'
$env:KCQ_PROXY_HOST = '127.0.0.1'
$env:KCQ_PROXY_PORT = '7078'
pnpm exec tsx packages/analytics/src/cli.ts collect-options --root $env:KCQ_DATA_ROOT ``
  --currencies BTC,ETH --proxy 127.0.0.1:7078 --with-chain --with-chain-every 5 --repeat-seconds 60
```

用打包产物更接近线上：`node deploy/nas-collector/dist/collector.mjs collect-options …`。
四个循环一起跑、失败退避与心跳是 `collector.sh` 的能力，Windows 上要用它得先装 Git Bash 或 WSL；只在本机看数据时，单跑 `collect-options` 或多个窗口各跑一个循环即可。

### Linux 主机 / 云 VM

```bash
# 1) 目录与文件
sudo install -d /opt/kcq /etc/kcq
sudo cp deploy/nas-collector/collector.sh /opt/kcq/
# 开发机执行 node deploy/nas-collector/build.mjs 后上传产物
sudo install -d /opt/kcq/dist && sudo cp deploy/nas-collector/dist/collector.mjs /opt/kcq/dist/
# 2) 配置（改 KCQ_DATA_ROOT 与代理）
sudo cp deploy/collector.env.example /etc/kcq/collector.env
sudo editor /etc/kcq/collector.env
sudo chmod 640 /etc/kcq/collector.env
# 3) 单元
sudo cp deploy/systemd/kcq-collector.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kcq-collector
# 4) 看状态
systemctl status kcq-collector --no-pager
journalctl -u kcq-collector -n 40 --no-pager
```

`collector.sh` 自己写 `<数据根>/logs/` 下的日志与心跳，所以 `journalctl` 只有 supervisor 的启动行，日常排查看 `logs/`。

## Agent 部署清单

按顺序做，每步都有判据；判据不成立就停下报告，不要跳过或"先跑起来再说"。

1. **选宿主与容量**：确认数据根所在盘剩余空间 ≥ 保留期总量 × 2（参考上面的体积估算）。判据：`df -h <数据根父目录>` 的输出记录在报告里。
2. **准备数据根**：`mkdir -p <数据根>/logs`，确认运行用户可写。判据：能创建并删除一个测试文件。
3. **写配置**：复制 [collector.env.example](./collector.env.example) 到宿主约定位置，只改 `KCQ_DATA_ROOT` 与代理。判据：`sh -c 'set -a; . <配置>; set +a; echo $KCQ_DATA_ROOT'` 输出正确路径。
4. **构建产物**：开发机 `node deploy/nas-collector/build.mjs`。判据：输出 `构建完成：deploy/nas-collector/dist/collector.mjs`，且文件 ≥ 150KiB。
5. **上传**：`collector.sh` 与 `dist/collector.mjs` 落到同一目录（容器形态则整包上传后用镜像 COPY）。判据：`sh -n collector.sh` 无语法错误。
6. **起进程**：systemd / `docker compose up -d --build` / DSM 任务计划，三选一。**容器形态必须用 `--build`**：镜像里 COPY 的是产物，只换文件不重建不生效。
7. **验收采集**：见下一节四条判据，全部成立才算部署成功。
8. **起 serve**（按需）：`node dist/collector.mjs serve --root <数据根> --port 8093`，只绑 127.0.0.1；Windows 本机可用 [scripts/start-analytics.ps1](../scripts/start-analytics.ps1)。
9. **记录实例配置**：把该实例的 `KCQ_*`（不含凭据）写进 `deploy/instances/<名字>.env` 并提交，下一个 Agent 不必登录机器就能接手。
10. **留回滚路径**：升级前备份旧产物为 `dist/collector.mjs.bak`。

## 验收判据

部署后必须逐条核对（都是可以 grep 的字符串或可计算的差值）：

1. 启动日志出现 `[supervisor] 原始链每 5 分钟落一次（采样分钟对齐）`（`KCQ_CHAIN_EVERY` 改过时数字随之变化）。
2. `logs/options.heartbeat` 的 UTC 时间与当前时间差 < 2 × `KCQ_OPTION_INTERVAL`；`volume`、`orderflow`、`trades` 心跳同理。
3. 采样分钟过后，`options/chain/<CUR>/<当天>.jsonl.gz` 出现，体积在 KB 量级（BTC 约 23KB/次）。
4. 容器形态：`docker compose ps` 为 running，`docker logs --tail 20 kcq-collector` 有 `本进程负责的循环：…` 一行。
5. serve 形态：`curl -s http://127.0.0.1:8093/health` 返回 200，`/options/series?currency=BTC&limit=1` 有数据。

## 升级与回滚

- **升级**：构建 → 备份 `dist/collector.mjs.bak` → 传新产物 → 重启（`systemctl restart kcq-collector` / `docker compose up -d --build`）。
- **回滚**：恢复 `.bak` → 重启。数据不用回滚：分片只做追加与新分片重写。
- 容器形态想留可回退镜像：升级前 `docker tag kcq-nas-collector:local kcq-nas-collector:prev`。

## 安全边界

- 仓库里不出现任何凭据；配置模板与实例文件只放非机密项。
- `serve` 只绑 `127.0.0.1`，不对公网暴露；需要远程读数据时用 SSH 隧道，不要把端口开到 0.0.0.0。
- 采集器只读交易所公开接口，不需要任何账户凭据（代理账号除外）。

## 未来：设置页接管配置

方向已立票 [#20](https://github.com/EliteOtaku/KCQ-NexusAI-private/issues/20)：桌面端「设置 → 数据源」读写同一份 `KCQ_*` 配置并显示心跳与日志，用户不必登录部署机。约定写在票里，核心两条：

- 设置页只读写本文档定义的同一份配置，不另造存储。
- 进程守护仍交给宿主（systemd / compose / 计划任务），设置页不自己 spawn 常驻进程。

换宿主时按本文档做完第 1–9 步即可；设置页上线后，第 3 步与第 6–7 步改由设置页完成。
