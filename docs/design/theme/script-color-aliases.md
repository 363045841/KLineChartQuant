# 脚本颜色别名（scriptPalette）

## 问题

`plot-contracts` 的 `Color` 枚举原先写的是固定色值，取自 Material Design 400 色阶。
这套值是为深色画布挑的：在 `#151619` 上全部达标，但在浅色画布 `#F5F5F7` 上
18 个色相里有 12 个低于 WCAG 非文字阈值 3:1，`Color.Yellow` 只有 1.09:1，
`Color.White` 同样是 1.09:1 —— 实际效果是「同一份脚本，暗色能看，亮色几乎看不见」。

## 为什么不是两套枚举

让脚本按主题挑枚举在这个架构里必然错：

- 指标结果只重投影、不重跑。`ChartIndicatorManager.reprojectRenderStates` 复用
  `resultPool` 里的计算结果，主题切换只换渲染状态的配色。
- 脚本没有主题输入。要给就得往 VM 注入主题，等于把对比度责任推给每个脚本作者。

所以主题不能在脚本层决定，只能在宿主解析颜色的那一刻决定。

## 分层

| 层 | 位置 | 负责 |
| --- | --- | --- |
| 契约 | `packages/plot-contracts/src/color.ts` | 别名是什么：`Color.Red = '@red'`、别名清单、`parseScriptColor` |
| 语义 | `packages/core/src/foundation/tokens/` | 别名是什么颜色：主题的 `colors.scriptPalette` |
| 解释 | `packages/core/src/foundation/tokens/scriptColorResolver.ts` | 把别名 + alpha 换成当前主题色值 |

别名集合从 `Color` 的取值派生（`@` 前缀去掉），`ScriptColorPalette` 的类型是
`Record<ScriptColorAlias, ColorValue>`：契约增删别名时，两个主题的 tokens 缺键或多键
都会编译失败。18 个主题色别名的色值只写在 DTCG 源
（`dtcg/scheme/{light,dark}.tokens.json`），由 `pnpm tokens:build` 生成到
`theme-{light,dark}.ts`，并自动进入 `contrastAudit` 的配对门禁。

`Color.White` / `Color.Black` 保持绝对色：它们用于标签文字和彩色底块上的叠加，
语义上就不该随主题变，因此不是别名，也不参与解析。

## 约定

- 只有以 `@` 开头的值走主题解析，其余字符串一律按 CSS 颜色直传。
  旧脚本里的十六进制、`rgba(...)`、命名色全部继续有效。
- alpha 用拼接表达：`Color.Teal + '80'` → `@teal80`。别名只含字母、alpha 只含
  十六进制数字，所以从末尾裁两位就能唯一还原别名。
- 未知别名抛 `TypeError`，不退化成透明或默认色。

## 唯一的解析点

解析发生在「契约数据 → 渲染状态」的投影处，渲染器永远见不到 `@`：

- 绘图：`projectPlots` 的集合分支（`readCollectionPlots`），颜色、逐 bar 颜色、
  箭头方向色、填充色一次换完。
- 图元：`projectDrawingsForFrame`，逐图元解析 `DrawingStyle` 的 `stroke` /
  `fill` / `textColor`；用户手绘的十六进制颜色原样透传。

不要在 `rendering/primitives/impl/colors.ts` 的 `createColorResolver` 里解析：
它按字符串缓存 RGBA，且 preparer 只创建一次，换主题会拿到旧值。

## 失效与缓存

- 绘图：`ChartIndicatorManager` 以 `ColorTokens` 的引用为投影身份，主题变化即重投影。
- 图元：图元层原本只在文档或选中变化时重绘，因此在 `ChartRenderer` 的
  `drawingVersion` 里加入 `theme$`、`isAsiaMarket`、`colorPresetSettings`，
  让主题切换也使图元层失效。

## 对比度

- 浅色别名按 3.8:1 起调，深色别名按 6.2:1 起调，留出预设画布差异的余量
  （预设里最亮的深色画布 `#17201E`、最暗的浅色画布 `#F0F2F5` 仍 ≥ 3:1）。
- `contrastAudit` 为每个别名声明
  `ui('colors.scriptPalette.<alias>', 'colors.chartBackground')`，新别名漏掉时会
  被门禁与类型同时发现。

## 已知边界

- 落盘的图元保存的是别名本身（如 `@red`），导出/导入对它按字符串处理；
  用户手绘与旧数据里的 CSS 颜色不受影响。
- 图元样式编辑器读取的是原始字符串，别名的色块预览不在这一层解决——
  脚本创建的图元不进入选中/编辑链路，不涉及该入口。
