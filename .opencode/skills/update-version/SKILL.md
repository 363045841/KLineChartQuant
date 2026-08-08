---
name: update-version
description: 升级组件库发布包版本
---

1. 需要且只要更新以下文件中的版本:
@packages\core\package.json
@packages\desktop-electron\package.json
@packages\core\src\version.ts
@packages\vue\package.json

版本格式eg:
0.9.0-alpha.1 // alpha
0.9.0 // 正式版本

2. 使用git tag打上版本标签, 版本要带上 v,以触发 @.github\workflows\release.yml 发布npm包
3. 一次性读取当前版本tag到上一个tag之间的提交信息，编写release日志，输出到 `docs/release/<当前tag>.md`（如 `docs/release/v0.9.4.md`），并将该文件与版本变更一起提交，确保 tag 指向的 commit 已包含该文件（否则 release 工作流将回退为自动生成），格式如下，要有中英对照:

## 相比 [上个tag] 的变更 / Changes since [上个tag]

### ✨ 新功能 / Features
- **标题**: xxx
- **title**: xxx
### 🐛 Bug 修复 / Fixes

### 🏗️ 架构与重构 / Architecture & Refactoring

### 📚 文档 / Documentation

其中，不包含的项目可以不填。
