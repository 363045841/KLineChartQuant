# Research: Google Cloud Run 作为一次性 Python 代码沙箱

- **Query**: Cloud Run 能否承载「提交不可信 Python 代码 → 跑一次 → 取结果 → 销毁」；产品选型 + 12 项硬指标逐条核实
- **Scope**: external（Google Cloud 官方文档 + Cloud Run Admin API v2 Discovery Document）
- **Date**: 2026-09-15
- **主要一手证据**:
  - Cloud Run Admin API v2 Discovery Document，`revision: 20260904`，抓取自 `https://run.googleapis.com/$discovery/rest?version=v2`（字段名以此为准，未在其中出现的字段本文一律标注「未在官方文档中找到」）
  - `cloud.google.com/run/docs/**`（注意：现已 301 到 `docs.cloud.google.com/run/docs/**`，两个域名内容相同）

---

## 1. 摘要

**一句话结论**：能做，但**不要用「每次执行 = 一个 Cloud Run Job Execution」这个形态**。Google 在 2026 年已经为这个场景出了专门产品 —— **Cloud Run sandboxes（Preview）**，它是唯一一个官方文档明确写着「默认不暴露 Google Cloud metadata server、默认阻断全部出站网络、专为 AI agent 运行不可信代码设计」的路径。推荐形态是：**一个常驻的 Cloud Run Service（或 Job）作为 sandbox launcher 宿主，每个代码执行请求在宿主内 `sandbox do` 起一个一次性沙箱**。

**最大风险点（按严重度排序）**：

1. **Cloud Run sandboxes 仍是 Preview**，受 Pre-GA Offerings Terms 约束，"as is"、支持有限、无 SLA。且其能力目前**只有 CLI（`/usr/local/gcp/bin/sandbox`）**，**没有 REST API**——无法从外部直接 create/poll/cancel 一个沙箱，必须由你自己在宿主容器里包一层 HTTP/队列接口。
2. 如果坚持走 **Cloud Run Jobs 方案**：**容器内代码可以直接读 metadata server 拿到任务服务账号的 OAuth token**，官方文档没有提供任何关闭 metadata server 的开关。这是跑 Agent 生成代码时最现实的提权面，只能靠「服务账号权限降到接近零」来缓解，**无法真正封堵**。
3. **两条硬吞吐天花板**（都是 per project + region，且 `entries.list` 明确不可提升）：
   - `Job Run` = **180 次 / 60 秒**
   - Cloud Logging `entries.list` = **60 次 / 分钟，不可提升**
   若按 Jobs 方案实现「每次执行拉一次 stdout」，系统整体吞吐被 Cloud Logging 锁死在 **1 次/秒**。
4. **GCS Object Lifecycle 的 `age` 条件单位是「天」，最小 1 天，且执行是异步、无时限保证**。1 小时 TTL **必须自己实现**。

---

## 2. 产品选型

| 候选 | 适配度 | 判断依据（官方文档） |
|---|---|---|
| **Cloud Run sandboxes**（Preview） | ★★★★★ **推荐** | 文档原文定位就是这个场景："Use this command-line tool to execute untrusted code written in any language, in a highly optimized sandbox environment"；"AI agents can leverage sandboxes to safely run sub-agents, perform computational tasks"。且默认 **no access to the parent workload, environment variables, secrets, or the Google Cloud metadata server**，默认 **all outbound traffic from the sandbox is blocked**，默认 root 文件系统只读，进程退出即删。<br>https://cloud.google.com/run/docs/code-execution |
| **Cloud Run Jobs** | ★★★☆☆ 可行的 fallback | Jobs 是官方的一次性任务形态："a Cloud Run job only runs its tasks and exits when finished. A job does not listen for or serve requests"。有完整 REST API、`taskTimeout`、`overrides`、cancel。但冷启动 + 强制 gen2 + metadata server 可达 + Logging 配额，使它在「高频短任务」上表现差。<br>https://cloud.google.com/run/docs/create-jobs |
| **Cloud Run Services** | ★★☆☆☆ | 常驻 HTTP，本身不是一次性模型；但**作为 sandbox launcher 宿主是最佳载体**（快、无冷启动、能同步返回）。单独用它跑不可信代码等于把代码放进你自己的容器，不可接受。 |
| **Cloud Run functions** | ★☆☆☆☆ | 现已是 Cloud Run 之上的一层部署封装（`gcloud run deploy --function=...`，见 Direct VPC egress 文档中的 Function 分支），底层仍是 Service，隔离性不优于 Service，且不支持一次性执行语义。 |
| **Cloud Batch** | ★☆☆☆☆ | 面向批量/HPC 调度，启动量级为分钟，与 60 秒预算不匹配。（本轮未逐页核实 Batch 文档，仅作排除性判断。） |
| **Vertex AI / Gemini code execution** | ★★☆☆☆ 不满足硬指标 | 这是**模型内建工具**，代码由 Gemini 生成并在 Google 托管环境执行，**你无法指定「预构建镜像 = Python 3.14 + numpy + pandas」，无法指定 1 vCPU / 1 GiB / 60s**，也拿不到 execution 级 REST 状态机。与 issue #155 的硬指标（自带运行时 `python-data-analysis-v1`）根本冲突。<br>注：`https://cloud.google.com/vertex-ai/generative-ai/docs/code-execution` 现为 **404**；相关内容已并入 Gemini Enterprise Agent Platform 文档树，本轮未找到稳定的规格页面 → **未在官方文档中找到可引用的资源/超时规格**。 |

### 一个被 Discovery Document 暴露、但值得注意的第四形态：`projects.locations.instances`

Cloud Run Admin API v2 中存在 `instances` 资源（`create` / `start` / `stop` / `delete` / `get` / `list`），带 `sshEnabled`、`restartPolicy`、`ingress`、`vpcAccess` 字段，且文档树中有 `/run/docs/configuring/instances/sandboxes`。这是「长生命周期单实例」形态，适合做**沙箱宿主池**，不适合做一次性任务本身。

---

## 3. 逐条对照表（12 项硬指标）

> 「方案 A」= Cloud Run sandboxes（推荐）；「方案 B」= Cloud Run Jobs（纯 REST fallback）。

### 3.1 一次性执行模型

| | 结论 |
|---|---|
| **能否满足** | ✅ 两方案都可以 |
| **方案 B 怎么做** | **复用 Job 定义，只触发新 Execution**。官方原文明确支持这一模式："The parameters you specify affect only this execution and not subsequent ones, **because the underlying job definition remains unchanged**." 即：Job 建一次，之后每次执行只调 `:run` + `overrides`。 |
| **REST API** | `POST v2/projects/*/locations/*/jobs`（create，返回 `GoogleLongrunningOperation`）<br>`POST v2/projects/*/locations/*/jobs/{job}:run`（返回 `GoogleLongrunningOperation`）<br>`GET v2/projects/*/locations/*/jobs/{job}/executions/{execution}`（返回 `GoogleCloudRunV2Execution`）<br>`GET .../executions/{execution}/tasks/{task}`（返回 `GoogleCloudRunV2Task`） |
| **方案 A 怎么做** | 宿主内 `sandbox do -- <cmd>`：文档写明它等价于 `sandbox run` → `sandbox exec` → `sandbox delete` 三步，天然一次性。 |
| **官方 URL** | https://cloud.google.com/run/docs/execute/jobs<br>https://cloud.google.com/run/docs/create-jobs<br>https://cloud.google.com/run/docs/code-execution<br>Discovery: `https://run.googleapis.com/$discovery/rest?version=v2` |

**注意**：`jobs.run` 的返回是 LRO，不是 Execution。**LRO 究竟在「execution 启动时」还是「execution 完成时」变 done，本轮未在官方文档中找到明确表述** —— 不要依赖它，用 `executions.get` 轮询。（Discovery 中 `Job.startExecutionToken` 描述为 "become ready when the execution is successfully **started**"，`Job.runExecutionToken` 为 "ready when the execution is successfully **completed**"，但这两个字段是 create-and-run 场景的，语义不能直接套到 `jobs.run` 的 LRO 上。）

---

### 3.2 传入动态代码

| | 结论 |
|---|---|
| **能否满足** | ✅ 但有明确长度上限 |
| **官方支持的传参方式（方案 B）** | 只有三种：`overrides.containerOverrides[].args`（**替换** 既有 args）、`overrides.containerOverrides[].env`（**merge** 进既有 env）、`overrides.taskCount` / `overrides.timeout`。**`overrides` 中没有 volume 覆盖、没有 resources 覆盖、没有 image 覆盖** —— 这是 Discovery 的完整字段集，别猜。 |
| **精确字段** | `GoogleCloudRunV2Overrides`: `containerOverrides[]`, `taskCount`, `timeout`, `delayExecution`<br>`GoogleCloudRunV2ContainerOverride`: `name`, `args[]`, `clearArgs`, `env[]`<br>`GoogleCloudRunV2EnvVar`: `name`, `value`, `valueSource` |
| **大小上限（关键数值）** | · 环境变量**单个变量最大长度 = 32 KB**（quotas 页 "Environment variable / Maximum variable length, in Kb / 32 / per variable"）。Discovery 中 `EnvVar.value` 描述为 "maximum length is **32768 bytes**"，`EnvVar.name` "Must not exceed 32768 characters" —— 两处一致。<br>· 环境变量**个数上限 1000**（per job or per service）。<br>· 命令行参数**个数上限 1000**（per job or per service）。<br>· **单个 arg 的字节上限：未在官方文档中找到。**<br>· **args / env 的总字节上限（整个请求体）：未在官方文档中找到。** |
| **实际含义** | 一个 32 KB 的 env var 足够放绝大多数分析脚本；若担心，可 base64 后按 32 KB 分片到多个 env var（上限 1000 个）。**GCS 不是必须的**，但超大输入建议走 GCS。 |
| **方案 A** | `sandbox do --env KEY=VALUE -- /usr/bin/python3 /mnt/.../task.py`。文档明确："Sandboxes **don't inherit** environment variables from the host container. You must explicitly provide them using the `--env` flag." 代码更适合通过 bind mount 的文件传入（`--mount type=bind,source=...,destination=...,readonly`）。 |
| **官方 URL** | https://cloud.google.com/run/docs/execute/jobs#override-job-configuration<br>https://cloud.google.com/run/quotas<br>https://cloud.google.com/run/docs/code-execution |

**安全提示**：文档明确 "Avoid passing secrets using the env flag as they might be visible to the sandbox processes."

---

### 3.3 资源限额（1 vCPU / 1 GiB）

| | 结论 |
|---|---|
| **能否满足** | ✅ |
| **怎么做** | 在 **Job 定义**上设（不是 override）：`Job.template.template.containers[].resources.limits = {"cpu": "1", "memory": "1Gi"}`（`GoogleCloudRunV2ResourceRequirements.limits`）。 |
| **约束** | · Discovery 原文："The only supported values for CPU are **'1', '2', '4', and '8'**. Setting 4 CPU requires at least 2Gi of memory."<br>· 上限：**8 vCPU / 32 GiB** per container instance（quotas 页）。<br>· **下限：Jobs 强制 gen2 执行环境，而 gen2 "requires at least 512 MiB of memory"** → 1 GiB 合法。<br>· 可写内存文件系统上限 = 实例内存，最大 32 GiB（"Maximum writable, in-memory filesystem, limited by instance memory"）—— 注意 **Cloud Run 的 `/tmp` 占用的是你的 1 GiB 内存额度**，20 MiB 产物会吃进内存预算。<br>· **`overrides` 不能改 CPU/内存**（Discovery 里 `Overrides` 无 resources 字段）→ 每种规格要一个独立 Job 定义。 |
| **官方 URL** | https://cloud.google.com/run/docs/configuring/jobs/cpu<br>https://cloud.google.com/run/docs/configuring/jobs/memory-limits<br>https://cloud.google.com/run/quotas<br>https://cloud.google.com/run/docs/configuring/execution-environments |

方案 A 注意："Sandboxes share the CPU and memory allocated to the **host container**. Make sure your main container's CPU and memory limits can accommodate both your application and any active sandboxes." → 宿主要按 `并发沙箱数 × 1 GiB + 宿主开销` 配额。

---

### 3.4 超时（60 秒）

| | 结论 |
|---|---|
| **能否满足** | ✅ 60s 完全在范围内 |
| **上限 / 默认** | **上限 168 小时（7 天）**；用 GPU 时上限 1 小时。**默认 600 秒**（Discovery: `TaskTemplate.timeout` "Defaults to 600 seconds"）。 |
| **怎么做** | 定义级：`Job.template.template.timeout = "60s"`；单次执行级：`RunJobRequest.overrides.timeout = "60s"`（string duration，秒）。文档原文："You can specify the timeout duration as an integer value in seconds... to set 10 minutes 5 seconds, specify **605 seconds**"。 |
| **超时后的终态** | 文档："If the task attempt does not complete within this time, it will be **stopped**." Execution 走**失败**路径：`Execution.failedCount` 递增，`conditions[type=Completed].state = CONDITION_FAILED`。<br>**⚠️ `GoogleCloudRunV2Condition.executionReason` 的完整枚举里没有 `TIMED_OUT`**：`EXECUTION_REASON_UNDEFINED / JOB_STATUS_SERVICE_POLLING_ERROR / NON_ZERO_EXIT_CODE / CANCELLED / CANCELLING / DELETED / DELAYED_START_PENDING / DELAYED_EXECUTION_EXCEEDING_DURATION_LIMIT`。**Cloud Run 不给你一个机器可读的「超时」终态** —— 见 §3.7。 |
| **重试交互** | "If your job has retries enabled, the timeout setting applies to **each attempt**." → 一次性沙箱必须设 `maxRetries: 0`（Discovery 默认是 **3**，不设就会重试 3 次，总耗时最多 4×60s）。 |
| **官方 URL** | https://cloud.google.com/run/docs/configuring/task-timeout<br>https://cloud.google.com/run/quotas |

---

### 3.5 网络完全禁用（安全关键）

| | 结论 |
|---|---|
| **方案 A** | ✅ **默认即零出站**。文档原文："**By default, all outbound traffic from the sandbox is blocked.** To allow outbound network access, use the `--allow-egress` flag." → 不传 `--allow-egress` 即可。 |
| **方案 B** | ⚠️ **能做到「无互联网」，但做不到「零网络」** |

**方案 B 的官方配方**（来自 VPC Service Controls 文档，Google 自己给的防数据外泄步骤）：

1. Job 配 **Direct VPC egress**（无需 connector）：`TaskTemplate.vpcAccess.networkInterfaces[0] = {network, subnetwork}`，`TaskTemplate.vpcAccess.egress = "ALL_TRAFFIC"`。
   gcloud 等价：`gcloud run jobs update JOB --network=NET --subnet=SUBNET --vpc-egress=all-traffic`。
   `all-traffic` 定义："Sends **all** outbound traffic through the VPC network."
2. VPC 上建 **deny-all egress 防火墙规则**。官方原文："Create a **deny egress rule that blocks all outbound traffic**." 并附警告：*"Make sure that the deny all egress firewall rule has a priority **after 1000**. Otherwise, traffic from Direct VPC egress ... is blocked."*
3. **不配置 Cloud NAT**、不配置外部 IP → 即便没有 deny 规则也无法出公网。
4. 可选加固：组织策略 `run.allowedVPCEgress = all-traffic` 强制所有 revision/job 必须走 VPC；再套 **VPC Service Controls 服务边界**防 Google API 方向的数据外泄。

**做不到的部分（必须明说）**：

- **Metadata server 无法关闭。** 容器运行时契约原文："Cloud Run instances **expose a metadata server**... You can also use the metadata server to **generate tokens for the service identity**"，并列出了 `/computeMetadata/v1/instance/service-accounts/default/token`。它走 link-local，**不经过 VPC 路由，因此 `all-traffic` + deny-all 防火墙对它无效**。官方文档中**没有任何关闭/屏蔽 metadata server 的配置项** —— 未在官方文档中找到。
  → 唯一缓解手段：给 Job 绑一个**权限接近空**的专用服务账号（`TaskTemplate.serviceAccount`），并确保它在项目内、GCS 桶上、任何 API 上都没有可用权限。不要用项目默认 Compute 服务账号（默认带 Editor）。
- **同 VPC 内横向移动**：deny-all egress 规则同时挡住 VPC 内部；但若为了挂 GCS FUSE 放开了 Private Google Access / `199.36.153.4/30:443`，被沙箱代码拿到的 metadata token 就能沿这条路访问 Google API。**这是 Jobs 方案最难关闭的组合风险**。
- **gVisor 不适用于 Jobs**：容器契约原文 "If you use the **first generation** execution environment, the Cloud Run containers are sandboxed using the **gVisor** container runtime sandbox... If you use the **second generation**... you have **full Linux compatibility**"，且 "**Cloud Run jobs always use the second generation execution environment**"。gen2 的定义是 **microVM**（执行环境文档："The second generation execution environment is a **microVM** and provides full Linux compatibility"）。所以 Jobs 的隔离边界是 **microVM（硬件虚拟化）而非 gVisor 系统调用过滤** —— 隔离强度本身是够的，但意味着**所有 syscall 都可用，没有 syscall 层收敛**。

| **官方 URL** | https://cloud.google.com/run/docs/configuring/vpc-direct-vpc<br>https://cloud.google.com/run/docs/securing/using-vpc-service-controls<br>https://cloud.google.com/run/docs/container-contract<br>https://cloud.google.com/run/docs/configuring/execution-environments<br>https://cloud.google.com/run/docs/code-execution |
|---|---|

---

### 3.6 文件输入输出（CSV/XLSX 入 ≤20 MiB，CSV/PNG 出 ≤20 MiB）

| | 结论 |
|---|---|
| **能否满足** | ✅ 两条路都可行，**推荐签名 URL，不推荐 FUSE 挂载** |
| **GCS FUSE 挂载（官方支持）** | Jobs 支持：`TaskTemplate.volumes[].gcs = {bucket, readOnly, mountOptions[]}` + `Container.volumeMounts[]`。gcloud：`--add-volume=name=X,type=cloud-storage,bucket=B[,readonly=true]` + `--add-volume-mount=volume=X,mount-path=/p`。 |
| **FUSE 的官方限制** | · "Cloud Storage FUSE does **not provide concurrency control** for multiple writes (file locking)... last write wins"<br>· "Cloud Storage FUSE is **not a fully POSIX-compliant** file system"<br>· 不允许挂到 `/dev`、`/proc`、`/sys` 及其子目录<br>· 容器契约额外提醒：Cloud Run 不支持 setuid 二进制，"such as **gcsfuse** or sudo"（指容器内自己跑 gcsfuse；托管 volume mount 不受此限） |
| **为什么推荐签名 URL** | 挂 GCS 意味着必须给沙箱进程一条通往 `storage.googleapis.com` 的网络路径（Private Google Access + 放行 `199.36.153.4/30`），这与 §3.5 的「零出站」直接冲突，并把 metadata token 变成可利用的凭证。用 **V4 签名 URL** 则可以由你的控制面在容器外完成上传/下载，沙箱只碰本地文件。<br>签名 URL 文档：https://cloud.google.com/storage/docs/access-control/signed-urls |
| **方案 A 的做法** | 控制面把输入文件写到宿主容器的本地目录 → `sandbox do --mount type=bind,source=/tmp/in,destination=/mnt/in,readonly --mount type=bind,source=/tmp/out,destination=/mnt/out -- ...` → 执行完由宿主（而非沙箱）把 `/tmp/out` 上传 GCS。沙箱本身**不需要任何网络和任何凭证**。这是隔离最干净的形态。 |
| **官方 URL** | https://cloud.google.com/run/docs/configuring/jobs/cloud-storage-volume-mounts<br>https://cloud.google.com/run/docs/container-contract<br>https://cloud.google.com/storage/docs/access-control/signed-urls |

**内存账**：20 MiB 输入 + 20 MiB 输出写在 `/tmp` 上时占用的是实例内存（"Maximum writable, in-memory filesystem, **limited by instance memory**"）→ 1 GiB 配额下 pandas 处理 20 MiB CSV 余量已经不宽裕，建议用 `emptyDir` 且 `medium: DISK`（`GoogleCloudRunV2EmptyDirVolumeSource.medium` 枚举含 `MEMORY` / `DISK`）避免吃内存。

---

### 3.7 异步状态映射

**Execution 上没有单一 `state` 字段。** Discovery 中 `GoogleCloudRunV2Execution` 的状态信息分散在：计数字段 `runningCount` / `succeededCount` / `failedCount` / `cancelledCount` / `retriedCount` / `taskCount`，时间字段 `createTime` / `startTime` / `completionTime`，以及 `conditions[]`。

另有一个**现成的聚合枚举**：`Job.latestCreatedExecution`（类型 `GoogleCloudRunV2ExecutionReference`）的 **`completionStatus`**：

```
COMPLETION_STATUS_UNSPECIFIED
EXECUTION_PENDING    "Waiting for backing resources to be provisioned."
EXECUTION_RUNNING    "Job execution is running normally."
EXECUTION_SUCCEEDED  "Job execution has succeeded."
EXECUTION_FAILED     "Job execution has failed."
EXECUTION_CANCELLED  "Job execution has been cancelled by the user."
```

⚠️ 但它只挂在 **Job 的 `latestCreatedExecution`** 上 —— 并发执行时不能用它来判断「我那一次」。**并发场景必须用 `executions.get` + conditions/counts 自行推导。**

**推荐映射表**：

| 目标状态 | 判定条件（`executions.get` 返回的 `GoogleCloudRunV2Execution`） |
|---|---|
| `queued` | `startTime` 未设置；或 `conditions[type="Completed"].state == CONDITION_PENDING`；或 `executionReason ∈ {DELAYED_START_PENDING}` |
| `running` | `startTime` 已设且 `completionTime` 未设；`runningCount > 0`；`conditions[type="Completed"].state == CONDITION_RECONCILING` |
| `succeeded` | `conditions[type="Completed"].state == CONDITION_SUCCEEDED`（等价：`succeededCount == taskCount`） |
| `cancelled` | `conditions[type="Completed"].state == CONDITION_FAILED` 且 `executionReason == "CANCELLED"`（`CANCELLING` 视为 running/取消中）；或 `cancelledCount > 0` |
| `failed` | `conditions[type="Completed"].state == CONDITION_FAILED` 且 `executionReason == "NON_ZERO_EXIT_CODE"` 或其他非 CANCELLED 原因 |
| `timed_out` | **无法从 Execution 直接判定。** 见下。 |

**怎么区分「失败」和「超时」 —— 这是本方案最脏的一块**：

官方**没有**超时专属的 reason 码。可用的判据只有两条，都需要拉 **Task** 而不是 Execution：

- `GET .../executions/{exec}/tasks/{task}` → `Task.lastAttemptResult`（类型 `GoogleCloudRunV2TaskAttemptResult`）：
  - `exitCode` (integer) — 容器干净退出的退出码
  - `termSignal` (integer) — "Termination signal of the container. **This is set to non-zero if the container is terminated by the system.** At most one of `exit_code` or `term_signal` will be set."
  - `status` (`GoogleRpcStatus`) — "If the status code is OK, then the attempt succeeded."
- **实践判据**：`termSignal != 0`（即被系统杀掉，`exitCode` 未设）且 `completionTime - startTime ≳ taskTimeout` → 判为 `timed_out`；`exitCode != 0` → 判为 `failed`。
- **`termSignal` 的具体数值与「超时」的对应关系，未在官方文档中找到。** 不要硬编码 `SIGKILL=9`。
- **更可靠的做法**：在容器 entrypoint 里自己设一个 **55 秒**的软超时（Python `signal.alarm` / `subprocess timeout`），超时时**主动以约定退出码（如 124）退出**，这样 `exitCode == 124` 就是确定性的超时信号，完全不依赖 Cloud Run 的推断。**强烈建议采用这条。**

**退出码从哪拿**：`Task.lastAttemptResult.exitCode`（只有 Task 级有，Execution 级**没有** exit code 字段）。Task 名通常是 `{execution}/tasks/{execution}-0`；可用 `GET .../executions/{exec}/tasks`（list）枚举，`Task.index` 从 0 开始。

**官方 URL**：https://cloud.google.com/run/docs/execute/jobs · Discovery Document（`GoogleCloudRunV2Execution` / `GoogleCloudRunV2Task` / `GoogleCloudRunV2TaskAttemptResult` / `GoogleCloudRunV2Condition` / `GoogleCloudRunV2ExecutionReference`）

---

### 3.8 stdout / stderr 获取

| | 结论 |
|---|---|
| **能否满足** | ⚠️ 能，但**有延迟、有配额硬墙**，是 Jobs 方案的第二大痛点 |

**怎么按 execution 拉日志**（Cloud Logging API v2）：

```
POST https://logging.googleapis.com/v2/entries:list
{
  "resourceNames": ["projects/PROJECT_ID"],
  "filter": "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"JOB\" AND labels.\"run.googleapis.com/execution_name\"=\"EXECUTION_NAME\"",
  "orderBy": "timestamp asc",
  "pageSize": 1000
}
```

官方给出的 Cloud Run Jobs 日志字段（`/run/docs/logging`）：

- `LogEntry.resource.type` = `cloud_run_job`
- `LogEntry.resource.labels.job_name` / `.location` / `.project_id`
- `LogEntry.labels.execution_name`
- `LogEntry.labels.task_index`、`LogEntry.labels.task_attempt`
- `LogEntry.logName` = `projects/PROJECT/logs/run.googleapis.com%2Fstdout` 或 `...%2Fstderr`（Services 侧文档给出的同构示例是 `run.googleapis.com%2Frequests`；**Jobs 的 stdout/stderr logName 精确字面值本轮未在文档中逐字确认** → 实现时用 `labels.execution_name` 过滤、按 `logName` 后缀区分 stdout/stderr，不要硬编码假设）

**延迟问题（必须处理）**：Cloud Logging 是异步落库。官方文档**没有给出「日志可见延迟」的 SLA 或数值** —— 未在官方文档中找到。这意味着 `executions.get` 刚返回 succeeded 时日志可能还不全。
→ **对策**：`get(taskId)` 在首次进入终态后，对日志做「宽限重拉」：等待 1–3 秒后再拉一次，或持续拉到日志条目数稳定/出现你在 entrypoint 里打的哨兵行（如最后一行输出 `__EXEC_DONE__<exit_code>`）。哨兵行是唯一可靠的完整性判据。

**配额硬墙**：

- `entries.list` = **60 requests / minute / project，Cannot be increased**（Cloud Logging quotas 页原文）。这是整个方案的吞吐瓶颈。
  → 对策：**放弃 `entries.list`**，改用 **Log Sink → Pub/Sub 或 BigQuery**（官方在同一页就建议："To query large volumes of logs, consider using BigQuery APIs. For transferring large volumes of logs, consider using a **log sink**"）；或干脆**不走 Cloud Logging**，让沙箱进程把 stdout/stderr 直接写进挂载卷/GCS 对象（方案 A 天然如此）。

**单条日志上限 / 1 MiB 截断**：

- **单条 LogEntry ≈ 256 KiB**（"Size of a LogEntry / **256 KiB** / This limit is approximate and is based on internal data sizes... **Cannot be increased**"）。
- `LogEntry` label value 上限 64 KiB，label key 512 B，labels 数量 64。
- **Cloud Run 对超长单行 stdout 的具体截断/拆分行为，未在官方文档中找到。**
- **1 MiB 截断怎么做**：Cloud Run/Logging 不提供这个语义，**必须在你的应用层实现**。推荐两层：(1) entrypoint 内对子进程 stdout/stderr 做流式限流，累计到 1 MiB 后停止写出并追加 `...[truncated]`；(2) 控制面拉取时再按字节累加二次截断。

**官方 URL**：https://cloud.google.com/run/docs/logging · https://cloud.google.com/logging/quotas · https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list

---

### 3.9 取消

| | 结论 |
|---|---|
| **能否满足** | ✅ |
| **API** | `POST https://run.googleapis.com/v2/projects/{P}/locations/{R}/jobs/{JOB}/executions/{EXEC}:cancel`<br>Body: `GoogleCloudRunV2CancelExecutionRequest { "etag": string, "validateOnly": bool }`（都可省，官方示例 `-d ''`）<br>返回：`GoogleLongrunningOperation` |
| **终态** | 官方原文："Cancelling a job execution stops the current job execution. **Cancelled executions have the status `cancelled`**. You will still be able to view the execution, including its configuration data, logs, and monitoring data."<br>对应到 API：`Condition.executionReason` 先为 `CANCELLING`，终态 `CANCELLED`；`Execution.cancelledCount` 递增。 |
| **权限** | **`run.executions.cancel`**（官方注："On September 16, 2024, the permission required to cancel a Cloud Run job changed to `run.executions.cancel`"）。包含在 `roles/run.jobsExecutor` 和 `roles/run.jobsExecutorWithOverrides` 中。 |
| **cancel vs delete** | `DELETE .../executions/{EXEC}` 也能停止执行，但"removes the execution from the job execution list and **you can't view it**"（日志也不再可查）。**做 `cancel(taskId)` 一定用 `:cancel`，不要用 delete。** |
| **计费** | "Cancelling a job execution does **not** reverse the charges for any Cloud Run jobs usage for the time that the job was executing." |
| **官方 URL** | https://cloud.google.com/run/docs/execute/jobs#cancel-job-execution<br>https://cloud.google.com/run/docs/managing/job-executions |

---

### 3.10 产物 1 小时自动删除

| | 结论 |
|---|---|
| **能否满足** | ❌ **GCS Object Lifecycle 做不到 1 小时 TTL。必须自己实现。** |
| **最小粒度** | **`age` 条件的单位是「天」，最小 1 天。** 官方原文："The `age` condition is satisfied when a resource reaches the specified age (**in days**)."<br>可用条件的完整列表（无一支持小时级 TTL）：`age`, `createdBefore`, `customTimeBefore`, `daysSinceCustomTime`, `daysSinceNoncurrentTime`, `isLive`, `matchesStorageClass`, `matchesPrefix`/`matchesSuffix`, `noncurrentTimeBefore`, `numNewerVersions`, `sizeAboveBytes`/`sizeBelowBytes`。 |
| **另外两个坑** | · **执行不保证时效**："Cloud Storage performs an action **asynchronously**, so there can be a lag... **Your applications shouldn't rely on lifecycle actions occurring within a certain amount of time** after a lifecycle condition is met."<br>· **配置变更本身要 24 小时生效**："Changes to a bucket's lifecycle configuration can take **up to 24 hours** to go into effect."<br>· **Soft delete**：删了也不是真删 —— "when you delete a live object, it becomes soft-deleted, and Cloud Storage retains it for a duration of **seven days**"（除非在桶上关闭 soft delete）。对「1 小时后销毁」的安全语义，这一条必须处理。 |
| **推荐实现** | 1. 自己实现 TTL：**Cloud Scheduler（每 5–10 分钟）→ Cloud Run Job/Service**，按对象 `timeCreated` 或对象前缀里的时间戳批量 `objects.delete`；或在 `get(taskId)` 的控制面里按 taskId 记录 `expireAt` 并由后台清理器删除。<br>2. **签名 URL 的 TTL 设成 1 小时**，让链接先失效（这是「1 小时后不可访问」的第一道防线，且是精确的）。<br>3. GCS lifecycle `age: 1`（1 天）作为**兜底清道夫**，防止清理器漏删。<br>4. 桶上**关闭 soft delete**（或设为最短），否则删除后数据仍保留 7 天。 |
| **官方 URL** | https://cloud.google.com/storage/docs/lifecycle<br>https://cloud.google.com/storage/docs/access-control/signed-urls |

---

### 3.11 冷启动

| | 结论 |
|---|---|
| **官方是否给出 Jobs 冷启动量级** | ❌ **Cloud Run Jobs 的启动延迟量级，未在官方文档中找到具体数值。** |
| **文档中能拿到的相关事实** | · **Jobs 强制使用 gen2 执行环境**，而 gen2 "has **longer cold start times** than first generation for some services"（gen1=gVisor 主打 "fast cold start times"）。<br>· **容器启动超时 = 4 分钟**（quotas: "Container instance / Startup timeout, in minutes / **4**"）→ 这是硬上限，不是典型值。<br>· **唯一被官方量化的冷启动数字**：Direct VPC egress 文档 —— "With **Cloud NAT**, you might experience cold start delays of **30s or more** on instance startup when using Direct VPC egress. For better startup performance, avoid Direct VPC egress with Cloud NAT." |
| **对 60 秒预算的意义** | ⚠️ **`taskTimeout` 是任务运行时间预算，冷启动/镜像拉取不计入其中**（timeout 描述为 "time duration the task may be **active**"），但**端到端用户等待时间 = 调度 + 冷启动 + 60s + 日志可见延迟**。<br>预算分配建议：`taskTimeout = 60s`（对齐产品语义）→ entrypoint 内软超时 **55s** → 留 5s 给结果落盘/上传/哨兵日志；端到端 SLA 按 **90–120 秒**设，不要对外承诺 60 秒。<br>**必须避免**：Cloud NAT + Direct VPC egress 组合（+30s）。<br>**镜像优化**：Python 3.14 + numpy + pandas 镜像本身不小，镜像拉取时间直接计入冷启动 → 用 Artifact Registry 同 region、精简镜像层。 |
| **方案 A 的优势** | Cloud Run sandboxes 文档明确宣称："**Fast creation**: Sandboxes are interactive and ready to execute commands **almost instantly**. By creating sandboxes within an existing Cloud Run resource where your agent runs, you **reduce creation times when compared to creating a new Cloud Run resource for every task**." —— 官方自己把「每个任务新建一个 Cloud Run 资源」列为反模式。（**"almost instantly" 无具体数值** → 未在官方文档中找到。） |
| **官方 URL** | https://cloud.google.com/run/docs/configuring/execution-environments<br>https://cloud.google.com/run/docs/configuring/vpc-direct-vpc<br>https://cloud.google.com/run/quotas<br>https://cloud.google.com/run/docs/code-execution |

---

### 3.12 认证与最小权限

> ⚠️ 本文档不包含、也不要求任何真实凭证。以下仅为角色/权限名。

**两个必须分开的身份**：

| 身份 | 用途 | 所需角色 / 权限 |
|---|---|---|
| **控制面 SA**（你的 Agent 后端用来调 API） | create job（一次性）、run、poll、cancel、读日志、签 GCS URL | 见下 |
| **任务 SA**（`TaskTemplate.serviceAccount`，容器内跑的身份） | **应当接近零权限** | 见下 |

**控制面 SA 的最小权限**：

- 触发执行（带 overrides）：`roles/run.jobsExecutorWithOverrides` —— 含 `run.jobs.run` + **`run.jobs.runWithOverrides`** + `run.executions.cancel`。
  ⚠️ **`run.jobs.runWithOverrides` 是独立权限**，`roles/run.jobsExecutor`（只有 `run.executions.cancel` + `run.jobs.run`）**不够**，带 overrides 会 403。
- 轮询状态：`roles/run.jobsExecutorWithOverrides` **不含 `run.executions.get`** → 需额外授予 `roles/run.viewer`（可在 **Job 级别**授予，文档明确 "Lowest-level resources where you can grant this role: Cloud Run service / Cloud Run job / Cloud Run instance"），或自建 custom role 仅含 `run.executions.get` + `run.tasks.get`（`run.jobs.get`）。
- 部署/更新 Job 定义（仅 CI/引导阶段，运行时不需要）：`roles/run.developer` + 对任务 SA 的 `roles/iam.serviceAccountUser`（`gcloud run jobs` 文档一致要求这两个）。
- 读日志：`roles/logging.viewsAccessor`（`logging.views.access`）或 `roles/logging.viewer`。
  （题目中写的 `logging.views.access` 是权限名，对应角色为 Logs View Accessor。）
- GCS：签名 URL 需要 `roles/storage.objectCreator` / `objectViewer`，或用 `iam.serviceAccounts.signBlob`（`roles/iam.serviceAccountTokenCreator`）做无密钥签名。
- OAuth scope：`https://www.googleapis.com/auth/cloud-platform`（Discovery 中 `jobs.run` 接受 `cloud-platform` 或 `run`；只读方法额外接受 `run.readonly`）。

**任务 SA（容器身份）的最小权限 —— 这是 §3.5 的核心缓解措施**：

- **专门新建一个 SA，不授予任何项目级角色。**
- **绝不使用项目默认 Compute Engine 服务账号**（默认带 Editor，等于把整个项目交给不可信代码）。
- 若采用签名 URL I/O，任务 SA 应当**对 GCS 桶也没有任何权限**。
- 若不得不挂 GCS FUSE：只在**该单个桶**上授 `roles/storage.objectUser`（或最小的 objectViewer/objectCreator），且桶只属于该次执行、执行完即清。

**官方 URL**：https://cloud.google.com/run/docs/reference/iam/roles · https://cloud.google.com/run/docs/securing/service-identity · https://cloud.google.com/run/docs/configuring/task-timeout（Required roles 段）

---

## 4. 推荐实现形态

### 4.1 首选：Cloud Run sandboxes（Preview）

**架构**：一个常驻 Cloud Run **Service**（或长跑 Job / Instance）作为 *sandbox launcher host*，内置一个小 HTTP 控制面；每个 `execute` 请求在宿主里起一个一次性沙箱。

**部署（一次性）**：

```bash
gcloud beta run jobs create python-data-analysis-v1 \
  --image=REGION-docker.pkg.dev/PROJECT/repo/python-data-analysis:v1 \
  --sandbox-launcher \
  --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=60s \
  --service-account=sandbox-task-sa@PROJECT.iam.gserviceaccount.com \
  --region=REGION
```

YAML 等价（`run.googleapis.com/v1`，注意必须打 BETA launch-stage 注解）：

```yaml
apiVersion: run.googleapis.com/v1
kind: Job
metadata:
  name: python-data-analysis-v1
  annotations:
    run.googleapis.com/launch-stage: BETA
spec:
  template:
    spec:
      template:
        spec:
          containers:
            - name: runner
              image: IMAGE_URL
              sandboxLauncher: true
```

> v2 REST 上对应字段为 `GoogleCloudRunV2Container.sandboxLauncher` (boolean)，描述："Indicates that this container can act as a sandbox supervisor and launch sandboxes."（存在于 Discovery `revision 20260904`；**v2 REST 侧的 Preview 使用说明官方目前只给了 gcloud/YAML 两种入口**。）

**每次执行（宿主容器内，Python 控制面）**：

```python
import subprocess, sys
# 输入 CSV 已由控制面写到 /work/{tid}/in/ ；代码写到 /work/{tid}/code/task.py
r = subprocess.run([
    "/usr/local/gcp/bin/sandbox", "do",
    "--mount", f"type=bind,source=/work/{tid}/code,destination=/mnt/code,readonly",
    "--mount", f"type=bind,source=/work/{tid}/in,destination=/mnt/in,readonly",
    "--mount", f"type=bind,source=/work/{tid}/out,destination=/mnt/out",
    "--env", "PATH=/usr/local/bin:/usr/bin:/bin",
    # 不传 --allow-egress => 出站全阻断（默认）
    "--", "/usr/bin/python3", "/mnt/code/task.py",
], capture_output=True, timeout=60)
exit_code, stdout, stderr = r.returncode, r.stdout[:1<<20], r.stderr[:1<<20]
```

**这个形态同时解决了**：零出站（默认）、无 metadata server（默认）、无冷启动（"almost instantly"）、stdout/stderr 直接是 `subprocess` 返回值（绕过 Cloud Logging 的 60 req/min 墙）、1 MiB 截断在应用层一行搞定、超时用 Python `timeout=60` 精确控制、cancel 就是杀进程。

**代价**：Preview；没有 REST API，状态机/队列/持久化要你自己写；宿主内存需按并发数配。

---

### 4.2 Fallback：纯 REST 的 Cloud Run Jobs 序列

所有 endpoint 前缀：`https://run.googleapis.com/`，Header：`Authorization: Bearer <token>`、`Content-Type: application/json`。

#### Step 0 — 创建 Job（引导期一次性，非每次执行）

```
POST /v2/projects/{P}/locations/{R}/jobs?jobId=python-data-analysis-v1
```
```json
{
  "template": {
    "parallelism": 1,
    "taskCount": 1,
    "template": {
      "containers": [{
        "name": "runner",
        "image": "REGION-docker.pkg.dev/PROJECT/repo/python-data-analysis:v1",
        "command": ["/usr/local/bin/entrypoint.sh"],
        "args": [],
        "env": [],
        "resources": { "limits": { "cpu": "1", "memory": "1Gi" } },
        "volumeMounts": [{ "name": "scratch", "mountPath": "/scratch" }]
      }],
      "volumes": [{ "name": "scratch", "emptyDir": { "medium": "DISK", "sizeLimit": "512Mi" } }],
      "timeout": "60s",
      "maxRetries": 0,
      "serviceAccount": "sandbox-task-sa@PROJECT.iam.gserviceaccount.com",
      "executionEnvironment": "EXECUTION_ENVIRONMENT_GEN2",
      "vpcAccess": {
        "egress": "ALL_TRAFFIC",
        "networkInterfaces": [{ "network": "sandbox-vpc", "subnetwork": "sandbox-subnet" }]
      }
    }
  },
  "launchStage": "GA"
}
```
→ 返回 `GoogleLongrunningOperation`。

字段来源（全部见 Discovery `GoogleCloudRunV2Job` / `ExecutionTemplate` / `TaskTemplate` / `Container` / `ResourceRequirements` / `Volume` / `EmptyDirVolumeSource` / `VpcAccess`）。
> ⚠️ `GoogleCloudRunV2ExecutionTemplate` 的字段清单本轮未逐字段展开核对，`parallelism` / `taskCount` / `template` 三项来自 `Execution` 的同名 output-only 字段与 Job 文档描述；实现前建议对 `GoogleCloudRunV2ExecutionTemplate` 再核一次 Discovery。

#### Step 1 — 触发一次执行

```
POST /v2/projects/{P}/locations/{R}/jobs/python-data-analysis-v1:run
```
```json
{
  "overrides": {
    "taskCount": 1,
    "timeout": "60s",
    "containerOverrides": [{
      "name": "runner",
      "args": ["--task-id", "TASK_ID"],
      "clearArgs": false,
      "env": [
        { "name": "USER_CODE_B64", "value": "<base64, 单个 value ≤ 32768 bytes>" },
        { "name": "INPUT_SIGNED_URL", "value": "https://storage.googleapis.com/..." },
        { "name": "OUTPUT_SIGNED_URL", "value": "https://storage.googleapis.com/..." },
        { "name": "SOFT_TIMEOUT_SECONDS", "value": "55" }
      ]
    }]
  }
}
```
→ 返回 `GoogleLongrunningOperation`。Execution 名从 `operation.metadata` / `operation.response` 取；**`metadata` 是 `google.protobuf.Any`，其具体 type 未在官方文档中找到** → 稳妥做法：用 `GET /v2/.../jobs/{JOB}` 读 `latestCreatedExecution.name`（**仅在低并发下安全**），或对 `executions.list` 按 `createTime` + 你注入的 label 匹配。

需要权限：`run.jobs.run` + `run.jobs.runWithOverrides`。

#### Step 2 — 轮询状态

```
GET /v2/projects/{P}/locations/{R}/jobs/{JOB}/executions/{EXEC}
```
→ `GoogleCloudRunV2Execution`。按 §3.7 表映射。

可选长轮询（省 API 配额）：
```
POST /v2/projects/{P}/locations/{R}/operations/{OP}:wait
{ "timeout": "30s" }
```
（`GoogleLongrunningWaitOperationRequest`；文档注明 "best-effort basis"，可能提前返回。）

#### Step 3 — 取退出码

```
GET /v2/projects/{P}/locations/{R}/jobs/{JOB}/executions/{EXEC}/tasks
```
→ `GoogleCloudRunV2ListTasksResponse`；取 `tasks[0].lastAttemptResult.exitCode` / `.termSignal` / `.status`。

#### Step 4 — 取 stdout/stderr

```
POST https://logging.googleapis.com/v2/entries:list
{
  "resourceNames": ["projects/{P}"],
  "filter": "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"{JOB}\" AND labels.\"run.googleapis.com/execution_name\"=\"{EXEC}\"",
  "orderBy": "timestamp asc",
  "pageSize": 1000
}
```
⚠️ 60 req/min/project，不可提升。生产务必改走 Log Sink 或让容器自己把日志写进 GCS。

#### Step 5 — 取消

```
POST /v2/projects/{P}/locations/{R}/jobs/{JOB}/executions/{EXEC}:cancel
Body: {}
```

#### Step 6 — 产物清理

签名 URL 有效期设 1 小时；后台清理器按 `expireAt` 删对象；GCS lifecycle `age:1` 兜底；桶关闭 soft delete。

---

## 5. 明确的能力缺口

| # | 缺口 | 影响 | 只能这样绕 |
|---|---|---|---|
| 1 | **Cloud Run sandboxes 无 REST API** | 无法从 Agent 后端直接管理沙箱生命周期 | 自己在宿主容器里包一层 HTTP 控制面（queued/running/succeeded 状态机、taskId 索引、取消都自己实现） |
| 2 | **Cloud Run sandboxes 是 Preview** | 无 SLA、可能变更、支持有限 | 接口层抽象 `SandboxProvider`，保留 Jobs 作为可切换的 fallback 实现 |
| 3 | **Jobs 无法关闭 metadata server** | 不可信代码可拿到任务 SA 的 OAuth token | 任务 SA 零权限；不给它任何桶/API 权限；走签名 URL 而非 FUSE |
| 4 | **Jobs 无超时专属终态** | `failed` 与 `timed_out` 不可机器区分 | entrypoint 内设 55s 软超时 + 约定退出码（如 124） |
| 5 | **`overrides` 不能改 CPU/内存/镜像/volume** | 「一个运行时 = 一个资源档位」 | 每个 (runtime × 资源规格) 组合预建一个 Job 定义 |
| 6 | **Cloud Logging `entries.list` 60/min 不可提升** | 整体吞吐锁死在 ~1 次/秒 | Log Sink → Pub/Sub / BigQuery，或容器自己写日志到挂载卷/GCS |
| 7 | **`Job Run` 180/60s per project+region** | 触发速率上限 3/s（可申请提升） | 多 region / 多 project 分片；或走方案 A 完全绕开 |
| 8 | **GCS lifecycle 最小 1 天，且异步无时限** | 1 小时 TTL 做不到 | 自建定时清理器 + 1 小时签名 URL + lifecycle `age:1` 兜底 |
| 9 | **GCS soft delete 默认保留 7 天** | 「销毁」不是真销毁 | 桶上关闭 soft delete |
| 10 | **Jobs 冷启动无官方数值** | 60s 端到端 SLA 无法用文档论证 | 实测；对外 SLA 按 90–120s；避开 Cloud NAT + Direct VPC egress 组合 |
| 11 | **Cloud Logging 日志可见延迟无官方数值** | `succeeded` 时日志可能不全 | 哨兵日志行 + 宽限重拉 |
| 12 | **Cloud Run 对超长单行 stdout 的截断行为未文档化** | 1 MiB 截断语义不可依赖平台 | 在容器内 + 控制面双层自行截断 |
| 13 | **Vertex AI / Gemini code execution 的资源与运行时规格文档缺失（404）** | 无法作为可论证的备选 | 排除 |

---

## 6. 安全评估：跑 Agent 生成的不可信代码，实际隔离强度有多高

### 6.1 隔离边界

| 层 | 方案 A（Cloud Run sandboxes） | 方案 B（Cloud Run Jobs） |
|---|---|---|
| 硬件/内核隔离 | 宿主是 Cloud Run 实例（gen2 microVM）；沙箱在其内再加一层进程隔离 | **gen2 microVM**（Jobs 强制 gen2，**不是 gVisor**） |
| 租户间隔离 | 官方："All sandboxes are **completely isolated from each other**" | 官方："Cloud Run ensures a **strict isolation between container instances**, be it of the same service, or different services from different projects" |
| Syscall 收敛 | 未在官方文档中找到具体机制 | ❌ 无：gen2 = "**full Linux compatibility**, including support for all system calls, namespaces, and cgroups" |
| Root 能力 | 沙箱内 "processes run with **sudo privileges as a non-root user**"（沙箱内部提权是设计内的，因为沙箱本身是边界） | 容器契约：无 root capabilities、privilege escalation disabled、无 `--privileged`、setuid 不支持、`/dev` `/proc` `/sys` 大部分不可写 |
| 文件系统 | 默认**宿主根文件系统只读**；写需 `--write`（tmpfs overlay，退出即丢）；持久写需显式 bind mount | 容器自己的可写层 + `/tmp`（**占实例内存**） |

### 6.2 Metadata server —— 最现实的提权面

**方案 A：已被官方关闭。** 文档原文：

> "By default, sandboxes **don't have access to the parent workload, environment variables, secrets, or the Google Cloud metadata server**."

这是唯一一句官方明确写「沙箱看不到 metadata server」的文字，也是选 Cloud Run sandboxes 的决定性理由。

**方案 B：无法关闭。** 容器运行时契约明确列出 metadata server 一直存在，且可用于换 token：

```
GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
Metadata-Flavor: Google
```

不可信代码两行就能拿到任务 SA 的 access token。并且：

- metadata server 走 link-local，**不经 VPC 路由**，`--vpc-egress=all-traffic` + deny-all 防火墙对它**无效**；
- 官方文档**没有提供任何屏蔽/禁用 metadata server 的配置项** —— 未在官方文档中找到；
- 因此方案 B 的安全上限 = **任务 SA 的权限上限**。任务 SA 必须视为「已泄露」来设计。

**必须执行的缓解清单（方案 B）**：

1. 专用任务 SA，**零项目级角色**（绝不用默认 Compute SA）。
2. 用**签名 URL** 做 I/O，不挂 GCS FUSE → 任务 SA 对桶也无权限，token 拿了也没用。
3. 若必须挂 FUSE：只在单个短生命周期桶上给最小 object 权限；接受「拿到 token 的代码能读写该桶」。
4. **VPC Service Controls 服务边界** 包住项目 → 即便 token 泄露到外部，也无法在边界外使用（这是 metadata token 泄露后唯一有效的止血手段）。
5. 组织策略 `run.allowedVPCEgress = all-traffic` 防止有人部署出一个没走 VPC 的 job。
6. 单独的 Google Cloud 项目承载沙箱工作负载 —— 官方多租户指南的第一条建议就是 "**one Google Cloud project per tenant** (Recommended)"，最低限度也要「沙箱项目 ≠ 业务项目」。

### 6.3 网络出站

- **方案 A**：✅ 默认全阻断（"By default, all outbound traffic from the sandbox is blocked"）。**不要传 `--allow-egress`。**
- **方案 B**：⚠️ 可做到无互联网（Direct VPC egress + `all-traffic` + deny-all egress 规则 priority>1000 + 无 Cloud NAT），但**做不到零网络**：metadata server 始终可达。若为 FUSE 放开了 `199.36.153.4/30:443` + Private Google Access，则 token + 网络路径同时具备，风险等级显著上升。

### 6.4 结论

- 跑 **Agent 生成的不可信 Python 代码**，**方案 A（Cloud Run sandboxes）在安全上明显优于方案 B**，且是 Google 官方为此场景给出的答案。
- 方案 B 的隔离强度（microVM）对「代码逃逸到宿主」是足够的；它的真实风险不在逃逸，而在 **metadata token → Google Cloud API** 这条完全合法的路径。
- 如果因为 Preview 风险必须先上方案 B，**把「任务 SA 零权限 + 签名 URL I/O + VPC-SC 边界 + 独立项目」当作不可协商的四件套**，不要把其中任何一条当优化项延后。

---

## 7. 引用的官方 URL 汇总

| 主题 | URL |
|---|---|
| Cloud Run Admin API v2 Discovery（字段权威来源，rev 20260904） | `https://run.googleapis.com/$discovery/rest?version=v2` |
| Code execution in Cloud Run（sandboxes，Preview） | https://cloud.google.com/run/docs/code-execution |
| Configure sandboxes for jobs | https://cloud.google.com/run/docs/configuring/jobs/sandboxes |
| Configure sandboxes for instances | https://cloud.google.com/run/docs/configuring/instances/sandboxes |
| Create jobs | https://cloud.google.com/run/docs/create-jobs |
| Execute jobs（含 overrides / cancel 的 REST 示例） | https://cloud.google.com/run/docs/execute/jobs |
| Manage job executions | https://cloud.google.com/run/docs/managing/job-executions |
| Set task timeout for jobs | https://cloud.google.com/run/docs/configuring/task-timeout |
| Configure CPU for jobs | https://cloud.google.com/run/docs/configuring/jobs/cpu |
| Configure memory for jobs | https://cloud.google.com/run/docs/configuring/jobs/memory-limits |
| Cloud Run quotas and limits | https://cloud.google.com/run/quotas |
| Execution environments（gen1 gVisor / gen2 microVM） | https://cloud.google.com/run/docs/configuring/execution-environments |
| Container runtime contract（metadata server / 权限 / 沙箱） | https://cloud.google.com/run/docs/container-contract |
| Direct VPC egress | https://cloud.google.com/run/docs/configuring/vpc-direct-vpc |
| VPC Service Controls with Cloud Run（deny-all egress 配方） | https://cloud.google.com/run/docs/securing/using-vpc-service-controls |
| Multi-tenant platforms running untrusted code | https://cloud.google.com/run/docs/securing/multi-tenant |
| Service identity | https://cloud.google.com/run/docs/securing/service-identity |
| Cloud Run IAM roles（jobsExecutorWithOverrides 等） | https://cloud.google.com/run/docs/reference/iam/roles |
| Cloud Storage volume mounts for jobs | https://cloud.google.com/run/docs/configuring/jobs/cloud-storage-volume-mounts |
| Cloud Run logging（Jobs 日志 label） | https://cloud.google.com/run/docs/logging |
| Cloud Logging quotas and limits | https://cloud.google.com/logging/quotas |
| Logging `entries.list` API | https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list |
| GCS Object Lifecycle Management | https://cloud.google.com/storage/docs/lifecycle |
| GCS signed URLs | https://cloud.google.com/storage/docs/access-control/signed-urls |

> 注：以上 `cloud.google.com/...` 链接目前均 301 到 `docs.cloud.google.com/...`，内容一致。

---

## 8. Caveats / 未在官方文档中找到

明确标注、**未据此编造任何字段名或数值**：

1. `jobs.run` 返回的 LRO 在「execution 启动」还是「execution 完成」时变 `done` —— 未找到明确表述。
2. `jobs.run` LRO 的 `operation.metadata` 的具体 protobuf type —— 未找到。
3. Cloud Run Jobs 的 **stdout/stderr `logName` 精确字面值**（推测为 `run.googleapis.com%2Fstdout` / `%2Fstderr`，但 Jobs 页未逐字给出）—— 未逐字确认。
4. Cloud Run Jobs 的**冷启动典型延迟数值** —— 未找到（仅有「Cloud NAT + Direct VPC egress 时 30s+」和「启动超时 4 分钟」两个可引用数字）。
5. Cloud Logging **日志可见延迟**的 SLA / 典型值 —— 未找到。
6. Cloud Run 对**超长单行 stdout** 的截断/拆分行为 —— 未找到。
7. `overrides.containerOverrides.args` 的**单个 arg 字节上限**与 `:run` 请求体**总字节上限** —— 未找到（只找到「个数 ≤ 1000」）。
8. `TaskAttemptResult.termSignal` 的**具体数值与超时的对应关系** —— 未找到。
9. Cloud Run sandboxes 的 **v2 REST 侧使用说明**（`sandboxLauncher` 字段存在于 Discovery，但官方操作文档只给了 gcloud `--sandbox-launcher` 和 v1 YAML `sandboxLauncher: true`）。
10. Cloud Run sandboxes 的**单沙箱资源配额、并发上限、"almost instantly" 的具体毫秒数** —— 未找到。
11. **Vertex AI / Gemini code execution** 的资源规格、超时、运行时镜像可定制性 —— 相关 URL 已 404，未找到可引用的规格页。
12. **Cloud Batch** 本轮未逐页核实，仅基于产品定位做排除。
13. `GoogleCloudRunV2ExecutionTemplate` 的完整字段清单本轮未逐字段展开（§4.2 Step 0 中的 `parallelism` / `taskCount` / `template` 建议实现前再核一次 Discovery）。
