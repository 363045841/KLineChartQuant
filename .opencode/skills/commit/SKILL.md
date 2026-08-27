---
name: commit-message-generator
description: 生成遵循 Conventional Commits 规范的提交信息
---

# 提交信息生成器

## 流程

1. 查看 `git diff` 与 `git status`，弄清改动范围、类型与原因
2. 按改动性质选类型
3. 写标题（type(scope): 描述）
4. 复杂改动补正文
5. 破坏性改动 / 关联 issue 补脚注

## 类型

| 类型 | 适用 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 仅文档 |
| `style` | 格式、分号等，不影响逻辑 |
| `refactor` | 重构，非修 bug 非加功能 |
| `perf` | 性能优化 |
| `test` | 增改测试 |
| `build` | 构建系统或依赖 |
| `ci` | CI 配置 |
| `chore` | 其他不涉及 src/test 的改动 |
| `revert` | 回滚 |

`scope` 可选：模块/组件名，如 `feat(auth):`、`fix(api):`

## 格式

```
<type>(<scope>)!: <描述>

<正文：为什么改、之前行为、之后行为>

<脚注：BREAKING CHANGE: / Closes #123>
```

## 要点

- 标题用祈使语气（"add" 而非 "added"），≤72 字符，结尾无句号
- 正文解释 WHY 而非 WHAT（WHAT 在 diff 里）
- 破坏性改动加 `!`：`feat(api)!:`
- 一次提交只做一件事
- 提交前确认测试通过

## 示例

```
feat(auth): add password reset

feat(api)!: switch to JWT authentication

fix(api): handle null email in user validation

refactor(parser): extract validation to validator module
```
