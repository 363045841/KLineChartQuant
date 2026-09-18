---
name: commit-message-generator
description: 生成遵循 Conventional Commits 规范的提交信息
---

# 提交信息生成

## 流程

1. 查看 `git diff` 与 `git status`，弄清改动范围、类型与原因
2. 标题格式:type(scope): 描述
3. 复杂改动补正文
4. 破坏性改动 / 关联 issue 补脚注

`scope`类型:feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

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
```
