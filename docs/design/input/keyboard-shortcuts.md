# 键盘快捷键与视图命令

## 背景

命令注册表（`createCommandRegistry`）已提供命令定义、键位归一化、作用域与可用性门控；Vue 侧已有快捷键设置面板与 tooltip 快捷键展示。首屏仅注册了命令面板、撤回、重做三条命令，视图类操作没有快捷键。

本次为视图功能补齐 TradingView 风格的键位，并保持「UI 状态不进入 Core controller」的边界。

## 命令目录

新增命令集中在 `packages/vue/src/composables/commands/chartCommands.ts`：

| 命令 id | 键位 | 作用 |
| --- | --- | --- |
| `chart.snapshot` | `Alt+S` | 截图并下载 |
| `settings.open` | `Mod+,` | 打开设置（全局作用域） |
| `view.zoomIn` | `Mod+↑` | 放大一级 |
| `view.zoomOut` | `Mod+↓` | 缩小一级 |
| `view.moveLeft` | `←` | 左移一根 K 线 |
| `view.moveRight` | `→` | 右移一根 K 线 |
| `view.reset` | `Alt+R` | 重置视图 |
| `view.fullscreen` | `Shift+F` | 切换全屏 |

`Mod` 令牌由快捷键注册表按平台归一化（macOS 为 ⌘，其余含 Windows 为 Ctrl）。裸方向键与 `Alt`/`Shift` 组合依赖命令作用域：快捷键默认只在焦点位于图表根元素内时生效，且输入控件内默认不触发。

## Core 能力

视图命令直接调用 controller 上已有或新增的动作，不另起实现。

- `zoomIn` / `zoomOut` 复用 `Chart.zoom`。
- 逐根平移新增 `Chart.scrollByBars(bars)`：读取当前视图快照的槽位网格 `grid.step`，在 `scrollBounds` 内按整根位移提交，并停止惯性。
- 重置新增 `Chart.resetChart()`：恢复到创建时配置的初始缩放级别（`Chart` 持有的 `initialZoomLevel`），再清除主图价格轴的手动范围。语义对齐 TradingView 的 Reset chart。

`scrollByBars` 只消费现有视口 SSOT（`viewSnapshot` 的 `grid` / `scrollBounds` / `capabilities`），不引入第二份滚动状态；分时等不允许水平平移的视图由 `capabilities.allowPan` 直接拒绝。

## 宿主能力边界

全屏是图表容器的 UI 状态，不进入 Core controller。`ChartCommandHost` 增加 `toggleFullscreen`，由 `KLineChart.vue` 注入既有 `handleToggleFullscreen`（受控与非受控模式统一走该入口）。controller 上已有动作的命令不需要扩展 host。

## tooltip 展示

按钮的快捷提示沿用 `BaseTooltip` 的 `command` 属性：传入命令 id 后，提示自动追加该命令的首个快捷键（`primaryShortcut` + 平台化格式化），与撤回 / 重做按钮同一机制。放大 / 缩小（`LeftToolbar`）、全屏与设置（`TopToolbar`）按钮直接绑定对应命令；截图入口是 `DropMenu`，为其增加可选 `command` 属性并透传给内部 tooltip。仅键盘与命令面板可达的 `view.moveLeft` / `view.moveRight` / `view.reset` 没有对应按钮，不额外造按钮。

## 标点键与 IME

中文输入法组合态下，标点键的 `KeyboardEvent.key` 会退化为 `'Process'` 或全角字符，导致 `Ctrl+,` 这类标点快捷键按 `key` 匹配失败。修正分两处：

- 快捷键注册表在 `key` 不匹配时，对单个标点额外用物理 `event.code`（如 `Comma`）兜底；仅当 `key` 不是可打印 ASCII 时启用，避免 `Ctrl+Shift+,` 误命中 `Ctrl+,`。
- Vue 页面级 keydown 桥在 `isComposing` 时仍放行带 Ctrl / ⌘ / Alt 的组合，只阻断纯文本输入。

## 手动验证

聚焦图表后：`Ctrl+↑`/`Ctrl+↓` 缩放一档；`←`/`→` 整根平移且到边界停住；`Alt+R` 恢复初始缩放级别并复位价格轴；`Shift+F` 切换全屏；`Alt+S` 截图下载；`Ctrl+,` 打开设置。分时视图下方向键与缩放不产生位移。放大 / 缩小 / 全屏 / 设置按钮悬停时提示显示对应快捷键，截图下拉入口同样在提示中展示快捷键。
