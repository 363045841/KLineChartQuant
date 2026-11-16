# KCQ 分析数据采集器 · 群晖 NAS 部署包

把 `packages/analytics` 的采集器打成**单文件、无第三方运行时依赖**的 Node 程序，在群晖 NAS 上常驻运行，持续落盘 Deribit 期权聚合位与 Binance 买卖量。

- 采集器源码：`packages/analytics/src/cli.ts`（本包不改源码，只打包）
- 产物：`dist/collector.mjs`（ESM，Node ≥ 20，只依赖 Node 内置模块）
- 常驻方式：`collector.sh` 起两个互不影响的循环，任一崩溃自动重启

> `dist/` 是构建产物，被仓库根 `.gitignore` 的 `dist` 规则忽略。上传/部署时直接拷文件即可，不影响使用；若要把产物纳入版本库，需在根 `.gitignore` 加例外。

## 1. 文件清单

| 文件 | 作用 |
| --- | --- |
| `build.mjs` | 构建脚本：用仓库已有 esbuild 把 `cli.ts` 打成 `dist/collector.mjs` |
| `collector.sh` | NAS 启动脚本：双循环、退避重启、20MB 日志轮转、心跳、信号处理 |
| `Dockerfile` | 运行镜像（`node:20-alpine`，不跑 npm 安装） |
| `docker-compose.yml` | 容器编排：`restart: unless-stopped` + 数据卷 + 环境变量 |
| `dist/collector.mjs` | 构建产物，部署时必须一起上传 |

## 2. 在开发机构建

在仓库根目录（Windows 用 PowerShell 或 CMD）：

```powershell
cd D:\AI\KCQ-NexusAI
node deploy/nas-collector/build.mjs
```

预期输出：

```
构建完成：deploy/nas-collector/dist/collector.mjs
产物大小：73.7 KiB（75493 字节，以实际输出为准）
运行目标：Node ≥ 20 / ESM / 单文件
```

本包不用 `npx`（npm 工具链）：`build.mjs` 直接解析仓库 pnpm 依赖树里已有的 esbuild 并调用其 JS API，不新增任何依赖。若提示找不到 esbuild，先在仓库根执行 `pnpm install`。

## 3. 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `KCQ_DATA_ROOT` | 是 | — | 数据根目录，脚本在其下建 `logs/`。例：`/volume1/docker/kcq/analytics` |
| `KCQ_PROXY_HOST` | 否 | 空 | HTTP 代理主机（CONNECT 隧道）。与 `KCQ_PROXY_PORT` 必须同时给 |
| `KCQ_PROXY_PORT` | 否 | 空 | 代理端口。例：`7078` |
| `KCQ_OPTION_INTERVAL` | 否 | `60` | 期权每轮间隔（秒） |
| `KCQ_VOLUME_INTERVAL` | 否 | `300` | 成交量每轮间隔（秒） |
| `KCQ_SYMBOLS` | 否 | `BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT` | Binance 成交量品种 |
| `KCQ_CURRENCIES` | 否 | `BTC,ETH` | 期权标的；BTC/ETH 走 Deribit，SOL/BNB/XRP 走 Binance（需在 `.env` 显式加上才会采） |
| `KCQ_NODE_BIN` | 否 | `node` | Node 可执行文件；找不到时填绝对路径 |
| `KCQ_BUNDLE` | 否 | 脚本同级 `dist/collector.mjs` | 采集器产物路径 |

不设代理时：期权采集会用采集器内置默认 `127.0.0.1:7078`，成交量走直连。**NAS 上通常两者都不对，请务必显式设置。**

采集器落盘结构（按天 gzip 分片）：

```
$KCQ_DATA_ROOT/
  options/aggregate/BTC/2026-11-10.jsonl.gz
  volume/BTCUSDT/1h/2026-11-10.jsonl.gz
  logs/options.log  options.log.1  options.heartbeat  options.pid
  logs/volume.log   volume.log.1   volume.heartbeat   volume.pid
  logs/supervisor.log  supervisor.pid
```

下文命令里的 `NAS_USER`、`PROXY_HOST`、`PROXY_PORT` 是占位符，执行前替换成实际值。不要把密码写进任何文件；SSH 首次连接按提示输入。

## 4. 部署路径 A：Docker（推荐，NAS 不需要装 Node）

### A1. 上传（在开发机执行）

```powershell
cd D:\AI\KCQ-NexusAI
ssh -p 55 NAS_USER@192.168.0.19 "mkdir -p /volume1/docker/kcq/app /volume1/docker/kcq/analytics"
scp -P 55 -r "deploy/nas-collector/." "NAS_USER@192.168.0.19:/volume1/docker/kcq/app/"
```

共享目录 `/volume1/docker` 不存在时，先在 DSM「控制面板 → 共享文件夹」建名为 `docker` 的共享文件夹，或把命令里的路径换成你的实际共享目录。

### A2. 启动（SSH 登录 NAS 后执行）

```bash
cd /volume1/docker/kcq/app
cat > .env <<'EOF'
KCQ_DATA_ROOT_HOST=/volume1/docker/kcq/analytics
KCQ_PROXY_HOST=PROXY_HOST
KCQ_PROXY_PORT=7078
EOF
docker compose up -d --build
docker compose ps
```

预期：`kcq-collector` 状态 `running`。若群晖没有 `docker compose`（旧版），把命令换成 `docker-compose up -d --build`。

代理如果在 NAS 本机：容器里的 `127.0.0.1` 指向容器自己，`KCQ_PROXY_HOST` 要填 NAS 的局域网 IP（如 `192.168.0.19`），或取消 `docker-compose.yml` 里 `extra_hosts` 两行注释后填 `host.docker.internal`。

### A3. 停止与删容器（数据不动）

```bash
cd /volume1/docker/kcq/app
docker compose down
```

### A4. 更新

在开发机重新 `node deploy/nas-collector/build.mjs`，重新上传 `dist/collector.mjs`，然后在 NAS 上：

```bash
cd /volume1/docker/kcq/app
docker compose up -d --build
```

## 5. 部署路径 B：原生 Node + 群晖任务计划

### B1. 安装 Node

DSM「套件中心」搜索 `Node.js`，安装 **v20 或更高**。SSH 确认：

```bash
node -v
```

输出 `v20.x` 及以上才继续。没有该套件或版本过低时，走上面的 Docker 路径。

### B2. 上传（在开发机执行；只需两个文件）

```powershell
cd D:\AI\KCQ-NexusAI
ssh -p 55 NAS_USER@192.168.0.19 "mkdir -p /volume1/docker/kcq/app"
scp -P 55 "deploy/nas-collector/dist/collector.mjs" "NAS_USER@192.168.0.19:/volume1/docker/kcq/app/"
scp -P 55 "deploy/nas-collector/collector.sh" "NAS_USER@192.168.0.19:/volume1/docker/kcq/app/"
```

上传后确认脚本是 LF 换行且可读：

```bash
cd /volume1/docker/kcq/app
ls -l collector.sh dist/collector.mjs
sh -n collector.sh && echo 语法OK
```

### B3. 前台试跑（SSH 登录 NAS 执行，Ctrl+C 结束）

```bash
cd /volume1/docker/kcq/app
KCQ_DATA_ROOT=/volume1/docker/kcq/analytics \
KCQ_PROXY_HOST=PROXY_HOST \
KCQ_PROXY_PORT=7078 \
sh ./collector.sh
```

预期先打印 `[supervisor] ...`，随后 `logs/options.log`、`logs/volume.log` 出现采集摘要。心跳文件出现即表示至少一轮成功。这一步同时创建 `logs/` 目录，后续任务计划的日志重定向才可用。

### B4. 开机自启（DSM 任务计划）

DSM → 控制面板 → 任务计划 → 新增 → **触发的任务** → 开机 → 用户账号选 `root` → 「任务设置」里把命令填成一行：

```
KCQ_DATA_ROOT=/volume1/docker/kcq/analytics KCQ_PROXY_HOST=PROXY_HOST KCQ_PROXY_PORT=7078 /bin/sh /volume1/docker/kcq/app/collector.sh >> /volume1/docker/kcq/analytics/logs/supervisor.log 2>&1
```

保存后在该任务上点「运行」可立即启动，不必重启 NAS。

不想用任务计划、只用 SSH 启动时：

```bash
nohup /bin/sh -c 'KCQ_DATA_ROOT=/volume1/docker/kcq/analytics KCQ_PROXY_HOST=PROXY_HOST KCQ_PROXY_PORT=7078 exec /bin/sh /volume1/docker/kcq/app/collector.sh' >> /volume1/docker/kcq/analytics/logs/supervisor.log 2>&1 &
```

任务计划里找不到 `node` 时，把 `KCQ_NODE_BIN` 加到命令前，值用 `which node` 查到的绝对路径。

### B5. 停止

```bash
kill -TERM "$(cat /volume1/docker/kcq/analytics/logs/supervisor.pid)"
sleep 2
ps | grep '[c]ollector.mjs' || echo 已停止
```

脚本会先结束两个采集子进程再退出；任务计划里的常驻任务随之结束。

## 6. 看日志 / 确认在跑 / 回滚

### 看日志

```bash
tail -f /volume1/docker/kcq/analytics/logs/options.log
tail -f /volume1/docker/kcq/analytics/logs/volume.log
tail -n 50 /volume1/docker/kcq/analytics/logs/supervisor.log
```

Docker 路径下还可以看容器标准输出：`docker compose logs -f --tail=50`。

日志单文件超过 20MB 时在下一轮开始前改名为 `.log.1`（只保留一份旧文件），不会无限增长。

### 确认在跑（三个证据）

```bash
date -u
cat /volume1/docker/kcq/analytics/logs/options.heartbeat
cat /volume1/docker/kcq/analytics/logs/volume.heartbeat
ps | grep '[c]ollector.mjs'
```

- 心跳是 UTC 时间戳，每成功一轮刷新一次。`volume.heartbeat` 与当前 UTC 时间差应小于 `KCQ_VOLUME_INTERVAL` 加一轮耗时。
- `ps` 应始终看到两个 `collector.mjs` 进程（options 与 volume 各一个）。
- 数据落地：`ls /volume1/docker/kcq/analytics/volume/BTCUSDT/1h | tail -3`。

Docker 路径下 `ps` 换成 `docker exec kcq-collector ps`。

### 回滚

升级前先备份采集器产物：

```bash
cd /volume1/docker/kcq/app
cp dist/collector.mjs dist/collector.mjs.bak
```

回滚：

```bash
# 原生 Node：恢复旧产物后重启（先停再启，命令见 B5 / B4）
cp dist/collector.mjs.bak dist/collector.mjs
# Docker：恢复旧产物后重建镜像
docker compose up -d --build
```

数据目录只有追加与新分片重写，回滚采集器不需要回滚数据。Docker 路径想保留可回退镜像时，升级前执行 `docker tag kcq-nas-collector:local kcq-nas-collector:prev`。

## 7. 已知边界

- **Deribit 只有 BTC/ETH**：`KCQ_CURRENCIES` 填其他币种不会报错，但采集结果为空。SOL/BNB/XRP/ADA 只采 Binance 成交量。
- **本部署只落期权聚合位**：`collector.sh` 没加 `--with-chain`，原始期权链不落盘（聚合位约 1MB/天，原始链体积大得多）。需要原始链时在 `options_worker` 的 `collect-options` 参数里加 `--with-chain`，并确认共享目录空间足够。
- **代理必须能从运行环境访问**：容器里不能用 `127.0.0.1` 指代 NAS 主机。先在 NAS 上验证：`curl -x http://PROXY_HOST:PROXY_PORT -m 10 -o /dev/null -w "%{http_code}\n" https://api.binance.com/api/v3/ping`，返回 `200` 才算通。容器内连通性：`docker exec kcq-collector sh -c 'nc -z -w 3 PROXY_HOST PROXY_PORT && echo 代理可达'`。
- **采集失败不会退出脚本**：单轮失败写日志并按 5→10→20→40→60 秒退避重试，成功后间隔恢复；配置错误（缺 `KCQ_DATA_ROOT`、代理只给一半、端口非法）启动即退出码 2。
- **权限**：共享目录必须可写。Docker 默认 root 写入，若目录归属特定用户，在 `docker-compose.yml` 里取消 `user:` 注释并填 `id` 查到的 UID/GID。
- **本包不含任何凭据**：代理、目录、账号全部走环境变量或命令行参数。
