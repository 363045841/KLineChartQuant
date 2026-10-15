# Script VM 运行时源码的编写与生成

## 背景

QuickJS 只能执行源码文本，因此 VM 内的运行时（行情序列、库协议、指标 SDK、`ta` 库）最终必须以字符串形式注入。
改造前这些代码是 `impl/prelude.ts` 与 `impl/libraryPrelude.ts` 中手写的模板字符串：没有类型检查、没有格式化、没有 IDE 支持，
且 `ta` 的实现与 `Library/types.ts` 的公开契约各写一份、靠人工保持一致（`crossover` 的返回类型分歧就是这样漏掉的）。

## 决策

运行时源码以真正的 TypeScript 编写（`src/quickjs/runtime/`），构建时编译成字符串。

### 为什么是全局脚本，而不是模块

`src/quickjs/runtime/` 下的 `.ts` 一律不写 `import`/`export`：

- 模块语法会被编译成 `export {}` 之类残留，注入 VM 后直接报错；
- 反过来，全局脚本的输出是纯语句，与 VM 逐段 `eval` 的加载方式一一对应；
- 每段源码被求值后，顶层 `const`/`function` 进入全局词法环境，下一段可见，这正是跨文件引用（`series.ts` 定义 `open`，`indicator.ts` 消费）能工作的原因。

因此跨文件引用走全局作用域，而不是 import。宿主注入的内建函数（`__read`/`__count`/`__plot`）与 `params` 由 `runtime/vm.d.ts` 声明，
契约类型（`Series`、`TechnicalAnalysisLibrary`、`ScriptIndicatorDeclaration` 等）也在此用 `import('...')` 内联类型指向唯一来源，不复制结构。

`tsc -p tsconfig.runtime.json` 按全局脚本检查这一层；`src/quickjs/runtime` 同时被宿主 `tsconfig.json` 与 `tsconfig.build.json` 排除，
运行时源码不会进入宿主编译器，也不会编译进 `dist`。

### 生成

`scripts/generate-runtime-sources.mjs` 用 TypeScript 的 `transpileModule` 去掉类型，把每段源码序列化为
`src/quickjs/generated/runtime.ts` 中的字符串常量（该目录已 gitignore）。生成器会在输出残留 `import`/`export` 时直接失败——
这种情况说明某个文件被写成了模块，全局声明将失效。

构建顺序：`tsc -p tsconfig.runtime.json`（类型检查）→ 生成运行时字符串 → 生成编辑器类型资源 → `tsc -p tsconfig.build.json`。

### 契约绑定

`ta` 的实现通过 `satisfies TechnicalAnalysisLibrary` 与编辑器补全用的公开契约绑定，签名分歧在编译期暴露，
不再依赖人工同步两份声明。

## 行为差异

除下列一处，改造保持原行为：

- `defineIndicator` 不再用 `definition.inputs || {}` 兜底缺失的 `inputs`。声明缺少 `inputs` 属于非法脚本，
  `readDefinition` 本来就会以 `compile` 错误拒绝，兜底只是把拒绝推迟并产生歧义；现在在声明阶段即拒绝。

## 不采用的方案

- **在宿主侧用 `vm.newFunction` 构建 `ta`**：每次 `Series` 取值都要跨越 VM 边界，惰性取值会显著变慢。
- **为便于单测把 `ta` 改成数组批量计算**：会推翻惰性 `Series` 契约，是另一个量级的改动。
