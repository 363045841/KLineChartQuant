# 发版流程指南

本文档说明如何发布 `@363045841yyt/klinechart-core` 和 `@363045841yyt/klinechart` 的新版本。

## 概述

项目使用 GitHub Actions 自动发布流程：
- 推送版本 tag → 触发 workflow → 自动构建 → 发布到 npm → 创建 GitHub Release

## 前置条件

1. **确保代码已合并到 main 分支**
   - 所有功能代码已合并
   - CI 测试通过

2. **检查 npm 权限**
   - 确保 GitHub 仓库已配置 `NPM_TOKEN` secret
   - 该 token 需要有 npm 包的发布权限

## 发版步骤

### 1. 更新版本号

需要更新以下文件中的版本号：

```bash
# packages/core/package.json
# packages/vue/package.json
# packages/core/src/version.ts
```

例如，从 `0.7.5-alpha.2` 更新到 `0.7.5`：

```json
// packages/core/package.json
{
  "version": "0.7.5"
}

// packages/vue/package.json
{
  "version": "0.7.5"
}
```

```typescript
// packages/core/src/version.ts
export const VERSION = "0.7.5"
```

### 2. 编写 Release 日志（可选）

发布前可用 `update-version` skill（或手动）生成 `docs/release/<tag>.md`（如 `docs/release/v0.7.5.md`），作为 GitHub Release 的日志内容。若未提供，CI 将回退为自动生成。

### 3. 提交版本更新

```bash
git add packages/core/package.json packages/vue/package.json packages/core/src/version.ts docs/release/v0.7.5.md
git commit -m "chore(release): v0.7.5"
```

### 4. 创建并推送 Tag

```bash
# 创建 tag
git tag v0.7.5

# 推送 tag 到 GitHub（触发发布流程）
git push github v0.7.5
```

> **注意**：本项目 remote 名为 `github`，不是默认的 `origin`

## CI/CD 流程说明

推送 tag 后，`.github/workflows/release.yml` 会自动执行以下步骤：

### 阶段 1: 环境准备
- 检出代码（包含完整 git 历史）
- 设置 pnpm 和 Node.js 环境
- 安装依赖

### 阶段 2: 构建
```bash
pnpm --filter @363045841yyt/klinechart-core --filter @363045841yyt/klinechart build
```

### 阶段 3: 发布到 npm

**Core 包发布：**
```bash
cd packages/core
npm publish --provenance --access public
```

**Vue 包发布：**
```bash
cd packages/vue
# 将 workspace:^ 替换为 ^（发布时移除 workspace 协议）
sed -i 's/workspace:^/^/g' package.json
npm publish --provenance --access public
```

> 发布需要 `NPM_TOKEN` secret 已配置

### 阶段 4: 生成 Release Notes

优先使用仓库内的 `docs/release/<tag>.md`（与 tag 同 commit 提交）。若该文件不存在，脚本会自动分析 git log，按以下分类整理提交：

| 分类 | 匹配规则 |
|------|----------|
| 🚀 Performance | 提交以 `perf` 开头 |
| ✨ Features | 提交以 `feat` 开头 |
| 🐛 Fixes | 提交以 `fix` 开头 |
| 🏗️ Architecture | 包含架构关键词（renderer, plugin, overlay 等）的 refactor 或其他提交 |
| 🔧 Improvements | 其他所有提交 |

### 阶段 5: 创建 GitHub Release

- 如果 release 已存在则更新
- 否则创建新的 release
- 使用生成的 release notes

## 版本号规范

本项目使用 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

- **MAJOR**: 不兼容的 API 修改（如 0.7.x → 1.0.0）
- **MINOR**: 向下兼容的功能新增（如 0.7.5 → 0.8.0）
- **PATCH**: 向下兼容的问题修复（如 0.7.5 → 0.7.6）

### 预发布版本

如需发布 alpha/beta 版本：

```json
{
  "version": "0.8.0-alpha.1"
}
```

## 验证发布

发布后检查以下事项：

1. **GitHub Actions 状态**
   - 访问 https://github.com/363045841/KLineChartQuant/actions
   - 确认 workflow 运行成功

2. **npm 包版本**
   - https://www.npmjs.com/package/@363045841yyt/klinechart-core
   - https://www.npmjs.com/package/@363045841yyt/klinechart

3. **GitHub Release**
   - https://github.com/363045841/KLineChartQuant/releases

## 故障排查

### Workflow 失败

**缺少 NPM_TOKEN：**
```
❌ 错误：缺少 NPM_TOKEN secret
```
解决：在 GitHub 仓库 Settings → Secrets → Actions 中添加 `NPM_TOKEN`

**包名已存在：**
```
npm ERR! 403 Forbidden
```
解决：检查版本号是否已发布，不能重复发布同一版本

**构建失败：**
检查构建日志，确保 TypeScript 编译通过

### 本地修复后重新发布

如果 workflow 失败需要重新发布：

1. 修复问题
2. 删除本地和远程 tag：
   ```bash
   git tag -d v0.7.5
   git push github --delete v0.7.5
   ```
3. 重新创建并推送 tag

## 相关文件

- `.github/workflows/release.yml` - 发布 workflow 配置
- `packages/core/package.json` - Core 包配置
- `packages/vue/package.json` - Vue 包配置
- `packages/core/src/version.ts` - 版本常量（运行时可用）
