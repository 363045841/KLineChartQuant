# 实测记录：fly.io Machines 沙箱可行性探针

- **日期**：2026-09-15
- **执行者**：Claude Opus 5，主会话直接执行（非子代理）
- **环境**：flyctl v0.4.69 darwin/arm64，账号 `omichiliriku@gmail.com`
- **探针 app**：`kq-sandbox-probe`，org `personal`（**刻意避开 `nebutra` 生产 org**）
- **镜像**：`python:3.13-slim`（探针用；正式运行时镜像为 `python-data-analysis-v1` = Python 3.14 + numpy + pandas）
- **规格**：`--vm-cpus 1 --vm-memory 1024 --restart no`
- **清理**：所有 Machine 与 app 已于测试结束时销毁，无残留资源

本文件记录的是**实际跑出来的结果**，不是文档推断。与 `fly-machines-api.md`（纯文档调研）互为补充：凡两者冲突，以本文件为准。

---

## 1. 结论速览

| 项目 | 实测结果 | 官方文档是否有载 |
|---|---|---|
| 默认出站网络 | **完全开放**，直连 `https://pypi.org/simple/` 返回 200 | 有（但表述易误读，见 §2） |
| `unshare -n` 后出站 | **完全阻断**，接口仅剩 `lo` | 无 |
| exec stdout 上限 | **10 MiB 硬限（JSON 编码后）**；raw 2 MiB 通过，3 MiB 失败 | **无** |
| `--file-local` 输入上限 | **512 KiB 通过，768 KiB 失败** | **无** |
| 冷启动 | 镜像已 prepared 后 **3.454s**；首次含拉镜像约 21s | 部分有（"low double digit seconds"） |
| 1 vCPU / 1 GiB | 合法可用 | 有 |

---

## 2. 默认出站：平台侧不提供禁网

```
python3 -c "urllib.request.urlopen('https://pypi.org/simple/', timeout=8)"
→ EGRESS_OPEN 200
```

**证实了文档调研的结论**：fly 官方那句 "Machines are closed to the public internet by default" 讲的是**入站**。出站默认完全开放。`fly.MachineConfig` 中不存在任何 egress / firewall 字段。

> 这意味着 PRD R3「网络完全禁用」在 fly 上**无法由平台保证**。

## 3. `unshare -n` 空 netns：有效

```
unshare -n python3 -c "urllib.request.urlopen('https://pypi.org/simple/', timeout=8)"
→ EGRESS_BLOCKED URLError
```

进一步验证隔离范围：

```
unshare -n python3 -c "socket.if_nameindex() / connect()"
→ ifaces: ['lo']
→ fdaa:c3:5dae:a7b:2b4:2978:ec4a:2 (自身 6PN 地址) blocked OSError
→ 172.19.0.1 (网关)                blocked OSError
→ 8.8.8.8:53                       blocked OSError
→ uid: 0   fly_api_sock: True
```

公网、fly 6PN 私有网络、默认网关三个方向全部阻断，接口只剩回环。**方案有效**。

### 3.1 未排除的残留面：`/.fly/api`

`unshare -n` 之后 `/.fly/api` 这个 **Unix domain socket 仍然存在**，且进程 **uid=0**。Unix socket 不经过网络协议栈，**不受 network namespace 管辖**——这是 netns 方案的固有盲区，性质上等同于 Cloud Run Jobs 的 metadata server 提权面。

尝试通过该 socket 访问 Machines API：

```
unshare -n → connect("/.fly/api") 成功 → 发送 HTTP 请求 → TimeoutError
```

**但对照组（不加 `unshare -n`）发出完全相同的请求，同样 TimeoutError。**

> **因此该测试无法证明任何事。** 超时的原因可能是请求格式不对或缺少认证，而非隔离生效。本文件不声称 `/.fly/api` 已被封堵。

**处置方案**（不依赖 netns）：
1. 沙箱进程启动前 unmount 或删除 `/.fly/api`；
2. 降权到非 root 运行；
3. drop 所有 capabilities。

即：把它当作**确实存在的攻击面**来处理，而不是当作已被 netns 挡住。

## 4. exec 通道输出上限

逐级加压（`sys.stdout.write('x' * N)`，统计实际收到字节数）：

| 请求大小 | 实收 | 结果 |
|---|---|---|
| 64 KiB | 65536 B | OK |
| 256 KiB | 262144 B | OK |
| 1024 KiB | 1048576 B | OK |
| 1536 KiB | 1572864 B | OK |
| **2048 KiB** | **2097152 B** | **OK（实测可靠上限）** |
| 3072 KiB | 0 | **失败** |
| 4096 KiB | 0 | 失败 |

失败时 fly 返回的原文：

```
Error: could not exec command on machine ...: failed to exec on VM ...:
exec output exceeds the maximum allowed response size after JSON encoding
(10485760 byte limit)
```

**硬限 10 MiB，按 JSON 编码后计算。** raw 3 MiB 即触顶，推算编码膨胀约 **3.3×**（推测为 base64 + JSON 转义 + stdout/stderr 双份等叠加，未进一步拆解）。

> 该数字**未在 fly 官方文档中出现**，仅能由错误信息实测获得。

## 5. `--file-local`（`config.files[].raw_value`）输入上限

| 请求大小 | 结果 |
|---|---|
| 256 KiB | OK |
| **512 KiB** | **OK（实测可靠上限）** |
| 768 KiB | 失败 |
| 1024 KiB | 失败 |
| 4096 KiB | 失败 |

失败原文：

```
Error: could not launch machine: failed to launch VM: http: request body too large
```

> 该限制同样**未在官方文档中出现**。

## 6. 冷启动

Machine 日志原文：

```
Machine created and started in 3.454s
```

flyctl 客户端侧端到端（含首次镜像搜索与准备）约 **21s**。二者差异说明：**镜像 prepared 之后的真实启动只要约 3.5 秒**，60 秒预算下可接受；但**首次拉镜像不可进入请求路径**，必须靠 warm pool 预热。

另注：日志显示 `Preparing to run: 'python3' as root` —— 默认以 **root** 运行，须显式降权。

---

## 7. 对 PRD / design 的直接影响

1. **R3「网络完全禁用」**：fly 侧只能由镜像内 `unshare -n` + 非 root + drop caps 达成，**可信基是我们的 runner 而非平台**。交付说明必须写明这一点，不得表述为「平台保证禁网」。
2. **20 MiB 进出指标不可达**：输入实际约 512 KiB，输出实际约 2 MiB，差 40× / 10×。且禁网堵死对象存储回传，两条约束耦合 → 采用分级传输（小文件 exec，大文件挂载）。
3. **warm pool 是必需品而非优化项**：首次拉镜像 21s 会吃掉 1/3 超时预算。
4. **`/.fly/api` 必须显式处置**，不能依赖 netns。

## 8. 第二轮探针（Phase 0 / P0.2 + P0.3）

**日期**：2026-09-15 | **探针 app**：`kq-ci-probe-p0`（personal org，已销毁）
**环境**：numpy 2.5.3 / pandas 3.0.5 / matplotlib 3.11.2，`unshare` `capsh` `setpriv` 均可用

### 8.1 P0.2 隔离序列下 numpy/pandas 正常 ✅

完整序列：`umount /.fly/api` → `unshare -n` → `setpriv --reuid=1001 --regid=1001 --clear-groups --inh-caps=-all --bounding-set=-all`

| 指标 | 基线（root，无隔离） | 完整隔离后 | 一致 |
|---|---|---|---|
| uid | 0 | **1001** | — |
| 网络接口 | `lo, dummy0, eth0, teql0` | **`lo`** | — |
| pandas `df["b"].sum()` | -45.2567 | **-45.2567** | ✅ 逐位一致 |
| numpy `det(eye(3)*2)` | 7.999999999999998 | **7.999999999999998** | ✅ 逐位一致 |
| matplotlib PNG | 6310 B | **6310 B** | ✅ 完全相同 |
| 出站 | `EGRESS_OPEN` | **`EGRESS_BLOCKED`** | — |

**结论：隔离不影响数值计算与绘图。** design.md §5.1 的序列可直接采用。

**副带发现（实现必需）**：
1. matplotlib 降权后报 `/.config/matplotlib is not a writable directory`，退回临时目录并拖慢导入 → **必须显式设 `MPLCONFIGDIR`** 指向沙箱内可写目录。
2. 输出目录必须**专属且属主为沙箱用户**。首次尝试写 root 创建的 `/tmp/out.png` 直接 `PermissionError`。这从另一面印证了 §6.2 `$OUTPUT_DIR` 约定的必要性。

### 8.2 P0.3 stderr 与 stdout **共享**同一 10 MiB 预算 ✅（共享已确认）

| stdout | stderr | 合计(raw) | 结果 |
|---|---|---|---|
| 1024 KiB | 1024 KiB | **2 MiB** | **OK** |
| 1280 KiB | 1280 KiB | 2.5 MiB | 失败 |
| 1536 KiB | 1536 KiB | 3 MiB | 失败（同单独 stdout 3 MiB 的阈值） |

失败信息与单流一致：`exceeds the maximum allowed response size after JSON encoding (10485760 byte limit)`。

**两个结论**：

1. **issue 原文的「stdout/stderr 截断 1 MiB」恰好落在安全线上**（各 1 MiB = 合计 2 MiB，通过），该指标**无需修改**。
2. **产物不能与 stdout/stderr 共用同一次 exec 响应**。raw 合计 2.5 MiB 即耗尽 10 MiB 编码预算，stdout/stderr 占满 2 MiB 后已无空间承载产物 → 产物**必须走独立通道**（独立 exec 调用或 mount）。

### 8.3 exec 有客户端超时

`flyctl machine exec` 默认超时较短，长耗时命令直接 `deadline_exceeded`（实测 apt+pip 安装触发）。需显式 `--timeout`。对应到实现：Machines API 的 exec 调用须显式设置超时，且该超时要与沙箱软超时协调。

## 9. 仍未测项

- [ ] 正式运行时镜像 `python-data-analysis-v1`（Python 3.14）的拉取耗时与 prepared 后启动耗时
- [ ] Machines API per-action per-app **1 req/s（突发 3）** 限流的并发实际表现（文档调研得出，未实测）
- [ ] volume 挂载通道的大小上限与挂载耗时（分级策略的大文件路径）

---

## 10. 第三轮实测（Phase 4 / AC4）：FlyMachinesProvider 端到端

**日期**：2026-09-15 | **探针 app**：`kq-ci-live`（personal org，**测试结束已销毁**）
**镜像**：`registry.fly.io/kq-ci-live:python-data-analysis-v1`（`python:3.14-slim` + numpy/pandas/matplotlib/openpyxl + util-linux，107 MB），
经 fly 远程构建器 `flyctl deploy --remote-only --build-only --push` 构建，本地 Docker 未参与。
**驱动方**：`FlyMachinesProvider` + `CodeInterpreterService` 的**真实代码**（`dist/` 构建产物），非脚本模拟。
**区域**：`nrt`；规格 1 shared vCPU / 1024 MiB / `restart.policy=no` / `auto_destroy=true`。

### 10.1 AC4 主链路：CSV 输入 → stdout + PNG 产物 + 禁网断言 ✅

请求：`files=[prices.csv]`（5 行行情），`policy={network:'disabled',packages:'base'}`，`timeoutMs=60000`。

实际 stdout（原文照录）：

```
uid 1001
ifaces ['lo']
fly_api_exists False
EGRESS_BLOCKED URLError
mean_AAA 11.0
mean_BBB 9.0
numpy_det 7.999999999999998
done
```

stderr 为空，`exitCode=0`，`status=succeeded`。

| 断言 | 结果 |
|---|---|
| 降权生效 | `uid 1001`（非 root） |
| netns 生效 | 接口仅 `lo` |
| `/.fly/api` 已移除 | `fly_api_exists False` |
| **禁网生效** | `urlopen("https://pypi.org/simple/")` → **`EGRESS_BLOCKED URLError`** |
| pandas 计算 | `groupby.mean` = 11.0 / 9.0，正确 |
| numpy 计算 | `det(eye(3)*2)` = 7.999999999999998，与 §8.1 基线逐位一致 |

产物（各走**独立 exec 调用**，不与日志共用同一次响应）：

| 产物 | mime | sizeBytes | 解码后字节 | 校验 |
|---|---|---|---|---|
| `chart.png` | `image/png` | **6973** | 6973 | PNG magic `89504e470d0a1a0a` ✅ |
| `summary.csv` | `text/csv` | 30 | 30 | 内容 `symbol,close / AAA,11.0 / BBB,9.0` ✅ |

**耗时**：`usage.durationMs = 29952`；从 submit 到状态首次变 `running`（= 创建 Machine + 拉镜像 + 等 started）**18567 ms**。
即冷启动（首次拉本镜像）约 **18.6 s**，其后的隔离序列 + Python 导入 + 计算 + 绘图 + 取产物合计约 **11.4 s**。

### 10.2 错误 / 超时 / 取消三条路径（真实 fly 上复测）

| 路径 | 提交 | 结果 |
|---|---|---|
| 错误 | `raise ValueError("boom")` | `status=failed`，`exitCode=1`，stderr 含完整 traceback ✅ |
| 超时 | `time.sleep(300)`，`timeoutMs=15000` | `status=timed_out`，`exitCode=137` ✅ |
| 取消 | `time.sleep(300)`，12 s 后 `cancel()` | `status=cancelled`，`exitCode=137` ✅ |

**注意**：超时与取消的 `exitCode` 完全一样（均为占位 137），终态全靠**控制面记录的意图**区分——
这正是 design.md §3.1 所说的「fly 侧两者外观一致」，实测再次确认。

### 10.3 实测暴露的一个真实缺口：软超时看门狗在 fly 上够不着

> **状态：已修复并复测通过（2026-09-16，见 §11）。** 采用下文修法 2（软超时改为 exec 时刻按剩余预算下发）。
> 以下为缺陷的原始记录，保留不改。

沙箱内软超时（退出码 `124`）由 `runner.py` 的 `threading.Timer` 在 **Python 进程启动时**起算，
而控制面硬超时从 **submit** 起算。fly 冷启动要吃掉约 18 s，于是：

- `timeoutMs=15000` 时，Machine 还没起来硬超时就已触发 → 走 `kill` 路径，`exitCode=137`；
- `timeoutMs=60000` 时，软超时点为「Python 启动 +55 s」≈ submit +73 s，仍晚于硬超时 60 s。

**结论：在当前（无 warm pool 的）形态下，fly 上的软超时 `124` 路径实际不可达，超时一律由控制面硬超时兜底。**
功能正确（终态仍是 `timed_out`），但「沙箱自行优雅收尾」的设计意图没有生效。

两条可选修法（本次未做，留给后续决策）：

1. warm pool —— 冷启动移出请求路径，软/硬超时的时间基准自然对齐；
2. 软超时改为由控制面在 exec 发起时刻按**剩余预算**下发，而不是在 submit 时按总预算固化。

在此之前，交付说明不应宣称「沙箱内软超时已在 fly 上生效」。

### 10.4 清理

Machine 由 `auto_destroy` + 控制面显式 `DELETE ?force=true` 双重回收；测试结束 `flyctl machines list` 返回
`No machines are available on this app`，随后 `flyctl apps destroy kq-ci-live` 已执行。
`nebutra-*` 生产 app 全程未被触碰。所用 token 为 2 小时过期的 app 级 deploy token，随 app 一并失效，未入库。

---

## 11. 第四轮实测（2026-09-16）：软超时 `124` 路径修复验证

**目的**：验证 §10.3 缺陷的修复——软超时不再在 machine create 时刻固化，改为 exec 时刻按剩余预算下发。
**探针 app**：`kq-ci-soft`（personal org，**测试结束已销毁**）
**镜像**：`registry.fly.io/kq-ci-soft:python-data-analysis-v1`（107 MB），fly 远程构建器构建。
构建用的是与 `runtime-images/python-data-analysis-v1/Dockerfile` **等价**的临时 Dockerfile
（`python:3.14-slim` + util-linux/coreutils + numpy/pandas/matplotlib/openpyxl + uid 1001 的 `sandbox` 用户），
差异仅在 `useradd` 是否建 home——`$HOME` 由 entrypoint 指到 `/work/home`，与镜像内 home 无关。
**驱动方**：`FlyMachinesProvider` + `CodeInterpreterService` 的**真实 `dist/` 构建产物**。
**区域**：`nrt`；1 shared vCPU / 1024 MiB。

### 11.1 软超时路径：退出码确为 `124`（不再是 137）✅

提交：`print("start"); time.sleep(300)`，`timeoutMs=60000`。

```json
{
  "elapsedMs": 58654,
  "status": "timed_out",
  "exitCode": 124,
  "stdout": "start\n",
  "stderr": "[sandbox] soft timeout reached\n",
  "usage": { "durationMs": 58337 }
}
```

| 断言 | §10.2 修复前 | 本轮修复后 |
|---|---|---|
| `exitCode` | `137`（控制面 SIGKILL 兜底） | **`124`**（沙箱内看门狗） |
| `stderr` | 空 | `[sandbox] soft timeout reached` |
| `stdout` | 丢失 | **`start` 保留**（沙箱优雅收尾，日志得以回传） |
| `status` | `timed_out` | `timed_out`（不变） |

这正是设计意图的落地：超时不再只靠控制面强杀，沙箱先自己收尾，**超时前已产生的 stdout 不再丢失**。

### 11.2 成功路径未回归 ✅

提交：numpy 行列式 + 写 `$OUTPUT_DIR/o.csv`，`timeoutMs=60000`。

```json
{ "elapsedMs": 16568, "status": "succeeded", "exitCode": 0,
  "stdout": "ok 7.999999999999998\n", "stderr": "", "usage": { "durationMs": 16484 } }
```

`det(eye(3)*2)` = 7.999999999999998，与 §8.1 / §10.1 基线逐位一致。

### 11.3 清理

`flyctl machines list -a kq-ci-soft` → `No machines are available on this app`；
随后 `flyctl apps destroy kq-ci-soft` 已执行，`kq-ci-*` 残留为 0。
`nebutra-*` 生产 app 全程未被触碰。token 为 2 小时过期的 app 级 deploy token，随 app 一并失效，未入库、未打印。
