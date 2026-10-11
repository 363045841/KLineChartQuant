---
name: fallow-check
description: 用 fallow 做代码质量检查——审计提交改动、定位循环依赖与重复代码、清理未使用导出并自动修复。需要跑或解读 fallow 命令时使用。
---

# Fallow 常用流程

## 硬规则

1. 统一 `fallow <子命令> [范围 flag] --format json --quiet`，不加 `--pretty`。
2. stderr 与 stdout 分开，禁止 `2>&1` 合并。
3. exit `0`=干净、`1`=有 findings，两者都是成功结果；其它才是配置/网络/资源错误。

## 常用命令

| 目的 | 命令 |
|------|------|
| 审计本次改动 | `fallow audit --base HEAD~1 --format json --quiet` |
| 只看某一类问题 | `fallow dead-code --circular-deps --unused-exports --format json --quiet` |
| 只看改动文件 | `fallow dead-code --changed-since HEAD~1 --format json --quiet` |
| 循环依赖 / 边界 | `fallow architecture --cycles --format json --quiet` |
| 重复代码 | `fallow dupes --format json --quiet` |
| 复杂度热点 | `fallow health --hotspots --targets --format json --quiet` |
| 删之前取证 | `fallow dead-code --trace <file>:<export> --format json --quiet` |
| 自动修复 | `fallow fix --dry-run --format json --quiet <path>` → `fallow fix --yes --format json --quiet <path>` |
| 查某 issue 是什么 | `fallow explain unused-export --format json` |

## 坑

- `fix` 的范围**只能靠位置参数 `[PATH]` 收敛**，`--changed-since` 不生效。不限定就全仓跑，会误删 web-component 构建入口导出，以及 `@vue/test-utils` / `@babel/*` 这类被配置文件引用的依赖。
- `fix` 只处理 unused export / dependency / enum member，**不处理 unused type**，那类要手删。
- `audit` 默认 `--gate new-only`，只卡新引入的问题；继承问题仅作 JSON 上下文。全部计入用 `--gate all`。
- `--type-aware` 走 TypeScript checker，约 50s，按需再开。
- 假阳性先 `grep` 复核再删；属于公开 API（包 `exports` 里导出）的成员默认保留。

## 本仓库

- 已 `pnpm add -g fallow`，直接用 `fallow`，不必 `npx -y`。
- 配置在 `.fallowrc.json`（entry / ignorePatterns / rules / ignoreDependencies）。
- 建议补 `ignoreDependencies: ["~icons"]`（unplugin-icons 虚拟模块）。
- 完整能力（plugins、coverage、impact、migrate 等）见 `.agents/skills/fallow/`。