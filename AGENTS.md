# KLineChartQuant — Agent Guide

## 工作流要求

- 一次把要改的文件全改完:在一次消息中编辑所有要修改的文件,不要思考一段编辑一段,那是很耗时的 Agent 工作流.

## CodeGraph

- 理解或修改代码前先查 CodeGraph:`codegraph_explore` 一次拿到相关符号的源码、调用链(含 grep 跟不到的动态分发)和影响范围;等价 CLI 是 `codegraph explore "<符号或问题>"`.
- 工具不在初始列表里时先用 `search({ query: 'CodeGraph' })` 取准确路径再调用,禁止臆测或拼装工具名,禁止以"工具不存在"为由放弃.
- 只有 CodeGraph 未索引的内容才退回 grep/read;仓库内搜索一律 `git grep`(含未跟踪文件加 `--untracked`),禁止 `Get-ChildItem`/`Select-String` 递归扫盘.
- 启动子代理必须在提示词中要求其优先使用 CodeGraph MCP.

## 浏览器验证

- 开发过程中需要浏览器验证时,用 `/ego-browser` 技能,通过本机安装的 ego lite 浏览器的真实浏览器界面验证.
- 验证结束必须收尾:关掉验证用的标签页(`page.close()`),并删除本轮临时脚本目录(`round-*.mjs` 与截图).ego 常驻进程多,残留页面会占系统资源;issue 关闭或验证完成后不留残留.
- 不要为重置行情删整个 IndexedDB:只删 `@363045841yyt/klinechart-market-data`,或走「设置 → 数据源 → 清除缓存」.删掉整组 `@363045841yyt/klinechart*` 会清空图表工作区与指标参数.

## 验证前必须重置后端与缓存

动过行情、缓存、明细窗口、会话配置或指标脚本之后,验证固定按这个顺序,少一步就可能验出假结果:

1. 重启对应连接器,确保后端跑的是新代码:8090 MT5(`KCQ-MT5-connector` 的 `start_mt5_connector_boot.ps1`)、8091 Binance(`binance-connector.exe`).连接器代码没动时可跳过.
2. 清除浏览器缓存数据:设置 → 数据源 → 清除缓存;或用 DevTools → Application → IndexedDB 删除 `@363045841yyt/klinechart-market-data`.
3. 硬刷新页面(Ctrl+F5).
4. 再看图表表现与 Network 里的 `market-data/bars` 请求数.

原因(2026-11-16 故障):行情落盘缓存上线后,旧构建写入的行情页会和新代码一起被读出.数据与后端不一致时,现象是"脚本产出正确但图上显示不全",与指标逻辑无关;不清缓存会让每次修复都被同一份旧数据盖住,表现为反复修改仍不解决.该次排查最后确认:重启后端 + 清缓存后 SVP/PVP 完全正常.

## 开发验证流程（2026-11-17 定为标准）

改动完成后的固定顺序，少一步就会验出假结果：

1. **类型与单测**：`pnpm type-check` 加三包测试（analytics / vue / core）。临时目录必须指到工作区：`export TEMP=D:/AI/KCQ-NexusAI/.tmp-test TMP=D:/AI/KCQ-NexusAI/.tmp-test`（沙箱下 `os.tmpdir()` 不可写，vitest 会报 `EPERM: mkdtemp`）。
2. **起后端**：订单流与期权共用 8093（`scripts/start-analytics.ps1`）；行情连接器按需要起（8090 MT5 / 8091 Binance / 其他见 `scripts/connectors.mjs`）。
3. **起前端**：开发页固定 `http://localhost:5175/`（工作台，右侧侧栏有 Agent / 订单流 / 期权 / 自选股 / 对象树五个面板）。
4. **真实页面验证**：用 `/ego-browser` 技能在 5175 上点开目标页签，读**渲染出的文字**做断言（标题、卡片行、状态），并截图留证。只验接口不算面板已验证。
5. **动过行情或缓存**：按上面「验证前必须重置后端与缓存」三步走。

验收标准写成具体字符串（例如面板标题 `BTC 期权 · Deribit`、偏斜行 `25Δ RR -5.1pp@2026-12-25`、空态 `历史分位：统计不可用。`），不写「显示正常」这类无法核对的描述。

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

- 提交必须先用 `skill("commit-message-generator")` 加载 `.opencode/skills/commit-message-generator/SKILL.md`,以生成 Conventional Commits 信息.
- 个人会话技能目录用 `node scripts/sync-skill.mjs <name>` 从仓库 `.opencode/skills/` 镜像;改了仓库源要同步一次,`--check` 只比对不写(不一致时退出码 1).
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

本地行情后端位于本仓库同级目录:`GoTDX-Connector`(gotdx),`Binance-Connector`(Binance 现货 K 线 / 逐笔成交),`Baostock-Tradingview-Connector`(BaoStock,TradingView),`KCQ-MT5-connector`(MT5,Windows + 已登录终端)和 `KCQ-THS-connector`(同花顺 A 股/指数/ETF/期货/期权**日线**,需同花顺 API Key).同花顺不纳入 `-c all`(需 API Key),`pnpm dev -c all` 已包含 MT5(Windows + 已登录终端时可用).Binance 出网代理由 `scripts/connectors.mjs` 的 `DEV_PROXY` 提供,默认 MonoCloud 7078,可用 `BINANCE_PROXY` 覆盖.涉及后端时先阅读对应仓库的 `AGENTS.md`;用 `pnpm setup:backends` 安装,`pnpm dev -c <name>` 或 `pnpm connector <name>` 启动.

## 测试

- **类型是契约,不是障碍.**禁止用 `as` / `as unknown as` / `any` / `@ts-nocheck` 绕过类型检查;契约加字段,替身缺成员必须在编译期暴露.
- **单一事实来源,复用优先.**同一份构造、替身、常量、映射只能有一处实现;用例只声明差异.
- **表驱动优先,只留有价值的用例.**能用参数表表达的用例一律用 `it.each`;无意义、低价值或与其他用例重复的用例不要保留,能合并的合并.
- **测试代码与生产代码同权.**测试同样受类型检查和门禁约束,不得靠关闭检查换取"能跑";不许引入脆弱的 MOCK.
- 日期测试依赖 `TZ=Asia/Shanghai`;Windows 本地失败时先设 `$env:TZ='Asia/Shanghai'`.
- **一个提交不改两件事.**加新功能时不要顺手改动同一函数里已定的既有规则(例如背景几何,默认参数),这类顺带改动在评审里最容易漏看.既有视觉规则要有用例守住;决定被推翻时同步改用例,否则用例会变成保护错误行为的守门员.

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
- **tsc 增量构建与产物**: 各 `tsc -p tsconfig.build.json` 的包用 `incremental` + `node_modules/.tmp` 缓存,该缓存只比对源文件时间戳;若 `dist/` 被带外删除而缓存仍在,`tsc` 会认为已最新,跳过 emit 并退出 0(得到空 `dist`).删掉对应的 `node_modules/.tmp/tsconfig.build.*.tsbuildinfo` 再构建即可;CI 每次干净检出,不受影响.
- **`test:product` 不会重新打包**: 该命令只执行 `scripts/test-product.mjs`,读取的是 `artifacts/product/*.tgz` 里已有的 tarball.改完源码直接跑会因为测到旧产物而失败(典型症状是 source 与 package 截图不一致,差异落在新加的 UI 上).正确顺序是 `pnpm pack:product` 再 `pnpm test:product`,或直接用 `pnpm build:packages && pnpm pack:product && pnpm test:product` 走全链路.
- **包测试依赖 `packages/script/dist` 的编译产物**: `packages/script-chart` 的内置指标用例经 `NodeScriptWorker` 加载 `packages/script/dist/worker` 里编译好的 worker，而 `dist` 是 gitignore 的产物.切分支或合并后没重建时，红点长这样：`脚本编译失败：input.xxx 必须直接初始化 onBar 顶层的 const 变量`、`内置目录注册失败`、`SVP 活动期锚点断言失败`——源码其实都是对的（2026-11-17 票 #21 就是这一例）.判据：`git log -1 --format=%ci -1 -- packages/script/src` 比 `packages/script/dist/worker/impl/script.worker.js` 的 mtime 新，就先 `pnpm --filter @363045841yyt/klinechart-script build` 再判断失败.
- **切分支后 `dist` 与生成产物会错位**: `dist/` 与 `packages/core/src/engine/indicators/generated/builtinIndicators.ts` 都按"当前分支源码"生成,而工作区在切换分支时不会重建它们.跨分支(`nexus/main` ↔ 上游基线的 `pr/*`)来回切后,会看到源码里有的字段在产物里消失、或类型检查报"属性不存在"、`git status` 冒出生成文件改动.这都不是代码缺陷.**切分支后先 `pnpm build:packages` 重建,再判断失败**.确认真实状态的办法:`git stash` 后重新生成,看生成产物是否与当前源码一致;一致就说明产物只是停留在另一条分支的生成结果.

## 文档

- 涉及核心 Core 引擎改动的必须附加设计决策文档,放在 `docs/design`.
- 各包 README 由 `docs/fragments/`(可复用片段)和 `docs/templates/`(包级模板)经 `scripts/generate-readmes.mjs` 生成;只改 fragments,再 `pnpm docs:generate` 同步,`pnpm docs:check` 校验.

## Comment Style

- 每个文件必须有头部注释说明用途;每个函数必须有注释说明职责、参数和返回值,简单函数可从简.
- 关键代码必须有注释说明实现意图、业务规则或不直观的处理,一句话讲清是什么或为什么,不复述代码本身.
- 单行注释用 `//`;注释正文用中文,技术用语和专有词汇保留英文.

## SubAgent

- 除非用户明确要求,否则不要启动子代理;最多同时起三个.

## 包管理
- 使用pnpm,不许使用npm.
- **`pnpm install` 必须在 PowerShell 里跑**,不要用 MSYS bash / Git Bash:bash 装出的 `node_modules` 是带 `Global\` 前缀的 junction,Node 26 解析不到包内依赖(`import('vite')` 报 `Cannot find package 'rolldown'`,`pnpm build:packages` 会在 `packages/script` 的 build-worker 处失败).判据:`node -e "import('vite').then(()=>console.log('ok')).catch(e=>console.log('FAIL', e.code))"`.
- 安装前先停 `pnpm dev` 与连接器:pnpm 会重建 `node_modules`,占用中的目录删不干净,后续链接会缺项.

## Agent skills

### Issue tracker

Issue 与需求单在仓库 GitHub Issues（gh CLI 读写；PRs 不作为 triage 请求面）。See `docs/agents/issue-tracker.md`.

### Triage labels

五个标准 triage 角色，标签字符串与角色同名。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文：根 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.

### 部署与采集器

采集器的部署契约见 `deploy/README.md`：两个角色（collector / serve）、数据根分片布局、四种形态（本机 / Linux systemd / Docker / NAS 原生）、Agent 十步清单与验收判据。配置面只有一处：`deploy/collector.env.example`（全部 `KCQ_*` 变量），线上实例的非机密配置记在 `deploy/instances/<名字>.env`。改动部署脚本或配置项时，三处必须同步：脚本默认值、配置模板、部署总览。

### 仓库拓扑（三个 remote）

本仓是「私有主仓 + 公开 PR 桥」两段式：`origin` = 私有仓（日常开发），`pr` = 公开 fork（只放准备提上游 PR 的分支），`upstream` = 上游（只读）。
推 `pr` 等于公开，推送前必须逐条确认分支不含策略、私有数据与凭据。See `docs/agents/repo-topology.md`.

## OpenSpec（规格驱动 · 决策档案）

本项目已初始化 OpenSpec 1.8.0。**这是跨会话的决策档案，可靠性高于会话记忆与压缩摘要。**

- **规格即当前真相**：`openspec/specs/<capability>/spec.md`（现有 3 个 capability）
- **变更与决策理由**：`openspec/changes/<name>/` → `proposal.md`（为什么/改什么）+ `design.md`（决策与实证锚点，存在时必读）+ `tasks.md`（进度勾选）
- **历史决策**：`openspec/changes/archive/<YYYY-MM-DD>-<name>/`（已归档 0 个）
- **接手/恢复上下文顺序**：`openspec list` → 当前 change 的 proposal.md + design.md → `.agent-handoff/` → 源码
- **校验**：`npx @fission-ai/openspec validate --all`（结构校验）。
  `--strict` 额外要求英文 RFC-2119 措辞（SHALL/MUST），中文规格基本过不了，当**风格提示**看，不当门禁。
  change 若确属纯文档/工具类、不涉及 spec 变更，在 `openspec/changes/<name>/.openspec.yaml` 写 `skip_specs: true` 即可通过。

当前无活跃变更（全部已归档）。
## 杂项

- Github CLI: 不要用 `\` 转义.
