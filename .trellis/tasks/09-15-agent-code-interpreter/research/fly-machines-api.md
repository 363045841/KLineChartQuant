# Research: fly.io Machines API 承载「一次性 Python 代码沙箱」可行性

- **Query**: fly.io Machines API 能否承载 `python-data-analysis-v1` 一次性代码执行沙箱（upstream issue #155）
- **Scope**: external（fly.io 官方文档 + 官方 OpenAPI spec）
- **Date**: 2026-09-15
- **证据来源**: 全部取自 `fly.io/docs/*`、`docs.machines.dev` 官方 OpenAPI 3.0 spec（`https://docs.machines.dev/spec/openapi3.json`，实际抓取校验过）、fly.io 官方 Blueprints。未采用第三方博客。

---

## 摘要

**结论：Machines API 能承载这个场景的 80%，但「完全禁用网络」这一条 fly.io 平台侧做不到，必须在 guest 内自己实现，隔离强度取决于你的镜像而不是 fly 的 API。这是最大的风险点。**

次大风险点是 **stdout/stderr 获取路径**：Machines API 没有官方 logs 端点，fly 官方明说 `fly logs` 背后的 HTTP API 是 "undocumented / isn't officially supported for external use"。所以不能把「读日志拿 stdout」当作产品级路径，应该改用 `POST /machines/{id}/exec`（spec 里直接返回 `stdout`/`stderr`/`exit_code`/`exit_signal`）或让 guest 内 runner 主动上报结果。

第三个风险点是**冷启动**：官方文档说 Machine 的 `created` 阶段（预留空间、拉镜像、构建 rootfs）"can take some time, maybe low double digit seconds"。在 60s 总预算里，每次 create 一台新 Machine 可能吃掉 10~20s。官方给出的解法是 Blueprint「Warm pools of user Machines」——预热池 + claim。

---

## 逐条对照表

| # | 硬指标 | 能否满足 | 怎么满足 | 官方依据 |
|---|---|---|---|---|
| 1 | 一次性任务执行（提交代码→起容器→拿 stdout/stderr/exitCode→销毁） | ✅ 可以，但**不是单个 API 调用** | 两种形态见下文「推荐实现形态」。强隔离不复用 → `POST /v1/apps/{app}/machines` 且 `config.auto_destroy=true` + `config.restart.policy="no"` + `config.init.exec` 直接跑代码；低延迟复用 → 预热 Machine + `POST /machines/{id}/exec` | `auto_destroy`: <https://fly.io/docs/machines/api/machines-resource/#machine-config-object-properties>（"If true, the Machine destroys itself once it's complete"）；`restart.policy=no`: <https://fly.io/docs/machines/guides-examples/machine-restart-policy/>；`--rm` 语义（等价于 restart=no + 退出即销毁）: <https://fly.io/docs/machines/flyctl/fly-machine-run/#destroy-the-machine-when-it-exits>；`exec` 端点: `POST /v1/apps/{app_name}/machines/{machine_id}/exec`，见 <https://docs.machines.dev/spec/openapi3.json> |
| 2 | 1 vCPU / 1 GiB | ✅ 完全支持，且正好合法 | `config.guest = {"cpu_kind":"shared","cpus":1,"memory_mb":1024}`。规则：shared 每 CPU 内存区间 `256MB ~ 2048MB`，且必须是 256 的倍数。所以 1 shared CPU 最小 256MB、最大 2048MB，1024 在范围内 | <https://fly.io/docs/machines/guides-examples/machine-sizing/>（"Memory limits are `2gb * shared CPU size`…Minimum memory is `256m * shared CPU size`"；"Memory must be a multiple of 256 for shared sizes"） |
| 3 | 60s 硬超时 | ⚠️ **没有原生的「执行超时后自动杀掉」** | 三层兜底：(a) `exec` 请求体有 `timeout`（整数秒）字段，这是 exec 调用自身的超时；(b) `GET /machines/{id}/wait?state=stopped&timeout=N` 只是**等待**超时，不会终止 Machine（默认 60s）；(c) 唯一可靠的硬超时是**客户端计时 + 主动 `DELETE /machines/{id}?force=true`**。另可在 guest 内再套一层 `timeout 60 python …` | `exec` 的 `timeout` 字段与 `wait` 的 `timeout` query 参数均见 OpenAPI spec；`wait` 语义 <https://fly.io/docs/machines/api/machines-resource/#wait-for-a-machine-to-reach-a-specified-state>（"The time, in seconds, to wait for the Machine to enter the specified state. Default is 60."）；`stop` 的 `timeout`/`signal` 只是 graceful kill 窗口，不是执行超时 |
| 4 | **完全禁用出站网络** | ❌ **平台侧做不到。必须诚实承认。** | 详见下面「能力缺口」小节。fly 官方**没有**任何「禁用 egress / no-internet」的 Machine 配置项——我把整份 OpenAPI spec grep 过，`MachineConfig` 里只有 `dns`、`services`、`ip_assignments` 这些**入站 / DNS**相关字段，没有任何出站开关。官方 egress 文档只讲「怎么拿到稳定出站 IP」，默认状态就是**有出站 NAT**。官方能给的最接近方案是 custom 6PN（横向隔离，挡不住公网） | 无 egress 禁用字段：`https://docs.machines.dev/spec/openapi3.json`（`fly.MachineConfig` schema）；默认有出站且 NAT：<https://fly.io/docs/networking/egress-ips/>（"By default, outbound (egress) IPs from Fly Machines are unstable…IPv4 traffic is NAT'd"）；入站默认关闭（≠出站）：<https://fly.io/docs/machines/api/machines-resource/#notes-on-networking>（"Machines are closed to the public internet by default"）；租户隔离方案：<https://fly.io/docs/networking/custom-private-networks/> |
| 5 | 文件输入输出（CSV/XLSX 入，CSV/PNG 出，各 ≤20MiB） | ⚠️ 部分满足，需要混合方案 | **入**：小文件用 `config.files[].raw_value`（base64 内容写入 guest 绝对路径）；20MiB 原文 → base64 后 ~27MB 的 JSON 请求体，**官方没有文档化大小上限**，属于未验证风险，必须实测。稳妥做法是文件走 Tigris/S3 预签名 URL，只把 URL 传进去（但这与「禁网」直接冲突，见缺口 B）。**出**：`exec` 的 `stdout` 是 JSON 字符串，塞 20MiB base64 产物不现实；推荐 guest 内 runner 直接 PUT 到 Tigris 预签名 URL，或挂 volume 后由控制面取。 | `files` / `raw_value` / `secret_name`: <https://fly.io/docs/machines/api/machines-resource/#machine-config-object-properties>；`fly.File` schema（`guest_path` 必须绝对路径、`raw_value` 为 base64）见 OpenAPI spec；volumes: `POST /v1/apps/{app}/volumes` + `config.mounts`；Tigris（fly 官方 object storage 合作方，支持预签名 URL）: <https://fly.io/docs/tigris/> |
| 6 | 异步 submit/get/cancel 模型 | ✅ 可映射 | 状态映射见下文专门小节。`GET /machines/{id}` 返回 `state` 字符串 + `events[]`；`GET /machines/{id}/events` 拿事件流；`GET /machines/{id}/wait?state=stopped` 做长轮询。**退出码**：最可靠来源是 `exec` 响应的 `exit_code`；走 `init.exec` 一次性 Machine 时退出码只能从 Machine event 的 `request` 字段里刨（spec 里 `MachineEvent.request` 是无类型 `object`，**没有文档化的 schema**，属于弱保证）。`cancel` → `DELETE /machines/{id}?force=true` | 状态生命周期：<https://fly.io/docs/machines/overview/#machine-state>；`Machine.state` / `Machine.events` / `MachineEvent` schema 见 OpenAPI spec；`wait`: <https://fly.io/docs/machines/api/machines-resource/#wait-for-a-machine-to-reach-a-specified-state>；`flydv1.ExecResponse = {exit_code, exit_signal, stdout, stderr}` 见 OpenAPI spec |
| 7 | stdout/stderr 截断 1MiB | ⚠️ 走日志不可靠；走 exec 可控 | Machines API **没有 logs 端点**（我枚举了 spec 里全部 100+ 个 path，无 logs）。官方唯一的 HTTP 日志接口 `GET /api/v1/apps/:app/logs` 被明确标注为 "Undocumented HTTP API"、"isn't officially supported for external use"，默认只返回最近 100 条、24 小时内，且 NATS 路径官方明说"messages might pile up and get dropped"。**所以 1MiB 截断应该在 guest 内 runner 自己做**（读 stdout 到 1MiB 就截断并打 `truncated` 标记），不要指望日志管道 | <https://fly.io/docs/monitoring/logs-api-options/>（三种方式与各自 caveat，含 "This endpoint isn't officially supported for external use"、"By default, the most recent 100 logs from the last 24 hours are returned"、NATS "may change"/丢消息警告） |
| 8 | 产物 1 小时后自动删除 | ❌ fly 侧无 TTL，需自建 | Machines API 没有任何 TTL/过期字段；volume 也没有。`auto_destroy` 只销毁 Machine，不管产物。可行做法：产物存 Tigris（S3 兼容，可用 S3 lifecycle 规则），或控制面自己跑清理调度（官方 Blueprint 里的 "maintenance loop / sweeper" 模式） | 无 TTL 字段：OpenAPI spec `fly.MachineConfig` / volume schema；清理循环模式：<https://fly.io/docs/blueprints/warm-pool-user-machines/>；Tigris S3 兼容: <https://fly.io/docs/tigris/> |
| 9 | 冷启动延迟 | ⚠️ 需要预热池才能塞进 60s 预算 | 官方数据：`created` 阶段（预留 + 拉镜像 + 构建 rootfs）**"can take some time, maybe low double digit seconds"**；`created → started` 启动本身 **"usually well under a second"**；stopped Machine 重新 start 同样 "well under a second"。另一处官方数据：stop 后冷启 "about 2s for a Rails app, less for a small binary"，suspend 恢复 "a few hundred milliseconds"（但 suspend 不保证成功、要求 ≤4GB RAM、不支持 swap）。**结论：每请求新建 Machine 会吃掉 60s 里的 10~20s；复用预热 Machine + exec 几乎零成本。** | <https://fly.io/docs/machines/overview/#machine-state>；<https://fly.io/docs/blueprints/long-running-tasks/>（stop vs suspend 数据与 suspend 的 5 条限制）；<https://fly.io/docs/blueprints/warm-pool-user-machines/>（官方预热池方案，开篇即点名 "AI agents, code sandboxes"） |
| 10 | 认证与最小权限 | ✅ 有细粒度（macaroon） | Base URL `https://api.machines.dev`（org 内可用 `http://_api.internal:4280`），`Authorization: Bearer <token>`。Token 类型：`fly tokens create org`（管全 org，能建/删 app——**如果采用「一任务一 app」就必须用它**）、`fly tokens create deploy`（app 级）、`fly tokens create machine-exec --command "<exact cmd>"`（**只能在该 app 的 Machine 上执行指定命令，最贴合最小权限**）、`fly tokens create readonly`。全部支持 `--expiry`（默认 20 年，应显式收短）。官方明确警告：控制面 token "Keep it server-side and never expose it to a user Machine" | <https://fly.io/docs/machines/api/working-with-machines-api/>（base URL / Bearer / 环境变量约定 / 速率限制）；<https://fly.io/docs/security/tokens/>（macaroon、app-scoped / org-scoped / machine-exec / readonly / `--expiry`）；<https://fly.io/docs/blueprints/warm-pool-user-machines/>（"needs an org-scoped API token…not an app-scoped deploy token"） |

> ⚠️ **额外发现（issue 里没提但会咬人）：速率限制。**
> 官方：Machines API 限流是 **per-action, per-machine/per-app，1 req/s，突发上限 3 req/s**。
> 即：同一个 app 里「Create Machine」这个动作只有约 1 次/秒的额度。
> 如果走「一任务一 Machine、全塞在同一个 app」，并发吞吐直接被卡在 ~1 QPS。
> 官方推荐的规避方式正是「一 app 一租户」（限流 scope 变成 per-app）。
> 依据：<https://fly.io/docs/machines/api/working-with-machines-api/#rate-limits>

---

## 状态映射（指标 6）

fly 官方 Machine 状态（`GET /machines/{id}` 的 `state` 字段；`wait` 端点接受的枚举为 `started|stopped|suspended|destroyed|failed|settled`）：

| fly state | 含义（官方） | 映射到 issue 的 task status |
|---|---|---|
| `created` | 预留资源、拉镜像、建 rootfs，"low double digit seconds" | `queued` |
| `starting` / `started` | VM 已启动，代码在跑 | `running` |
| `stopping` / `stopped` | 主进程已退出 | 看 `exit_code`：0 → `succeeded`，非 0 → `failed` |
| `failed` | flyd 侧启动/运行失败 | `failed`（这是平台错误，与用户代码错误要区分开） |
| `destroyed` | 已销毁（`auto_destroy` 或 DELETE） | 终态；若是我们主动 DELETE 触发 → `cancelled` 或 `timed_out`，由控制面记录的意图决定 |
| `suspended` | 仅在显式 suspend 时出现 | 本场景不使用 |

**关键设计点：`timed_out` 与 `cancelled` 在 fly 侧看起来完全一样（都是被 DELETE 掉的 `destroyed`）。区分只能靠控制面自己的数据库记录「是谁在什么原因下发起的销毁」。** 不要试图从 Machine 状态反推。

同理，**退出码不要依赖 Machine events**（`MachineEvent.request` 在 OpenAPI spec 里是无 schema 的 `object`，没有稳定性承诺）。要么用 `exec` 的 `exit_code`，要么让 guest runner 把结构化结果（exitCode/stdout/stderr/artifacts）自己写出去。

---

## 推荐实现形态

### 形态 A：强隔离优先（每次执行一台一次性 Machine）

符合「每次执行强隔离、不复用」，代价是 10~20s 冷启动。

```
1. 建隔离 app（可复用于整个任务生命周期，也可一任务一 app）
   POST https://api.machines.dev/v1/apps
   Authorization: Bearer <org-scoped token>
   { "app_name": "ci-task-<taskId>", "org_slug": "<org>", "network": "ci-task-<taskId>" }
   # network 参数 = 独立 6PN，官方点名用于「running untrusted code」
   # 不分配 public IP → 入站默认不可达

2. 创建并启动一次性 Machine
   POST https://api.machines.dev/v1/apps/ci-task-<taskId>/machines
   {
     "region": "nrt",
     "config": {
       "image": "registry.fly.io/<you>/python-data-analysis-v1@sha256:...",
       "guest": { "cpu_kind": "shared", "cpus": 1, "memory_mb": 1024 },
       "auto_destroy": true,
       "restart": { "policy": "no" },
       "init": { "exec": ["/usr/local/bin/runner", "--deadline", "60"] },
       "files": [
         { "guest_path": "/work/main.py",  "raw_value": "<base64 代码>" },
         { "guest_path": "/work/input.csv","raw_value": "<base64 输入>" }
       ],
       "metadata": { "task_id": "<taskId>" },
       "env": { "PYTHONDONTWRITEBYTECODE": "1" }
     }
   }
   → 200，返回 { id, state: "created"|"started", private_ip, ... }

3. 轮询 / 长轮询等待结束
   GET /v1/apps/ci-task-<taskId>/machines/<id>/wait?state=stopped&timeout=60
   （注意：timeout 到了只是「等待」返回，Machine 不会被杀）

4. 取结果
   —— 不要走 logs API（非官方支持）。让 runner 在退出前把
      {exitCode, stdout(≤1MiB), stderr(≤1MiB), artifacts[]} 写到产物出口。

5. 无条件销毁（幂等，超时/取消/正常结束都走这里）
   DELETE /v1/apps/ci-task-<taskId>/machines/<id>?force=true
   或直接 DELETE /v1/apps/ci-task-<taskId>   # 删 app 级联删 Machine + volume，官方推荐的一次性清理
```

### 形态 B：延迟优先（预热池 + exec）

fly 官方 Blueprint「Warm pools of user Machines」就是为这个场景写的（开篇原文点名 "dev environments, AI agents, code sandboxes"）。

```
预热：后台 worker 常驻维持 N 台 ready Machine（每台自己的 app + 自己的 6PN），
      DB 里一行一台，status: provisioning → ready，allocated_at 为 NULL 表示可领取。

submit(taskId):
  1) 从池里 claim 一台 → 标记 allocated_to = taskId
  2) POST /v1/apps/<app>/machines/<id>/exec
     {
       "command": ["/usr/local/bin/runner", "--task", "<taskId>"],
       "stdin": "<代码或 JSON payload>",
       "timeout": 60
     }
     → 200 { "stdout": "...", "stderr": "...", "exit_code": 0, "exit_signal": 0 }
  3) 执行完毕后**销毁整台 Machine 并重新补池**（不要把用过的 Machine 还给下一个任务，
     否则「强隔离、不复用」就破了：exec 是进同一个已运行的 VM，文件系统脏、进程可残留）
```

**关键取舍**：exec 给你官方结构化的 `exit_code`/`stdout`/`stderr`（形态 A 拿不到），延迟接近 0；但它要求 Machine 已经在跑，所以隔离性靠「用完即焚 + 补池」维持，而不是靠「每次全新 VM」。

**推荐：形态 B，且 exec 完立刻 destroy。** 理由：60s 预算下形态 A 的 10~20s 冷启动挤占太多；exec 又是唯一有官方 schema 保证的「拿退出码和 stdout」的路径。

---

## 明确的能力缺口

### A. 【阻断级】无法通过 fly API 禁用出站网络

- fly.io **没有**任何 Machine 配置项可以关闭出站互联网。整份 OpenAPI spec 的 `fly.MachineConfig` 里不存在 egress/firewall/no-network 之类字段。
- 官方文档里「Machines are closed to the public internet by default」讲的是**入站**（不分配 IP + 不配 `services` 就没人能进来），跟出站无关。<https://fly.io/docs/machines/api/machines-resource/#notes-on-networking>
- 官方 egress 文档的默认前提就是「你有出站，只是 IP 不稳定且被 NAT」。<https://fly.io/docs/networking/egress-ips/>
- custom 6PN（`network` 参数）只解决**租户之间横向**隔离——官方原话是给 "each customer running untrusted code on your platform" 用的，但同一段也明说隔离的 app "can still provide a public internet-facing service"，即公网通路依然存在。<https://fly.io/docs/networking/custom-private-networks/>

**绕行代价（必须在镜像里自己做，fly 不替你做）：**
1. guest 内以非 root 用户跑用户代码，启动时用 root 装 `nftables`/`iptables` 规则：默认 DROP 所有 OUTPUT，仅放行 loopback；然后 drop 掉 CAP_NET_ADMIN 再切到非 root 用户执行。
2. 或用 Linux network namespace：runner 在一个 `unshare -n` 的空 netns 里 exec 用户代码（这个最干净，空 netns 只有 lo）。
3. 这两者的可信基是**你的 runner 进程**，不是 fly 平台。如果用户代码能提权到 root，防线就没了。所以必须叠加：非 root 用户、只读 rootfs（除 `/work`、`/tmp`）、去掉 capabilities、seccomp。
4. **接受的事实**：这条防线的强度是「容器内自律」级别，不是「平台强制」级别。如果合规要求「平台保证不可出网」，fly.io 目前给不了，要另选方案（自建 KVM + 宿主机防火墙，或选原生支持 network-disabled 的沙箱产品）。
5. 副作用：一旦真的完全禁网，方案 5（Tigris 预签名 URL 传文件）就用不了 —— 文件必须走 `config.files` 入、走 exec stdout 或 volume 出。这两条约束是耦合的，设计时不能分开决策。

### B. 无官方 logs API
见指标 7。`GET /api/v1/apps/:app/logs` 是 fly 自己标注的 undocumented 接口，不能作为产品依赖。

### C. 无产物 TTL
见指标 8。自建清理。

### D. `config.files.raw_value` 无文档化大小上限
20MiB 输入 base64 后约 27MB 请求体。官方文档没有给出限制值，**必须实测**（同时注意上面 1 req/s 的限流）。如果打不进去，只剩 volume 或（与禁网冲突的）对象存储两条路。

### E. exec 端点无 prose 文档
`POST /machines/{id}/exec` 存在于官方 OpenAPI spec 且 flyctl 依赖它，但 fly.io/docs 的 "Machines resource" 页面里**没有**这个端点的说明章节。意味着它有 schema 保证但文档关注度低，升级时要盯着 spec diff。

---

## 安全评估：跑 Agent 生成的不可信代码，实际隔离强度

**能拿到的（平台强制，可信）：**
- **硬件虚拟化隔离**。fly 官方：代码跑在 Firecracker microVM 里，"strong hardware-virtualization-based security and workload isolation"，fly 自己就靠它在共享硬件上跑不同客户的负载。<https://fly.io/docs/reference/architecture/> —— 这一层比 Docker 容器强很多，是这个方案最大的价值。
- **横向隔离**。一 app 一 custom 6PN，官方明确支持 "each customer running untrusted code on your platform" 的多租户隔离；不同 6PN 的 Machine "can never communicate unless explicitly configured"。app 级 secrets 隔离（一个被攻陷的 app 看不到别的 app 的 secrets）。<https://fly.io/docs/machines/guides-examples/one-app-per-user-why/>
- **入站隔离**。不分配 public IP、不配 `services`，公网进不来。
- **资源上限**。CPU/内存由 hypervisor 强制。
- **API 权限最小化**。macaroon token 可以窄到「只允许在这个 app 的 Machine 上执行这条指定命令」。
- **销毁彻底**。官方：stopped Machine 重启时文件系统按 config+image 重置（"completely reset to their original state so that they start clean on the next run"）；DELETE app 级联清理 Machine 与 volume。

**拿不到的（必须自己补，这是真正的风险面）：**
- **出网**。见缺口 A。这是这个方案最薄弱的一环，且只能靠 guest 内自律。默认状态下，Agent 生成的代码**可以自由访问公网**——包括回连 C2、外传你塞进去的数据、往任意地址打流量（并且流量从你的 fly org 出，计费和声誉都算你的）。
- **控制面 token 泄漏**。绝对不能把任何 fly token 放进沙箱 Machine 的 env/secrets/files 里。官方 Blueprint 原话："Keep it server-side and never expose it to a user Machine."
- **guest 内提权**。fly 不管你的镜像里用什么用户跑代码。默认 root 的话，你自己加的 nftables 防线形同虚设。

**总评：** VM 级隔离（强）+ 网络隔离（弱，DIY）。对「跑 LLM 生成的 pandas 数据分析代码」这个具体威胁模型，只要把禁网做扎实（空 netns + 非 root + 只读 rootfs），整体是可接受的；但它不是一个「开箱即用的安全沙箱」，安全性来自你的镜像工程，不是来自 Machines API。

---

## 官方参考链接汇总

| 主题 | URL |
|---|---|
| Machines API 入门（base URL / auth / **速率限制**） | <https://fly.io/docs/machines/api/working-with-machines-api/> |
| Machines resource（create/wait/stop/destroy/config 全字段） | <https://fly.io/docs/machines/api/machines-resource/> |
| 官方 OpenAPI 3.0 spec（含 exec 端点，唯一权威） | <https://docs.machines.dev/spec/openapi3.json> / <https://docs.machines.dev/> |
| Machine 生命周期与冷启动量级 | <https://fly.io/docs/machines/overview/#machine-state> |
| 规格与内存粒度规则 | <https://fly.io/docs/machines/guides-examples/machine-sizing/> |
| 重启策略（`no` / `always` / `on-failure`） | <https://fly.io/docs/machines/guides-examples/machine-restart-policy/> |
| `fly machine run --rm` 一次性语义 | <https://fly.io/docs/machines/flyctl/fly-machine-run/#destroy-the-machine-when-it-exits> |
| 网络：出站默认开启且 NAT | <https://fly.io/docs/networking/egress-ips/> |
| 网络：custom 6PN，官方点名 untrusted code 多租户隔离 | <https://fly.io/docs/networking/custom-private-networks/> |
| 一 app 一租户的理由（隔离边界） | <https://fly.io/docs/machines/guides-examples/one-app-per-user-why/> |
| Blueprint：预热池（官方点名 AI agents / code sandboxes） | <https://fly.io/docs/blueprints/warm-pool-user-machines/> |
| Blueprint：长任务与 Machine 生命周期（stop vs suspend 数据） | <https://fly.io/docs/blueprints/long-running-tasks/> |
| 日志编程访问的三条路及其非官方性 | <https://fly.io/docs/monitoring/logs-api-options/> |
| Token 类型与最小权限（macaroon） | <https://fly.io/docs/security/tokens/> |
| Firecracker microVM 隔离声明 | <https://fly.io/docs/reference/architecture/> |
| Tigris 对象存储（S3 兼容、预签名 URL） | <https://fly.io/docs/tigris/> |
| 定价（shared-cpu-1x/1GB 约 $0.00000228/s） | <https://fly.io/docs/about/pricing/> |

## Caveats / 未验证项

- `config.files[].raw_value` 的实际大小上限：官方文档未给出，**未实测**。
- exec 响应 `stdout`/`stderr` 的实际大小上限：spec 里是无长度约束的 string，**未实测**，不要假设能承载 1MiB。
- 「一次性 Machine（形态 A）如何拿到用户进程退出码」：只在 `MachineEvent.request`（无 schema 的 `object`）里，**未实测字段结构**，不建议依赖。
- fly.io 官方没有 sandbox/jobs 类的专用产品；与本场景最贴近的官方资产就是 Machines API + Warm pools blueprint，**不存在**「fly sandbox」这类现成能力。
- fly.io 官方博客未系统性讨论过「跑不可信用户代码的安全边界」；能找到的官方立场只有 Firecracker 隔离声明 + custom 6PN 文档里那句 "running untrusted code"。本次未逐篇检索 fly.io/blog 全站。
