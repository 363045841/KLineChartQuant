---
name: codereview-techniques
description: Use when performing a code review or auditing a branch/PR/diff for code smells — concrete, mechanical techniques to scope by churn, find scattered guards and duplicated state resets, spot two persistence paths and meaningless fallbacks, check contract duplication and change propagation, and verify the fix.
---

# 代码审查技巧

与 `codereview` 配合使用：`codereview` 讲「查什么原则」，本技能讲「怎么下手、怎么定位、怎么验证」。
审查前先用 CodeGraph 建立调用链与影响面，不要一上来就 grep/read。

## 0. 先用改动量定位战场

- `git diff --numstat <base>..HEAD`，按 `增+删` 排序，先审改动最多的文件；新文件按纯新增计。
- 优先核心模块与公共契约，样式/展示层靠后。
- 分清「新文件」与「被改文件」：新文件看整体设计，被改文件看语义漂移。

## 1. 散落守卫 / 重复前置条件

「同一个前置条件在 N 处各写一遍」就是 finding。

- 手法：grep 关键变量或条件片段（如 `grep -n "autoSave\|disposed\|loaded"`），统计重复次数与写法差异。
- 收敛为单一谓词或 helper；重点抓第 N+1 处写法不一致的地方（例如某处漏了 `disposed` 判断）。

## 2. 重复的状态重置 / 半截实现

- 同一「重置 A、再置 B」序列在多处重复 → 抽成一个方法（如 `markClean()`）。
- 重点抓只做了一半的调用点：那是漂移信号（例：三处同时更新基线与 dirty，第四处只更新 dirty）。

## 3. 双通路 / 影子持久化

- 同一业务状态是否被两套机制各自读写：localStorage + IndexedDB、`commit()` + 裸 `save()`。
- 确认所有写入是否走唯一路径；恢复/加载是否存在两条来源相互覆盖。
- 删除旧通路后，grep 残留的 storage key、事件监听、构造参数、`schedule*` 钩子。

## 4. 契约二次定义 / 依赖选型

- 手写校验或 schema 是否把某个类型的字段又列了一遍；优先「类型由 schema 派生」或「持久化用守卫、类型单独定义」，一处为准。
- 依赖选型是否与仓库约定一致：例如 typebox 只用于外部不可信输入（Agent 工具），自有持久化应沿用既有手写 codec 约定。

## 5. 无意义守卫 / fallback 残余

逐条问「这个分支真的可能被走到吗？」

- `const x = map[k] ?? null` 紧接 `if (!x) return null` → `?? null` 冗余。
- 守卫重复了上游调用方已经做过的校验 → 跨层重复守卫。
- 永真的 `obj[k] ? … : []`（k 来自 `Object.keys(obj)`）→ 死分支，改用 `Object.entries` 省掉。
- `real ?? (fallback as T)` 里的 `as` 兜底 → 类型谎言。
- `?? default` 分两种：可选字段 / 未就绪占位（保留）；掩盖本不该缺失的值（删除）。
- 破坏性判断：删守卫前确认唯一调用路径已保证不变式，否则保留并加注释说明。

## 6. 魔法字符串 / 枚举散落

- 同一组 id/枚举由生产端定义、消费端再判定 → 提共享常量，避免字符串在两处各自拼。
- 更优：把「是否可操作」这类规则收回领域层（如让列表项携带 `deletable`），UI 只读标记。

## 7. 变更传播

- 删除或重命名后，grep 代码、测试、`docs/`、README、导出入口、包 `exports` map。
- 确认测试也被类型检查（vue-tsc / `pnpm type-check:tests`），不能只靠运行时转译。
- 注意分层方向：engine 反向 import controllers 之类的依赖，先确认是不是仓库既有约定，再决定是否 flag。

## 8. 测试价值

- 识别只覆盖被删能力或旧通路的用例、以及重复覆盖。
- 有价值的行为应「改走新路径」保留覆盖（如把构造期注入的用例改为 `kernel.applyLayout(...)`），而不是直接删掉了事。
- 关联判断：删掉旧实现后，原来依赖它的断言是否一并失去对象。

## 9. 验证闭环

- `pnpm type-check`（vue-tsc 逐 tsconfig）、定向 `vitest run <paths>`、`biome check <files>`。
- 框架包经 package `exports` 解析 core 的 `dist` 类型：改 core 公共契约后，必须先 `pnpm --filter <core> build` 再给前端 type-check，否则校验到的是陈旧 d.ts。
- 记录「零新增 lint error」，并区分仓库既有错误（例如 `theme-light/dark.ts` 的 organizeImports）。

## 10. 输出格式

- 每条 finding：`文件:行号`、问题、为什么有风险、如何收敛；按严重度（高/中/低）排序。
- 收敛建议要给「单一来源」的落点，而不是就地打补丁。
- 明确列出「已检查且无问题的边界」与「剩余测试风险」，避免只报问题。

## 11. 修复时的约定（本仓库）

- AGENTS 明确：不要到处散落守卫逻辑；拒绝治标不治本的最小修复；禁止硬编码字符串；测试与生产代码同权。
- 修复优先「收敛为单一谓词 / 单一写路径 / 单一契约」，能在领域层表达的规则不要留在 UI。
- 能整体重写的小文件就重写，不要在旧结构上打多个补丁。
- 一次提交只做一件事；提交信息走 `commit-message-generator`，且只在用户明确要求时提交。
