# 设计 Token v2

## 范围

Token 源改为 DTCG 2025.10 JSON，经 Style Dictionary v5 生成现有的 TS Theme 与 `--klc-*` CSS 变量；在 Theme 之外新增一层与框架无关的基础 Token（圆角、字阶、间距、密度、阴影层级、动效、层级、断点、品牌强调色）。

- Theme 层（`lightTheme` / `darkTheme` / 五种预设）的取值不变：生成结果与迁移前逐字节一致，`baseline.test.ts.snap` 未改动。
- 渲染器不受影响：`engine/renderers`、`engine/scale`、`controllers`、`fonts.ts` 无改动（ADR 0005、0008）。
- 本阶段不迁移组件（Phase 2），也不应用重新生成的预设色板（Phase 3）。

## 源与构建

```
packages/core/src/foundation/tokens/dtcg/
  kcq.resolver.json            DTCG Resolver Module 2025.10：sets + modifiers（preset × mode）
  foundation/*.tokens.json     与 mode、preset 无关：旧 Theme 族 + v2 基础 Token
  scheme/{light,dark}.tokens.json  Pro 基底，按 light.* / dark.* 分支并存
  preset/*.tokens.json         预设覆盖；visual-mapping 对应 createVisualTheme 的映射
  mode/{light,dark}.tokens.json    生成的选择器：把选中分支别名到公开名称（勿手改）
```

解析顺序为 `foundation → scheme → preset → mode`。别名在全部源合并后统一解析（Resolver 规范要求），所以预设可以同时覆盖两种 mode，而两个 modifier 互不依赖。

Style Dictionary 尚未支持 Resolver（style-dictionary#1590），由 `packages/core/scripts/tokens/build.mjs` 枚举 10 个排列，每个排列交给 Style Dictionary 做别名解析与 DTCG → CSS 值转换。

| 命令 | 作用 |
| --- | --- |
| `pnpm tokens:build` | 写入全部生成文件 |
| `pnpm tokens:check` | 只校验；与磁盘不一致时退出码 1（`pipeline.test.ts` 也会执行） |

生成物：

| 文件 | 内容 |
| --- | --- |
| `theme-base.ts`、`interface-colors.ts`、`theme-light.ts`、`theme-dark.ts`、`presets/impl/visualPalettes.ts` | 既有 Theme 源文件，现由 DTCG 生成 |
| `foundation.ts` | v2 基础 Token（`lightFoundation` / `darkFoundation` / `foundationTokens`） |
| `packages/core/design-tokens/css/theme.<preset>.<mode>.css` | 每个排列的 Theme 层 `--klc-*`，与运行时 `themeToCssVars` 逐字节一致 |
| `packages/core/design-tokens/css/foundation.css` | 基础 Token：`:root` + `[data-theme='light'/'dark']` |
| `packages/core/design-tokens/dtcg/kcq.bundle.resolver.json` | 内联全部源的单文件解析器，供 nebutra-sailor 等外部消费 |

`rgba()`、`hsl()`、`transparent` 这类无法由 hex 还原的原文写入 `$extensions["io.github.363045841.kcq"].css`，保证逐字节输出。em 字距用 `number` + `$extensions[…].unit = "em"` 表达（DTCG dimension 只允许 px/rem）；`tabular-nums` 这类 CSS 关键字放在分组的 `$extensions[…].keywords`（DTCG 没有关键字类型）。

## 消费

- **Vue / 运行时**：`resolveTheme(mode, …)` 返回的 Theme 带 `foundation`；`useChartTheme` 经 `themeToCssVars` 把它们与颜色一起挂到图表根节点。`lightTheme` / `darkTheme` 本身不带 `foundation`，输出保持冻结基线。
- **静态 CSS**：引入 `design-tokens/css/foundation.css`；明暗块按 `data-theme` 选择（与 `KLineChart.vue` 根节点一致）。
- **TS**：`import { foundationTokens } from '@363045841yyt/klinechart-core'`，类型 `FoundationTokens`（`Theme.foundation` 为可选字段，手写 Theme 无需补齐）。

命名规则：路径逐段 kebab 化后用 `-` 连接，`radius.sm` → `--klc-radius-sm`，`text.label.13.fontSize` → `--klc-text-label-13-font-size`。

## Token 清单

每个取值的依据写在 DTCG `$description` 中；研究未直接给出的值标注 `[derived]` 并说明推导。

| 组 | 变量 | 取值 | 依据 |
| --- | --- | --- | --- |
| 圆角 | `--klc-radius-{0,xs,sm,md,lg,xl,full}` | 0 / 4 / 6 / 8 / 12 / 16 / 9999px | craft-principles §4.1；xs 为同心推导 6−2 [derived] |
| 字阶 | `--klc-text-{12,13,14,16,20,24,32,48,72}-{font-size,line-height,letter-spacing,font-weight}` | 见 §4.2 表；12–16 行高 [derived] | §4.2；10px 移除 |
| 等宽 | `--klc-text-11-mono-*` | 11/16，仅限等宽/表格数字 | §4.2、design §3.3 |
| 角色 | `--klc-text-label-{12,13,14,16,20}-*`、`--klc-text-copy-{13,14,16,20,24}-*` | 引用字阶；label ≤16 字重 500 [derived] | CP 18（Geist Label / Copy） |
| 数字 | `--klc-text-numeric` | `tabular-nums` | CP 19、ADR 0004 |
| 间距 | `--klc-space-{2…160}` | Carbon 2–160 | §4.3（S28） |
| 密度 | `--klc-density-{compact,default,comfortable,touch,hit-target,hit-target-touch}` | 24 / 32 / 40 / 48 / 24 / 44 | §4.3、CP 27 |
| 阴影 | `--klc-elevation-{1,2,3,hairline}` | 浅色：阴影 + hairline；深色：表面提亮为主、软阴影 [derived 透明度] | §4.4 |
| 动效 | `--klc-motion-ease-{out,in-out,drawer,expo}`、`--klc-motion-dur-{0,press,fast,base,slow,sheet,toast}`、`--klc-motion-{stagger,loader-delay,loader-min}` | §4.5；slow 260 [derived] | §4.5 |
| 行情闪烁 | `--klc-motion-flash` / `--klc-motion-fade` | 500ms / 1000ms，减少动效时关闭 | design §3.3 |
| 层级 | `--klc-z-index-{base,chart-overlay,sticky,dropdown,popover,modal,toast,tooltip}` | 0 / 10 / 100 / 1000 / 1010 / 1100 / 1150 / 1200 | 顺序来自 design §3.3；数值锚定现有用法 [derived] |
| 断点 | `--klc-breakpoint-{sm,md,lg,xl}` | 640 / 768 / 1024 / 1280 | design §3.3（项目自定） |
| 品牌 | `--klc-brand-accent`、`--klc-brand-accent-text` | `#4C77C6`；文字 `#537ECD`（深）/ `#456FBD`（浅） | ADR 0007 |

旧的 `--klc-spacing-*`、`--klc-typography-*`、`--klc-motion-duration-*` / `-easing-*` 保留原值；新动效使用 `dur-*` / `ease-*`，名称不冲突。

## 调色板生成器（仅提案）

`pnpm tokens:palettes` 读取每个 preset × mode 当前解析出的输入，在 OKLCH 中生成 Radix 12 级语义阶梯（CP 1、CP 4；culori），写入 `design-tokens/proposals/palettes.{json,md}`。运行时主题不读取这些文件，Canvas 颜色不变；接入属于 Phase 3。

- 输入：`base`（`color.ui.background`）、`accent`（`color.ui.accent`）、`contrast`（默认 1）、`neutralTint`（`accent` | `pure`，design §4 契约）。另以品牌色、涨跌色、warning、danger 为锚点生成彩色阶梯。
- 轮廓：明度 / 彩度轮廓取自 `@radix-ui/colors@3.0.0` 的 gray / blue（明暗各一套，值内置于 `scripts/tokens/lib/radix-reference.mjs`）。step 1 = base，step 9 = 锚点，11/12 外推到 step 2 上 APCA Lc 60 / 90（Radix 的保证）且 WCAG ≥ 4.5:1。插值方式与 `neutralTint` 提案规则为 [derived]，记录在 `palettes.json` 的 `method` 中。
- 报告附每个提案的 WCAG / APCA 检查。当前唯一未通过的是作为输入的浅色 warning `#C58A1A`（step 9 在 2.67–2.86:1），留给 Phase 3。

## 对比度门槛

- `contrastGate.test.ts`（随 core 的 `pnpm test` 运行）：对 5 个预设 × 明暗 × 涨跌约定（绿涨 / 红涨）共 20 个组合、每个组合 27 组声明的前景 / 背景对执行 WCAG 2 AA：文字 4.5:1，组件与图形 3:1。半透明颜色先按浏览器的方式与底色合成再计算。
- 当前色板已有不达标项，记录在 `__tests__/contrast-known-failures.json`；测试只在出现新的失败或已知失败进一步变差时报错。涨跌颜色不允许进入已知清单。
- `pnpm tokens:contrast` 生成 `design-tokens/reports/contrast.{md,json}`，其中 APCA 仅作建议（文字 |Lc| ≥ 60、组件 ≥ 45，约等于 4.5:1 / 3:1）。APCA 仍是 beta 且许可证非 OSI，因此不作为门槛；`apca-w3` 依赖 AGPL 的 `colorparsley`，所以改用 colorjs.io（MIT）的 APCA 实现。
- 只有在评审接受后才运行 `pnpm tokens:contrast --update-known` 重写已知清单。

## 不变量与测试

- `pipeline.test.ts`：生成文件与源同步；每个 preset × mode 的 Theme CSS 与 `themeToCssVars(resolveTheme(…))` 逐字节一致，DTCG 中的预设映射与 `createVisualTheme` 因此不会各自漂移；`foundation.css` 与运行时 foundation 变量一致；调色板提案与源同步。
- `foundation.test.ts`：锁定研究取值，并校验字距随字号收紧、同心圆角、层级单调、两种 mode 键集一致、品牌色在 Pro 表面满足 AA。
- `contrastGate.test.ts`：见上节。
- `baseline.test.ts.snap`：Theme 层快照，保持不变。

## 后续

- Phase 2：组件改用 `--klc-*`，stylelint 禁止原始值。
- Phase 3：`PresetPersonality`（预设的圆角 / 密度 / 阴影个性）与重新生成的色板接入，清空已知对比度失败。
