---
name: script-dsl
description: 编辑指标脚本、改 DSL 契约或写指标脚本时，查写法、签名与生成规则
metadata:
  opencode/autoinvoke: false
---

# 指标脚本 DSL

只在显式加载时使用。这里只给入口和硬规则，正文在两份文档里。

## 入口

| 要做的事 | 看哪里 |
| --- | --- |
| 写/改一个指标脚本 | `packages/script/docs/indicator.md`：骨架、序列语义、参数、跨 bar 状态、错误表 |
| 查签名、选项、枚举取值 | `docs/script/api/index.md`，按主题进 `runtime` / `plot` / `drawing` / `ta` / `enums` |
| 改契约本身 | `packages/plot-contracts/src/` 与 `packages/script/src/editor/globals.d.ts.txt` |

## 硬规则

1. `defineIndicator` 必须声明 `version: 2`；旧写法注册期直接报错，不保留兼容层。
2. 改完契约或文档后跑 `pnpm docs:script:generate`，`pnpm docs:script:check` 校验；不要手改 `docs/script/api/*` 与 `packages/script/src/editor/apiReference.ts`，它们由生成器产出。
3. `packages/script/docs/indicator.md` 里标记为 ` ```js ` 的代码块会被 `docsExamples.test.ts` 真实执行，必须是完整可运行脚本；片段一律用 ` ```ts `。

## 落点

- 内置指标脚本：`packages/script/scripts/*.ts`，目录由生成器自动发现，不维护手工清单。
- 脚本可见的全局声明：`packages/script/src/editor/globals.d.ts.txt`，同时决定 hover 与文档。
- 枚举取值：`packages/plot-contracts/src/{color,shape,drawing,market,format,hline}.ts`，由 `generate-script-enums.mjs` 生成 VM 全局。
