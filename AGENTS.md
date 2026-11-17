# KLineChartQuant — Agent Guide

## 工作流要求

- 一次把要改的文件全改完:在一次消息中编辑所有要修改的文件,不要思考一段编辑一段,那是很耗时的 Agent 工作流.

## CodeGraph

- 理解或修改代码前先查 CodeGraph:`codegraph_explore` 一次拿到相关符号的源码、调用链(含 grep 跟不到的动态分发)和影响范围;等价 CLI 是 `codegraph explore "<符号或问题>"`.
- 工具不在初始列表里时先用 `search({ query: 'CodeGraph' })` 取准确路径再调用,禁止臆测或拼装工具名,禁止以"工具不存在"为由放弃.
- 只有 CodeGraph 未索引的内容才退回 grep/read;仓库内搜索一律 `git grep`(含未跟踪文件加 `--untracked`),禁止 `Get-ChildItem`/`Select-String` 递归扫盘.
- 启动子代理必须在提示词中要求其优先使用 CodeGraph MCP.

## 硬禁止

- 拒绝治标不治本的"最小修复";模块重构不做小修小补,该重写就彻底重写,不留架构债,代码可读可维护,不炫技;不复杂化问题,尤其是架构层面.
- 禁止无意义的 `??` 与 fallback,数据消费层尤其如此;回退逻辑是风险放大点.
- 禁止先留一段兼容逻辑,事后再来改的两段式改法.
- 禁止隐式副作用:状态写入显式接收目标状态,不在读取路径上改值.
- 不要在重构后跑测试的时候为之前的遗留测试反复拟合重构后的代码行为, 直接重写测试即可.
- 单个提交或 PR 不得超过 5000 行;超过必须与仓库拥有者深入讨论对接,否则架构无法维护.
- 做 PR 时:
  - 禁用 `/goal` 命令.
  - PR 说明写进临时文件.
  - 不一次写一大堆代码而不给用户手动测试的机会.
  - 不长时间自行收敛相当宽泛的问题而不交贡献者亲自测试.
  - 不在小问题上引入严苛校验,那会让链路难以维护.
  - 未经确认不围绕自己 MOCK 的数据开发或重构.

## Committing

- 提交先用 `skill("commit-message-generator")` 加载 `.opencode/skills/commit-message-generator/SKILL.md`,以生成 Conventional Commits 信息.
- PR 说明覆盖整个分支的全部提交,而不是只描述最后一个 commit.
- 只有用户明确要求时才能提交.

## Monorepo

pnpm workspace at `packages/*`。唯一对外发布包是 `packages/vue`(`@363045841yyt/klinechart`),其余包均为私有实现模块,发布名 = 目录名加 `@363045841yyt/klinechart-` 前缀。内部包不发布,Vue 产品包内联内部运行时代码与声明,Vue 本身保持外部 peer。`KlineWorkbench` 是源码 preview 与消费项目共用的完整工作台入口,高级 Agent API 在同一包的 `/agent` 子入口。构建、打包与验收命令见 Commands。

## Commands

| Command | What |
|---------|------|
| `pnpm lint` | Biome 检查(`biome check .`,含 lint + format + import 排序);`pnpm lint:fix` 自动修复 |
| `pnpm format` | Biome 格式化(`biome format --write .`) |
| `pnpm build:packages` | 发布构建的唯一入口;root `vite.config.ts` 的 library entry 已失效,不要用 |
| `pnpm type-check` | 用 `vue-tsc --noEmit -p <tsconfig>` 逐个检查 `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.vitest.json`,不用 `tsc`,不用 `--build` |
| `pnpm test:unit` | root 测试(packages 被排除);跨包测试用 `pnpm test:packages` |
| `pnpm docs:generate` / `pnpm docs:check` | 生成 / 校验 README |

## 数据源

本地行情后端在同级目录:`GoTDX-Connector`(TDX)、`Binance-Connector`(现货 K 线 / 逐笔成交)、`Baostock-Tradingview-Connector`(BaoStock / TradingView)、`KCQ-MT5-connector`(MT5,需 Windows + 已登录终端)、`KCQ-THS-connector`(同花顺 A 股/指数/ETF/期货/期权**日线**,需 API Key).后两者不纳入 `-c all`,需显式指定.安装 `pnpm setup:backends`,启动 `pnpm dev -c <name>` 或 `pnpm connector <name>`,涉及后端时先读对应仓库的 `AGENTS.md`.

## 测试

- **类型是契约,不是障碍.**禁止用 `as` / `as unknown as` / `any` / `@ts-nocheck` 绕过类型检查;契约加字段,替身缺成员必须在编译期暴露.
- **单一事实来源,复用优先.**同一份构造、替身、常量、映射只能有一处实现;用例只声明差异.
- **表驱动优先,只留有价值的用例.**能用参数表表达的用例一律用 `it.each`;无意义、低价值或与其他用例重复的用例不要保留,能合并的合并.
- **测试代码与生产代码同权.**测试同样受类型检查和门禁约束,不得靠关闭检查换取"能跑";不许引入脆弱的 MOCK.
- 日期测试依赖 `TZ=Asia/Shanghai`;Windows 本地失败时先设 `$env:TZ='Asia/Shanghai'`.

## Code Conventions

- **Formatter / Linter**: `biome` 只在提交前跑一次;编辑和验证改动期间一律不跑,只读的 `biome check` 也不例外,改动是否正确由类型检查和测试证明.
- **Imports**: 跨目录导入用 tsconfig 的 `@/` 别名(`@/engine/*`,`@/foundation/*`),避免 `../../../`.
- **Decorator transform**: Babel(`@babel/plugin-proposal-decorators`,`version: '2023-11'`),不是原生 TC39 decorators.
- **Vue bindings signal bridge**: 用 `shallowRef`(不是 `ref`),core signal 值不可变,深代理会破坏 `Object.is` 的引用相等.
- **Controller factory injection**: Vue 包在 import 时执行 `__setControllerFactory(createChartController)`,测试在 setup 里用 `__setControllerFactory(null/mock)` 覆盖.
- **Generated files**: `components.d.ts` 由 `unplugin-vue-components` + `unplugin-icons` 生成,dev server 启动时重新生成.
- **Vue SFC composable extraction**: 逻辑一律抽到 composable(`useXxx`),不在 `<script setup>` 里耦合业务逻辑.
- **Semantic module layout**: 有独立职责的功能模块用类似 Java 的分层目录,`<module>/types.ts` 放对外契约与依赖接口,`<module>/impl/` 放实现,只测该模块时用 `<module>/__tests__/`;`types.ts` 不得依赖同模块 `impl/`,调用方优先依赖契约.
- **Error codes / Colors**: 错误码必须引用 `packages/core/src/errors.ts` 的具名常量且 append-only;颜色收归 `packages/core/src/foundation/tokens`,业务组件只消费 Token 输出的 CSS 变量;禁止散落字符串字面量与局部硬编码颜色.

## Architecture

- **Entrypoints**: `packages/core/src/index.ts`(re-exports reactivity,controllers,tokens),`packages/vue/src/index.ts`(SFC 组件 + createChart + composables),`packages/vue/src/components/KLineChart.vue`(legacy SFC).
- **Core engine**: `packages/core/src/engine/` —— chart,viewport,panes,renderers,interaction,markers,drawing.
- **Plugin subsystem**: `packages/core/src/foundation/plugin/` —— PluginHost,HookSystem,EventBus,ConfigManager,StateStore,RendererPluginManager(只负责 register/config,paint 走 Scene).
- **Rendering**: 管线 SSOT 是 `docs/rendering/rendering-pipeline.md`;分层更新由 `UpdateLevel` Main|Overlay|All 与正式 drawing 保留策略负责.已删除的 architecture/plugin 渲染文档不要复活.
- **StateKernel**: 图表业务状态的唯一事实来源,契约与目录见 `packages/core/src/engine/state/README.md`.硬约束:每段状态只有一个 writable signal;派生值只放 `computed()`;对外只暴露 `ReadonlySignal`;多字段写入用 `batch()` 合成一次通知;有相关语义的数据必须通过一次完整快照 Action 写入.
- **Core Native Agent Tools**: Agent 与用户等权,用户在 UI 能调用的入口就是 Agent 工具的入口;工具统一在 agent-runtime 中实现,通过 core 原生 `@Tool` 注册.

## Known Quirks

- **Viewport too large**: 可能触发 `MAX_CANVAS_PIXELS`(`viewportState` 的 `clampDpr`),DPR 会被主动降级.
- **tsc 增量构建与产物**: 各包 `tsc -p tsconfig.build.json` 用 `incremental` + `node_modules/.tmp` 缓存,只比对源文件时间戳;若 `dist/` 被带外删除而缓存仍在,会跳过 emit 并退出 0(得到空 `dist`).删掉对应的 `tsconfig.build.*.tsbuildinfo` 再构建,CI 干净检出不受影响.

## 文档

- 涉及核心 Core 引擎改动的必须附加设计决策文档,放在 `docs/design`.
- 各包 README 由 `docs/fragments/`(可复用片段)和 `docs/templates/`(包级模板)经 `scripts/generate-readmes.mjs` 生成;只改 fragments,再 `pnpm docs:generate` 同步,`pnpm docs:check` 校验.

## Comment Style

- 每个文件必须有头部注释说明用途;每个函数必须有注释说明职责、参数和返回值,简单函数可从简.
- 关键代码必须有注释说明实现意图、业务规则或不直观的处理,一句话讲清是什么或为什么,不复述代码本身.
- 单行注释用 `//`;注释正文用中文,技术用语和专有词汇保留英文.

## SubAgent

- 除非用户明确要求,否则不要启动子代理;最多同时起三个.

## 杂项

- Github CLI: 不要用 `\` 转义.
- 包管理: 用 pnpm,不许用 npm.
