---
name: update-version
description: 升级组件库发布包版本
---

1. 需要且只要更新以下文件中的版本:
@packages\core\package.json
@packages\agent-runtime\package.json
@packages\desktop-electron\package.json
@packages\core\src\version.ts
@packages\vue\package.json

版本格式eg:
0.9.0-alpha.1 // alpha
0.9.0 // 正式版本

2. 使用git tag打上版本标签, 版本要带上 v,以触发 @.github\workflows\release.yml 发布npm包
3. 一次性读取上一个发布 tag 到当前待发布提交之间的提交信息，编写 release 日志，输出到 `docs/release/<当前tag>.md`（如 `docs/release/v0.9.4.md`），并将该文件与版本变更一起提交，确保 tag 指向的 commit 已包含该文件（否则 release 工作流将回退为自动生成）。日志必须遵守以下规范：

- **破坏性变更独立置顶**：存在破坏性变更时，在各语言正文的常规分类前添加 `⚠️ Breaking Changes & Migration` 专节；禁止仅在普通条目里标注“（破坏性）”。每条说明受影响的用户或配置、旧行为到新行为的变化，以及可执行的迁移步骤；涉及 API、配置项或环境版本时写出准确名称与版本。普通分类不重复展开同一条变更。
- **双语按全文分区**：默认先展示完整中文正文，再用 `<details>` 折叠完整 English 正文，禁止逐条中英交错。若目标发布平台不支持折叠，改用中文、English 两个独立大节。两种语言的变更、迁移说明和追溯链接必须一致。
- **逐条附追溯链接**：查询该提交区间关联的 PR / issue，为每条变更（含迁移条目）附上已核实的 Markdown 链接，如 `[#123](<PR URL>)`、`[#456](<issue URL>)`。编号及 URL 必须来自实际仓库记录，不得猜测或编造；没有关联 PR / issue 时使用对应的 `[短 SHA](<commit URL>)`。一条合并了多项变更时，保留各项必要的来源链接。仓库 URL 从 Git remote 获取。
- **精简分类**：只保留有实际内容的分类；没有破坏性变更时省略迁移专节。模板中的占位内容必须替换为本次发布的事实，不得把示例当作实际变更。

格式模板（分类按实际内容增删）：

```markdown
## 相比 <上个tag> 的变更

### ⚠️ Breaking Changes & Migration

- **<变更标题>**：<受影响的用户或配置；旧行为 → 新行为>。迁移：<具体操作>。([#<编号>](<已核实的 PR 或 issue URL>))

### ✨ 新功能

- **<标题>**：<用户可感知的变化>。([#<编号>](<已核实的 PR 或 issue URL>))

### 🐛 Bug 修复

- **<标题>**：<触发场景和修复后的行为>。([<短 SHA>](<已核实的 commit URL>))

### 🏗️ 架构与重构

### ⚡ 性能

### 📚 文档

<details>
<summary>English</summary>

## Changes since <previous tag>

### ⚠️ Breaking Changes & Migration

- **<Title>**: <Affected users or configuration; old → new behavior>. Migration: <concrete steps>. ([#<number>](<verified PR or issue URL>))

### ✨ Features

- **<Title>**: <User-visible change>. ([#<number>](<verified PR or issue URL>))

### 🐛 Fixes

- **<Title>**: <Trigger and corrected behavior>. ([<short SHA>](<verified commit URL>))

### 🏗️ Architecture & Refactoring

### ⚡ Performance

### 📚 Documentation

</details>
```

4. 提交版本变更与日志前，核对：破坏性变更已独立置顶且迁移步骤可执行；中英文内容一致且没有逐条混排；每条变更都有可核实的 PR / issue 或 commit 链接；空分类与模板占位内容已删除。
