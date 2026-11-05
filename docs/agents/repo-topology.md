# 仓库拓扑：私有开发仓 + 公开 PR 桥

本仓库不是上游的直接 fork，而是「私有主仓 + 公开桥」两段式结构。原因见
[GitHub Forks 文档](https://docs.github.com/en/pull-requests/reference/forks#visibility-of-forks)：
公开仓库的 fork 必须是公开的，而私有化必须先脱离 fork 网络且**不可逆**。因此保留公开 fork
承担「提 PR」这一件事，私有内容一律不进公开面。

## 三个 remote

| remote | 指向 | 用途 | 可见性 |
|---|---|---|---|
| `origin` | `EliteOtaku/KCQ-NexusAI-private` | 日常开发、提交、推送 | 私有 |
| `pr` | `EliteOtaku/KCQ-NexusAI`（上游的公开 fork） | 只承载「准备提上游 PR」的分支 | 公开 |
| `upstream` | `363045841/KLineChartQuant` | 读上游、同步基线；禁止直推 | 公开 |

`upstream` 的 push URL 被设为哨兵值 `DISABLE_PUSH_TO_UPSTREAM`，直推会失败，这是有意的。

## 三分法：什么放哪里

| 内容 | 归属 | 判定标准 |
|---|---|---|
| 通用能力：图表引擎、指标基建、渲染器、性能、类型契约 | 私有仓开发 → 可选推 `pr` → 提上游 PR | 上游很可能也想要，留在 fork 只会累积同步冲突 |
| 通用但上游明确不要：外部指标/工具装载点等被关掉或被挂起的提案 | 只留私有仓 | 已有 #266、#272 被关、#273 挂起的先例，不重复提 |
| 交易策略、期权链数据语义、私有行情源、账号与凭据 | **只在私有仓** | 泄露风险 + 每次同步上游都要解冲突 |

## 往公开面推之前

推到 `pr` 等于公开：fork 网络里任何仓库的 commit 都能被同网络其他仓库读到（GitHub 官方
安全说明），**撤回提交不能撤销已公开的事实**。因此推送前逐条确认：

1. 该分支只含上表第一行的内容；
2. `git log pr/main..HEAD --oneline` 逐条看过，没有顺带带上的私有提交；
3. 变更里没有硬编码的账号、接口地址、密钥、策略参数；
4. 分支基于 `upstream/main` 最新提交，而不是基于 `nexus/main`（后者含私有历史）。

## 提上游 PR 的固定流程

```bash
# 1. 从上游基线拉分支，避免把私有历史带进公开面
git fetch upstream
git switch -c fix/xxx upstream/main

# 2. 提交、验证（type-check + 受影响包的测试）
pnpm type-check:src

# 3. 只把这一个分支推到公开桥
git push pr fix/xxx

# 4. 开 PR（head 指向公开桥的分支）
gh pr create --repo 363045841/KLineChartQuant \
  --base main --head EliteOtaku:fix/xxx --title "..." --body-file <file>
```

**提交上游 PR 前，必须在 `upstream/main` 基线上跑一次 `pnpm type-check:src`。** 只在本仓
工作区自我验证不够——#353 就是这样失败的：它引用了只存在于私有仓的扩展缝，本地通过、
上游 CI 六条 `TS2724/TS2335` 全红。

## 同步上游

```bash
git fetch upstream
git switch nexus/main
git merge --no-ff upstream/main      # 冲突逐个按「保留哪边」记录理由
pnpm type-check:src
# 冲突多的文件说明私有仓改动侵入过深，是重构信号而不是例行工作
```

## 误推公开面的处置

按严重程度依次做，且要接受「已公开」这个事实：

1. 立刻删除公开桥上的那个分支：`git push pr --delete <branch>`；
2. 若已开 PR，关闭并删除分支引用；
3. 检查是否含凭据，含则轮换凭据（删分支不等于没人拉过）；
4. 在私有仓记录一次事故原因，并补一条「推送前检查」的自动化，例如
   `git log pr/main..HEAD --oneline` 加敏感词扫描。
