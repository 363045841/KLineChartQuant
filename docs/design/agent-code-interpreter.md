# Agent 工具：代码解释器（解耦 Provider）

## 背景

为 Agent 增加一个 `code_interpreter` 工具，调用 Provider 无关的 Python 沙箱执行 Agent 生成的代码。首版运行时仅支持 `Python + numpy + pandas`，代码来源仅限 Agent 生成，运行网络完全禁用。

## 架构

```text
Agent
  └─ CodeInterpreterService
       └─ RuntimeProvider 接口
            ├─ CloudRunProvider（首版）
            ├─ LocalProvider（开发/测试）
            └─ 其他可扩展
```

## 接口

```ts
interface CodeInterpreter {
  submit(request: ExecutionRequest): Promise<ExecutionTask>;
  get(taskId: string): Promise<ExecutionResult>;
  cancel(taskId: string): Promise<void>;
}

interface ExecutionRequest {
  language: "python";
  code: string;
  files?: InputFile[];
  limits?: {
    timeoutMs?: number;   // 默认 60000，上限 60000
    memoryMb?: number;   // 默认 1024
  };
  policy?: {
    network: "disabled";
    packages: "base";
  };
}

interface ExecutionResult {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
  stdout: string;
  stderr: string;
  exitCode?: number;
  artifacts: Artifact[];
  usage?: {
    durationMs: number;
    memoryMb?: number;
  };
}
```

## 运行时

- `python-data-analysis-v1`：Python 3.12 + numpy + pandas，预构建镜像，不允许 `pip install`。
- 资源默认：1 vCPU / 1 GiB / 超时 60 秒。
- 文件：CSV/XLSX 输入，CSV/PNG 输出。
- 输入 ≤ 20 MiB，产物 ≤ 20 MiB，stdout/stderr 截断 1 MiB。
- 任务完成后 1 小时自动删除输入与产物。

## 首版 Provider

Google Cloud Run：

- 部署预构建容器，内部 `/execute` API。
- 鉴权用 Service Account OIDC Token。
- VPC SC + 出向规则全 deny。
- 输入/产物走 `gs://<bucket>/tasks/<taskId>/` 预签名 URL。
- 日志仅留脱敏任务元数据。

## 验收

1. 工具注册到 `ChartToolRegistry`，`@Tool` 装饰器标注 `safety: 'destructive'`。
2. `submit / get / cancel` 三个调用在 `localProvider` 单测中覆盖成功、错误、超时、取消。
3. Agent 集成测试：CSV 输入，断言 stdout 与 PNG 产物。

## LocalProvider 的 Linux 隔离（issue #193）

`unshare -n` 单独使用需要 CAP_SYS_ADMIN，非 root 必然 EPERM，Linux 上 LocalProvider 会一启动就失败；
macOS / Windows 因本就不隔离反而正常，同一个 Provider 的语义不一致。

现约定：

- Linux 优先用 `unshare -rn`：在 user namespace 内建空 netns，非 root 可用。
- 启动前实跑一次 `unshare -rn -- true` 探测能力；失败（内核或 AppArmor 拒绝非特权 userns）
  时退化为直接运行并告警一次，与 macOS / Windows 语义一致。
- 隔离只看探测结果，不看 `unshare` 文件是否存在——存在不等于可用。
