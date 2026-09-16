# Research: AI Code Interpreter / 代码沙箱的产物与输入文件生命周期对标

- **Query**: 主流 AI code interpreter / 代码沙箱产品对「执行产物（artifacts）与输入文件的生命周期管理」的实际做法，为 TTL 策略提供对标依据
- **Scope**: external（全部基于官方文档 / 官方定价页，逐条附 URL）
- **Date**: 2026-09-15
- **方法**: 直接 HTTP 抓取官方文档页面并提取正文。未使用记忆补数据；查不到的一律标注「未在官方文档中找到」。

---

## 摘要

**一句话推荐**：沙箱本身用**短的闲置回收（idle timeout，分钟级）+ 执行完立即显式销毁**；**产物不要随沙箱消失**，而是落到独立对象存储并给一个**应用层强制执行的 TTL**——1 小时在业界属于**偏激进但完全在合理区间的下沿**（OpenAI 容器 20 分钟闲置即销毁数据，Cloudflare Containers 睡眠后磁盘直接清空）；**不要依赖云平台原生 TTL**（GCS Object Lifecycle 的 `age` 以天为单位且配置变更本身需最多 24 小时生效），而应学 OpenAI 的 `expires_after {anchor: last_active_at, minutes}` 与 Daytona 的**以分钟为单位的 auto-stop/auto-delete interval**，即：**平台 lifecycle 只作为兜底清道夫（设 1 天），精确到小时/分钟的删除由自己的定时任务或读取时校验 TTL 来保证**。

主要依据：

1. 两家最主流的 AI code interpreter（OpenAI、Anthropic）都**明确要求把容器视为 ephemeral**，且都把「产物文件」与「容器」做了**生命周期分离**——Anthropic 明确写明 Files API 产物「persist until explicitly deleted」，与容器 30 天保留期不同。
2. 所有做一次性执行的沙箱平台（OpenAI、Modal、Vercel、Daytona、Cloudflare、E2B）默认值都落在 **5–20 分钟**区间，且**全部是闲置/固定短 TTL，而非长保留**。
3. 需要更细粒度 TTL 的产品，**没有一家依赖对象存储的原生 lifecycle**，全部是自建的分钟级过期字段。

---

## 竞品对照表

| 产品 | 沙箱默认存活 | 沙箱最大存活 | 产物保留 | 回收机制 | 显式销毁/延长 | 官方 URL |
|---|---|---|---|---|---|---|
| **OpenAI Code Interpreter**（Responses API containers） | 容器 **20 分钟未使用即过期** | 未在官方文档中找到明确的绝对上限（任何容器操作都会刷新 `last_active_at`，理论上可无限续） | **随容器消失**：过期后「all data associated with the container will be discarded from our systems and not recoverable」，仅保留元数据快照 | **闲置回收**（idle，anchor = `last_active_at`） | 可显式 `DELETE /containers/{id}`；可通过 `expires_after: {anchor: "last_active_at", minutes: N}` **自定义分钟级 TTL** | https://developers.openai.com/api/docs/guides/tools-code-interpreter ；https://developers.openai.com/api/reference/resources/containers/methods/create |
| **Anthropic Claude code execution tool** | 每次请求默认新容器；**约 5 分钟无活动后 checkpoint**（可在 30 天窗口内恢复） | **容器创建后 30 天过期** | **双轨**：① 容器内数据（含执行产物、上传文件、输出）**最多保留 30 天**；② 写入 `$OUTPUT_DIR` 被捕获成 Files API 文件的产物「**persist until explicitly deleted**」 | **混合**：5 分钟闲置 checkpoint + 30 天固定 TTL | 可传回 container id 复用（等同续期到 30 天窗口内）；Files API 文件需显式删除。**未在官方文档中找到「主动销毁容器」的 API** | https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool |
| **E2B** | `Sandbox.create()` 文档示例用显式 timeout；`Sandbox.connect()` 的 **默认 timeout 为 5 分钟** | **连续运行上限：Pro 24 小时 / Hobby(Base) 1 小时**；pause→resume 后重新计时，故总寿命无上限 | **暂停的沙箱无限期保留**：「kept indefinitely，there is no time-to-live and no automatic deletion」「no configurable auto-kill after N days option」 | **固定 timeout**，到期行为由 `onTimeout` 决定，**默认 `"kill"`**，可设为 `"pause"` | 可 `sandbox.kill()` 显式销毁；`setTimeout()/set_timeout()` 可延长**或缩短**剩余寿命 | https://docs.e2b.dev/sandbox ；https://docs.e2b.dev/sandbox/persistence ；https://e2b.dev/pricing |
| **Modal Sandboxes** | **默认最大寿命 5 分钟** | **可配置至 24 小时**；超过 24 小时官方建议用 Filesystem Snapshots | 未在官方文档中找到独立于沙箱的产物保留期；需显式用 Volumes / Snapshots 持久化 | **固定 timeout（默认 5 分钟）+ 可选 `idle_timeout`**（活跃判定：有 exec 命令运行 / stdin 写入 / Tunnel 上有 TCP 连接） | `sb.terminate()` 显式销毁；`timeout` 参数在 create 时设定 | https://modal.com/docs/guide/sandboxes |
| **Vercel Sandbox** | **默认 timeout 5 分钟** | **单 session 最长：Hobby 45 分钟 / Pro 与 Enterprise 24 小时**；session 上限不等于沙箱寿命，stop→resume 会重置，持久沙箱总寿命「effectively unbounded」 | 磁盘为 ephemeral（SDK ≥3.0 或自定义镜像为 64 GB NVMe）；跨 run 持久化需 **Snapshots** 或 **Drives**，按 GB-month 计费，**删除 Drive 才停止计费**，无自动 TTL | **固定 timeout**（非 idle），可 `sandbox.extendTimeout()` 延长 | 可 stop / extendTimeout；CLI 有 `vercel sandbox stop` | https://vercel.com/docs/sandbox ；https://vercel.com/docs/sandbox/pricing |
| **Daytona** | **auto-stop 默认 15 分钟闲置**（`0` = 关闭 auto-stop） | 未在官方文档中找到硬性最大运行时长 | **三级分钟级 interval**：auto-stop（默认 15 分钟）→ auto-archive（**停止后默认 7 天，`0` 表示取最大值 30 天**，仅容器沙箱）→ auto-delete（**默认不自动删除**；`0` = 停止后立即删除；`-1` = 关闭） | **闲置回收**，且三档全部**以分钟为单位配置** | 支持显式 delete（默认 fire-and-forget，可加 `wait`）；支持 SDK 运行时修改 interval；有 **Ephemeral 模式**（auto-delete = 0）。Spot GPU 被抢占销毁的沙箱**保留可查询 24 小时** | https://www.daytona.io/docs/en/sandboxes |
| **Cloudflare Containers / Sandbox** | `Container` 类 **`sleepAfter` 默认 10 分钟**无请求即 `stop()` | 未在官方文档中找到绝对上限 | **磁盘完全 ephemeral**：「All disk is ephemeral. When a Container instance goes to sleep, the next time it is started, it will have a fresh disk as defined by its container image.」持久化必须挂 R2/S3（Sandbox 支持把 S3 兼容对象存储挂成本地文件系统） | **闲置回收**（`sleepAfter` + `onActivityExpired()` 钩子，可覆写） | 可覆写 `onActivityExpired()` 决定是否 stop；可从 Durable Object 显式 start/stop | https://developers.cloudflare.com/containers/platform-details/ ；https://developers.cloudflare.com/sandbox/ |

### 大小上限（官方数据）

| 产品 | 内存 | 磁盘 | 备注 | URL |
|---|---|---|---|---|
| Anthropic code execution | **5 GiB RAM** | **5 GiB workspace** | 1 CPU；Python 3.11；**完全禁网**；单次 REPL cell 90 秒墙钟上限（programmatic tool calling）；bash 有 `output_file_too_large` 错误码但**未在官方文档中找到具体阈值** | https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool |
| OpenAI containers | `memory_limit`：**1g（默认）/ 4g / 16g / 64g**，创建后终身固定 | 未在官方文档中找到磁盘上限 | `network_policy` 支持 `disabled`（完全禁网）或域名 allowlist | 同上 OpenAI URL |
| E2B | 默认 **4 GiB**（1/2/4/8 可选），默认 **2 vCPU** | 存储 Hobby 10 GiB / Pro 20 GiB 免费 | 按秒计费 | https://e2b.dev/pricing |
| Vercel Sandbox | Hobby 8 GB / Pro 16 GB / Enterprise 64 GB | **64 GB ephemeral NVMe**（旧 runtimes 32 GB） | 每 vCPU 含 2 GB 内存；最多挂 4 个 Drive，默认 1 TiB | https://vercel.com/docs/sandbox/pricing |
| Daytona | 默认 1 GB，组织上限 8 GB | 默认 **3 GiB**，组织上限 10 GB | 默认 1 vCPU，上限 4 vCPU | https://www.daytona.io/docs/en/sandboxes |

---

## 关键发现：产物与容器的生命周期「分离」

这是最值得我们抄的一条，两家大厂**都做了分离**：

- **Anthropic**（原文）：
  > "Container data, including execution artifacts, uploaded files, and outputs, is retained for up to 30 days. This retention applies to all data processed within the container environment. **Files that code execution creates in the Files API (retrievable with `client.files.download()`) persist until explicitly deleted.**"

  即：容器内的东西有 30 天上限；被"导出"到 Files API 的产物则**脱离容器生命周期**，转为显式删除模型。产物捕获机制也很明确：每次 bash 调用有一个全新空目录 `$OUTPUT_DIR`，**只有写在该目录顶层的文件会被捕获成 `file_id` 返回**，写在别处的留在容器里不返回。

- **OpenAI**（原文）：
  > "**We highly recommend you treat containers as ephemeral and store all data related to the use of this tool on your own systems.** ... all data associated with the container will be discarded from our systems and not recoverable. **You should download any files you may need from the container while it is active.**"

  即：OpenAI 走的是另一个极端——**产物随容器一起在 20 分钟后彻底消失**，明确把持久化责任推给调用方。

**结论**：两条路都有大厂背书。区别在于「谁负责持久化」。我们自己既是平台方又是调用方，所以需要自己决定保留期。

---

## 关键发现：没有一家用对象存储的原生 lifecycle 做细粒度 TTL

我们的问题「GCS Object Lifecycle 的 `age` 条件最小 1 天」已从官方文档确认属实，且情况比想象更糟：

- `age` 条件「is satisfied when a resource reaches the specified age (**in days**)」；`age: 0` 的语义是「satisfied **at midnight UTC** after the object is created」——**连"立即删除"都做不到**，最坏要等近 24 小时。
- 更关键的一条：「**Changes to a bucket's lifecycle configuration can take up to 24 hours to go into effect**, and Object Lifecycle Management might still perform actions based on the old configuration during this time.」
- 来源：https://cloud.google.com/storage/docs/lifecycle

**业界怎么绕过这个问题**（这正是问题 4 的答案）：**全部自建分钟级过期字段，把平台 lifecycle 降级为兜底**。

| 产品 | 细粒度 TTL 的实现方式 | 粒度 |
|---|---|---|
| OpenAI | API 一等公民字段 `expires_after: { anchor: "last_active_at", minutes: N }`，服务端自行判定 | **分钟** |
| Daytona | `autoStopInterval` / `autoArchiveInterval` / `autoDeleteInterval` 三个字段，**全部以分钟为单位**，且支持运行时通过 SDK 修改（`setAutoDeleteInterval`） | **分钟** |
| Cloudflare | `sleepAfter = "10m"` 字符串时长 + `onActivityExpired()` 可编程钩子 | **分钟，且可编程** |
| E2B | `timeoutMs` / `timeout` 秒级，`setTimeout()` 可运行时收缩或延长 | **秒** |
| Modal | `timeout` + `idle_timeout` 参数 | **秒** |

没有任何一家说「我们用云存储的 lifecycle 规则删产物」。

---

## 推荐策略

### 1. 产物应该随沙箱销毁即消失，还是落独立存储？

**落独立存储 + 独立 TTL。** 理由：

- 我们的场景是「一次性执行」，沙箱寿命应该是**秒到分钟级**（Modal 默认 5 分钟、Vercel 默认 5 分钟是同类场景的锚点）。如果产物随沙箱死，用户**根本来不及下载 CSV/PNG**——这正是 OpenAI 要反复警告「download any files you may need **while it is active**」的原因，那是一个把摩擦转嫁给调用方的设计，对终端用户产品不合适。
- Anthropic 的设计更贴合我们：**沙箱短命，产物通过 `$OUTPUT_DIR` 捕获后转入独立文件存储**，两套生命周期。建议直接照抄「**只有写入约定输出目录顶层的文件才被捕获为产物**」这条规则——它同时解决了产物识别、防止误导出临时文件、和总量控制三个问题。

### 2. 保留期给多久？1 小时是激进还是保守？

**1 小时偏激进，但落在业界区间内，可以作为默认值；建议设计成可配置，并考虑放宽到 24 小时。**

对标锚点（全部为官方数据）：

- **最激进**：Cloudflare Containers——睡眠即空盘，**0 保留**；OpenAI——**20 分钟**闲置后数据不可恢复。
- **中间**：Daytona 停止后 **7 天**归档、Spot 抢占后 **24 小时**可查。
- **最保守**：Anthropic 容器数据 **30 天**；Files API 产物 / E2B 暂停沙箱 / Vercel Drive 均为**无限期，直到显式删除**。

所以 1 小时**比 OpenAI 的 20 分钟宽松，比其余所有都严格**。判断：

- 从**隐私/合规**角度，1 小时是很强的卖点，方向正确。
- 从**产品体验**角度，1 小时对「用户关掉页面、第二天回来想再下一次图」是致命的。没有任何一家主流产品的**产物**保留期短于 1 小时（OpenAI 的 20 分钟是**闲置**计时，每次访问都会刷新 `last_active_at`——即只要用户还在看，就不会过期）。
- **具体建议**：产物 TTL 采用 **anchor = `last_accessed_at`（而非 `created_at`）+ 1 小时**，完全对齐 OpenAI 的 `expires_after.anchor = last_active_at` 语义。这样「1 小时」承诺不变，但用户只要在用就不会被删，体验问题消失。如果不想做 last-access 刷新，则建议把固定 TTL 放宽到 **24 小时**。

### 3. 闲置回收 vs 固定 TTL，哪个更贴合一次性执行？

**分两层，不要统一。**

- **沙箱层：固定 TTL（hard timeout）+ 执行结束立即显式销毁。** 一次性执行没有"闲置"概念——代码要么在跑要么跑完了。Modal 的「默认最大寿命 5 分钟」和 Vercel 的「默认 timeout 5 分钟」都是固定 timeout 而非 idle，正是因为它们服务的也是批式/一次性负载。闲置回收在这里反而**有害**：Daytona 官方就警告，长时间 LLM 推理这类「进程在跑但没有外部交互」的任务**会被 auto-stop 误杀**，因为「the process itself doesn't count as activity」。我们的 Python 脚本正好是这一类。
- **产物层：闲置回收（idle / last-access anchored TTL）。** 产物的价值由「用户还在不在看」决定，这正是 idle 语义的适用面。OpenAI 唯一支持的 anchor 就是 `last_active_at`，不是 `created_at`。

### 4. TTL 粒度不够细，怎么办？

**照抄 OpenAI / Daytona：TTL 是我们自己数据库里的一个字段，不是云存储的配置。**

具体三层防御（这是竞品做法的直接推论，不是凭空发明）：

1. **权威层（应用层）**：产物记录带 `expires_at`（= `last_accessed_at + TTL`）。**所有读取路径先校验 `expires_at`，过期即拒绝下载并返回 410**——即使对象还在桶里，用户也拿不到。这是「1 小时」承诺的真正执行点，粒度可到秒。
2. **清理层（定时任务）**：每 5–15 分钟扫一次过期记录，真删对象。这对应 Daytona 的 auto-delete interval。
3. **兜底层（平台 lifecycle）**：GCS Object Lifecycle 设 `age: 1`（1 天）纯粹作为「定时任务挂了/记录丢了」的垃圾回收，**不承担 SLA**。注意其配置变更最多 24 小时生效，所以它天然只能是兜底。

另外两条可直接抄的实现细节：

- **签名 URL 的有效期必须 ≤ 剩余 TTL**，否则一个长期有效的下载链接会架空整个 TTL 设计。
- **禁网**方面 OpenAI 有现成的模型可参考：`network_policy` 要么 `{"type": "disabled"}`（完全禁网），要么域名 allowlist + 域名级 secret 注入。我们如果以后要放开受限网络访问，这是值得对标的接口形状。

---

## Caveats / 未查到的数据

明确标注「**未在官方文档中找到**」的项：

1. **OpenAI**：容器的**绝对最大存活时间**（只查到 20 分钟闲置过期与可自定义 `minutes`，没有硬上限说明）；容器**磁盘大小上限**；`expires_after.minutes` 的**默认值与允许范围**（文档只说明字段语义，未给默认/最大值——20 分钟是叙述文字给的，未在 schema 中确认为 `minutes` 默认值）。
2. **Anthropic**：**主动销毁容器的 API**（只找到「不传 container 参数就得到新容器」和「过期后不可复用」）；`output_file_too_large` 的**具体字节阈值**；「maximum execution time」的**具体数值**（文档只给了 programmatic tool calling 下每个 REPL cell 的 90 秒限制，以及计费最低 5 分钟，未给单次 invocation 的墙钟上限）；响应中 `container.expires_at` 的具体取值规则（文档只说它是「a shorter rolling value」且不反映 30 天上限）。
3. **Modal**：`idle_timeout` 的**默认值**（文档只说是可选参数，未给默认值，推测默认不启用但未确认）；**产物/文件的独立保留期**（Volumes 与 Snapshots 的保留策略未在本次抓取的 Sandboxes 页中出现）。
4. **Daytona**：**沙箱连续运行的硬上限**；auto-stop 的最大可设值。
5. **Cloudflare**：Containers 的**磁盘容量上限**与**绝对最大运行时长**；Sandbox 产品（区别于 Containers 平台）自身的默认 idle 值（本次只在 Containers platform-details 页确认了 `sleepAfter` 默认 10 分钟）。
6. **Vercel**：**Snapshots 与 Drives 是否有任何自动 TTL**（文档显示按 GB-month 计费、删除才停止计费，未提及自动过期）。
7. **未覆盖的产品**：Replit、Together Code Interpreter、Fly.io Machines——本次未抓取其官方文档，无任何结论。Fly.io 原计划纳入但未完成抓取。
8. 抓取到的 OpenAI 文档域名为 `developers.openai.com`（`platform.openai.com/docs/...` 301 重定向至此），API 参考页在 `developers.openai.com/api/reference/resources/containers`。`platform.openai.com/docs/api-reference/containers` 直接抓取返回 403。
9. Anthropic 文档域名为 `platform.claude.com`（`docs.anthropic.com` 重定向至此）。
10. 所有数据抓取于 **2026-09-15**，各家产品的默认值变更频繁，实施前建议复核关键数字（尤其 OpenAI 的 20 分钟与 Modal/Vercel 的 5 分钟默认值）。

---

## 源 URL 汇总

- OpenAI Code Interpreter 指南：https://developers.openai.com/api/docs/guides/tools-code-interpreter
- OpenAI Containers API 参考（`expires_after`）：https://developers.openai.com/api/reference/resources/containers/methods/create
- Anthropic code execution tool：https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- E2B Sandbox lifecycle：https://docs.e2b.dev/sandbox
- E2B Sandbox persistence：https://docs.e2b.dev/sandbox/persistence
- E2B pricing：https://e2b.dev/pricing
- Modal Sandboxes：https://modal.com/docs/guide/sandboxes
- Vercel Sandbox：https://vercel.com/docs/sandbox
- Vercel Sandbox pricing & limits：https://vercel.com/docs/sandbox/pricing
- Daytona Sandboxes：https://www.daytona.io/docs/en/sandboxes
- Cloudflare Containers platform details：https://developers.cloudflare.com/containers/platform-details/
- Cloudflare Sandbox：https://developers.cloudflare.com/sandbox/
- GCS Object Lifecycle Management：https://cloud.google.com/storage/docs/lifecycle
