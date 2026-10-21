# KLineChartQuant — Agent Guide

## 工作流要求

- 只允许使用 CodeGraph 看文件,不要在那边自己搜来搜去,在命令往返上拖慢时间.
- 一次把改的文件全改完:在一次消息中编辑所有要修改的文件,不要思考一段编辑一段,这是很耗时的Agent工作流.

## 硬禁止

- 拒绝治标不治本的"最小修复";模块重构不做小修小补,该重写就彻底重写,不留架构债,代码要可读,可维护,不炫技.
- 不复杂化问题,尤其是架构层面.
- 禁止硬编码字符串;错误码与颜色的 SSOT 见 Code Conventions.
- 禁止无意义的 `??` 与 fallback,数据消费层尤其如此;回退逻辑是风险放大点.
- 禁止先留一段兼容逻辑,事后再来改的两段式改法.
- 禁止写产生副作用的函数,那是耦合的来源.
- 单个提交或 PR 不得超过 5000 行;超过必须与仓库拥有者深入讨论对接,否则架构无法维护.
- 做 PR 时:
  - 禁用 `/goal` 命令.
  - PR 说明写进临时文件.
  - 不一次写一大堆代码而不给用户手动测试的机会.
  - 不长时间自行收敛相当宽泛的问题而不交贡献者亲自测试.
  - 不在小问题上引入严苛校验,那会让链路难以维护.
  - 未经确认不围绕自己 MOCK 的数据开发或重构.

## Quick Search

- 理解或修改代码前必须先查 CodeGraph:用 `codegraph_explore` 分析调用链,影响范围和现有实现,只有它未索引的内容才退回 grep/read.
- CodeGraph 工具可能不在初始工具列表里;这时先通过运行时 `search({ query: 'CodeGraph' })` 取得准确工具路径再调用,禁止臆测或自行拼装工具名,禁止以"工具不存在"为由放弃.
- 启动子代理探索代码时,必须在提示词中要求其优先使用 CodeGraph MCP.

## Committing

- 提交必须先用 `skill("commit-message-generator")` 加载 `.opencode/skills/commit-message-generator/SKILL.md`,以生成 Conventional Commits 信息.
- PR 说明覆盖整个分支的全部提交,而不是只描述最后一个 commit.
- 只有用户明确要求时才能提交.

## Monorepo

pnpm workspace at `packages/*`;Node `^20.19.0 || >=22.12.0`,pnpm 11.x.可以发布的包:

| 目录 | 发布包 |
|------|--------|
| `packages/plot-contracts` | `@363045841yyt/klinechart-plot-contracts` |
| `packages/script` | `@363045841yyt/klinechart-script` |
| `packages/script-server` | `@363045841yyt/klinechart-script-server` |
| `packages/script-chart` | `@363045841yyt/klinechart-script-chart` |
| `packages/core` | `@363045841yyt/klinechart-core` |
| `packages/agent-runtime` | `@363045841yyt/klinechart-agent-runtime` |
| `packages/vue` | `@363045841yyt/klinechart` |
| `packages/react` | `@363045841yyt/klinechart-react` |
| `packages/angular` | `@363045841yyt/klinechart-angular` |

`pnpm build:packages` 按 plot-contracts → script → script-server → core → script-chart → agent-runtime → vue 的顺序构建,顺序不可颠倒:框架包通过 `workspace:` 协议依赖 core 与 agent-runtime,vue 还把 agent-runtime 声明为 `peerDependencies`.react,angular 不在该命令内,各自单独构建.vue 的 build 先 `vite build` 再跑 `build:wc`(web component,`BUILD_TARGET=web-component`).

## README Generation

各包 README 由 `docs/fragments/`(可复用 Markdown 片段)和 `docs/templates/`(包级模板)经 `scripts/generate-readmes.mjs` 生成;只改 fragments,然后 `pnpm docs:generate` 同步,`pnpm docs:check` 校验.

## Commands

| Command | What |
|---------|------|
| `pnpm lint` | Biome 检查(`biome check .`,含 lint + format + import 排序);`pnpm lint:fix` 自动修复 |
| `pnpm format` | Biome 格式化(`biome format --write .`) |
| `pnpm build:packages` | 发布包构建,顺序见 Monorepo |
| `pnpm type-check` | `type-check:src` + `type-check:tests`;用 `vue-tsc --noEmit -p <tsconfig>` 逐个检查 `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.vitest.json`,不用 `tsc`,不用 `--build`;增量缓存由各 config 的 `incremental` + `tsBuildInfoFile`(`node_modules/.tmp/`)提供 |
| `pnpm test:unit` | root 测试 |
| `pnpm test:packages` | 所有 workspace 包测试(`pnpm -r test`) |
| `pnpm docs:generate` / `pnpm docs:check` | 生成 / 校验 README |

## 数据源

本地行情后端位于本仓库同级目录:`GoTDX-Connector`(gotdx),`Binance-Connector`(Binance 现货 K 线 / 逐笔成交),`Baostock-Tradingview-Connector`(BaoStock,TradingView),`KCQ-MT5-connector`(MT5,Windows + 已登录终端)和 `KCQ-THS-connector`(同花顺 A 股/指数/ETF/期货/期权**日线**,需同花顺 API Key).后两者不纳入 `-c all`,需显式指定.涉及后端时先阅读对应仓库的 `AGENTS.md`;用 `pnpm setup:backends` 安装,`pnpm dev -c <name>` 或 `pnpm connector <name>` 启动.

## 测试

- **类型是契约,不是障碍.**禁止用 `as` / `as unknown as` / `any` / `@ts-nocheck` 绕过类型检查;契约加字段,替身缺成员必须在编译期暴露,而不是静默通过.
- **单一事实来源,复用优先.**同一份构造,替身,常量,映射只能有一处实现;用例只声明差异,禁止复制粘贴同一套东西;可复用 setup 抽成 helper 或表驱动(`it.each`).
- **测试代码与生产代码同权.**测试同样受类型检查和门禁约束,不得靠关闭检查换取"能跑";不许引入脆弱的 MOCK.
- Root 测试用 `pnpm test:unit`,packages 被其排除,跨包测试用 `pnpm test:packages`;`*.integration.test.ts` 默认不被收集.
- 日期测试依赖 `TZ=Asia/Shanghai`;Windows 本地失败时先设 `$env:TZ='Asia/Shanghai'`.

## Code Conventions

- **Formatter / Linter**: `biome`/`pnpm lint`/`pnpm format` 只属于提交环节,只在提交前跑一次;编辑改动和验证改动期间一律不跑,包括"顺手 check 一下有没有破坏 lint/format"这种自检,`biome check` 只读也不行——那是提交的动作,不是编辑的动作.改动是否正确用类型检查和测试证明,不靠 biome 兜底.
- **Imports**: 跨目录导入可用 tsconfig 的 `@/` 别名(`@/engine/*`,`@/foundation/*`),避免 `../../../` 形式的深层相对路径.
- **Decorator transform**: Babel(`@babel/plugin-proposal-decorators`,`version: '2023-11'`),不是原生 TC39 decorators.
- **Vue bindings signal bridge**: 用 `shallowRef`(不是 `ref`),core signal 值不可变,深代理会破坏 `Object.is` 的引用相等.
- **Controller factory injection**: Vue 包在 import 时执行 `__setControllerFactory(createChartController)`,测试在 setup 里用 `__setControllerFactory(null/mock)` 覆盖.
- **Generated files**: `components.d.ts` 由 `unplugin-vue-components` + `unplugin-icons` 生成,dev server 启动时重新生成.
- **Vue SFC composable extraction**: 逻辑一律抽到 composable(`useXxx`),不在 `<script setup>` 里耦合业务逻辑.
- **Semantic module layout**: 有独立职责的功能模块采用类似 Java 的分层目录,`<module>/types.ts` 放对外契约,数据类型与依赖接口,`<module>/impl/` 放实现,只测该模块时用 `<module>/__tests__/`;`types.ts` 不得依赖同模块 `impl/`,调用方优先依赖契约,实现只能从 `impl/` 导入;不要继续在 feature 根目录堆叠实现文件.
- **Error codes**: `KLineChartError` 的错误码必须引用 `packages/core/src/errors.ts` 里的具名常量,禁止在业务代码里散落字符串字面量;新增错误码保持 append-only.
- **Colors**: 颜色必须收归 `packages/core/src/foundation/tokens` 管理,业务组件只消费 Token 输出的 CSS 变量,禁止局部硬编码颜色.

## Architecture

- **Entrypoints**: `packages/core/src/index.ts`(re-exports reactivity,controllers,tokens),`packages/vue/src/index.ts`(SFC 组件 + createChart + composables),`packages/vue/src/components/KLineChart.vue`(legacy SFC).
- **Core engine**: `packages/core/src/engine/` —— chart,viewport,panes,renderers,interaction,markers,drawing.
- **Plugin subsystem**: `packages/core/src/foundation/plugin/` —— PluginHost,HookSystem,EventBus,ConfigManager,StateStore,RendererPluginManager(只负责 register/config,paint 走 Scene).
- **Rendering**: `packages/core/src/rendering/` —— Scene/Layer,RendererHost,WebGPU/WebGL/Canvas2D backends.
- **构建**: 发布一律用 `pnpm build:packages`;root `vite.config.ts` 的 library entry 指向已删除的 `src/index.ts`,不再可用.
- **DPR/ResizeObserver** 是 canvas 尺寸的唯一事实来源(`devicePixelContentBoxSize`,回退 `window.devicePixelRatio`):状态在 `viewportState`,DOM 适配在 `ChartViewportManager`.
- **Rendering pipeline**(SSOT: `docs/rendering/rendering-pipeline.md`): `Chart.scheduleDraw` → `ChartRenderer` + `FrameTransaction` → `prepareFrameData` → `sealFrameGeometry` → `Scene.paint`(main/drawing/overlay 目标层带、目标内 z 排序、draw-list 图层无 ctx、每目标一个合成器) → 轴标签/时间轴/十字线;Renderer 只有必需的公共原语执行器,可选 `createSurface` 为主图带提供可见 GPU 直出表面(画布由 Pane 持有与定位).`UpdateLevel` Main|Overlay|All 与正式 drawing 保留策略负责分层更新.不要复活已删除的 architecture/plugin 渲染文档.
- **StateKernel** 是图表业务状态的唯一事实来源(子状态:options,zoom,data,dataManager,comparison,indicator,subPane,marker,viewport,pane,settings,mode,drawing,interaction,systemTheme).四条硬约束:每段状态只有一个 writable signal;派生值只放 `computed()`;对外只暴露 `ReadonlySignal`;多字段写入用 `batch()` 合成一次通知.有相关语义的数据必须通过一次完整快照 Action 写入.`settings.theme` 是偏好(`light|dark|auto`),有效 theme 由偏好 + `systemTheme` computed 得出,以扁平 `signals.theme` 暴露.契约,目录与范例见 `packages/core/src/engine/state/README.md`(`viewportState.ts`,`stateKernel.ts`).
- **Core Native Agent Tools**: Agent 与用户等权,用户在 UI 能调用的入口就是 Agent 工具的入口;工具统一在 agent-runtime 中实现,通过 core 原生 `@Tool` 注册.

## Known Quirks

- **Viewport too large**: 可能触发 `MAX_CANVAS_PIXELS`(`viewportState` 的 `clampDpr`),DPR 会被主动降级.
- **tsc 增量构建与产物**: 各 `tsc -p tsconfig.build.json` 的包用 `incremental` + `node_modules/.tmp` 缓存,该缓存只比对源文件时间戳;若 `dist/` 被带外删除而缓存仍在,`tsc` 会认为已最新,跳过 emit 并退出 0(得到空 `dist`).删掉对应的 `node_modules/.tmp/tsconfig.build.*.tsbuildinfo` 再构建即可;CI 每次干净检出,不受影响.

## Comment Style

- 涉及核心 Core 引擎改动的,必须附加设计决策文档,放在 `docs/design`.
- 每个文件必须有头部注释说明用途;每个函数必须有注释说明职责,参数和返回值,简单函数可从简.
- 关键代码必须有注释说明实现意图,业务规则或不直观的处理;注释一句话讲清是什么或为什么,不复述代码本身.
- 单行注释用 `//`;注释正文用中文,技术用语和专有词汇保留英文.

## SubAgent

- 除非用户明确要求,否则不要启动子代理;最多同时起三个.

## 杂项

- Github CLI: 不要用 `\` 转义.
- 包管理: 用 pnpm,不许用 npm.
