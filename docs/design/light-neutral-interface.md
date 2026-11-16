# 浅色界面：白底 + 黑色透明描边 + 墨黑强调

浅色 Pro 主题的强调色原先取中间灰 `#5A5A5A`：它既不是底色，也不是实心强调色。
22% 透明度叠在近白表面上得到接近 `#D8D8D8` 的水泥灰，导致工具栏、选中态、聚焦环、
说明框和品牌图标全部发脏；深色主题因为底色近黑，同一中间调反而成立，所以问题只在浅色出现。

重组同时确立一条交易界面约束：**交互强调不使用蓝色系**。
蓝色与涨跌红绿、警示橙、信息蓝争夺注意力，在长时间盯盘的界面里最刺眼；
强调色改用灰阶深端的墨黑，靠底色层次和实心块表达交互。

表面结构参考 OpenChamber 的 Vercel 浅色主题
（`packages/ui/src/lib/theme/themes/vercel-light.json`）：

- 表面用纯白 `#FFFFFF`，次级表面 `#F9F9F9`，控件底 `#F4F4F4`；不靠灰色块分层。
- 描边与 hover 用**黑色透明**（`#00000013` / `#0000000A`），叠在任何表面色上都成立，
  不需要为白色、次级表面各写一套灰色。
- 选中态是中性 `#E4E4E4`，文字/图标用墨黑，而不是彩色底块。

## Token 取值

颜色在 `dtcg/scheme/light.tokens.json` 中维护，使用 `pnpm tokens:build` 生成运行时 Token。
Exchange 浅色主题的强调色与 Pro 同源，其余表面沿用自身的分层中性灰。

| role | 值 | 对应 Vercel Light / 说明 |
| --- | --- | --- |
| background / chartBackground | `#FFFFFF` | `surface.background`；K 线画布用纯白 |
| surface | `#F9F9F9` | `surface.muted`；内容面（弹窗、编辑区、卡片底） |
| surroundBackground | `#F7F7F7` | chrome：标题栏、工具栏、侧边栏与面板外壳 |
| noticeBackground / inputBackground | `#F7F7F7` | 提示说明块与输入区；深色按预设派生，见 `theme/theme-presets.md` |
| card / input / popover | `#FFFFFF` | 卡片、输入框、浮层 |
| controlBackground | `#F4F4F4` | `surface.elevated` |
| hover | `#0000000A` | `interactive.hover`，黑色 3.9% |
| selected | `#E4E4E4` | `interactive.selection` |
| highlight | `#0000001A` | 轻强调底：说明框、标签胶囊、悬停强调；中性透明层 |
| selection | `#0000002E` | 文本选区底（编辑器），比 highlight 强一档 |
| focusRing | `#1717178C` | box-shadow 聚焦环，55% 墨黑，约 4:1 |
| border | `#00000013` | `interactive.border`，黑色 7.5% |
| borderStrong | `#8C8C8C` | 强调描边，3.4:1，不低于非文本门槛 |
| text | `#313131` | `surface.foreground` |
| textSoft | `#6C6C6C` | 5.25:1；最浅的浅色背景上仍 4.7:1 |
| muted | `#666666` | `surface.mutedForeground`，5.7:1 |
| accent | `#171717` | 墨黑；白字 18.9:1，不使用蓝色系 |
| accentStrong | `#000000` | accent 的悬停/按下阶 |
| focus | `#171717` | 与 accent 同色，靠 `outline-offset` 分离 |
| selectionStroke / selectionFill | accent / accent 20% | 图表选区与界面强调色同源 |
| gridMajor / gridMinor | `#E8E8E8` / `#F2F2F2` | 画布网格 |
| crosshairLine | `#8C8C8C` | 3.4:1 |

## 约定

- 浅色交互强调用墨黑，不用蓝色系，也不使用 40%~60% 的中间灰压在半透明层上。
- 描边、悬停这类中性层用黑色透明，不做“每个表面一种灰”。
- 状态色由语义 Token 提供（`ui.selected`、`ui.highlight`、`ui.selection`、`ui.focusRing`、`ui.hover`、`ui.controlBackground`、`ui.focus`），
  组件不得再用 `color-mix(accent N%)` 自造选中态、聚焦态或说明框底色。
- `highlight` / `selection` / `focusRing` 是中性透明层，所有预设继承同一组值，不随各预设 accent 改变。
- 应用图标这类品牌标记使用实心绿底 + 白色折线（`ui.brandSurface` + `ui.brandOn`），不掺透明度：
  浅色 `#2E6B3A`、深色 `#35784A`，白线分别 8.4:1 / 5.4:1；叶绿色相避开行情青绿（`candleUpBody`）与 `ui.success`。
- 深色主题、行情方向色和其余命名风格预设保留各自定义。
