# 主题预设

## 范围

提供 Pro、Exchange、Terminal、Zen、Quant 五种风格。Pro Dark 完整复用项目原有 darkTheme，作为无历史偏好时的默认基底；Pro Light 沿用原有浅色基础。

五种风格均提供 Light / Dark 变体，避免切换风格强行修改明暗偏好。Terminal 以 Dark 为主要使用场景，Light 保证现有明暗开关可独立使用。Paper 和 Midnight 不另建风格标识。

本轮只覆盖颜色：共享控件间距、字号、字族和动效一律沿用基础主题，预设不得改动它们。主题不会增删指标、折叠功能、创建订单簿或改变工作区布局；文档中的 Research Layout、Progressive Disclosure 属于后续产品能力。

## 独立维度与单一数据源

- `settings.theme`：继续使用 `light | dark | auto`，不改名。默认值改为 `dark`，已有用户的明暗偏好照常读取。
- `settings.isAsiaMarket`：继续使用现有红涨绿跌开关，风格选择不读取它来决定选中状态，也不写入它。
- `settings.colorPresetSettings.preset`：保存视觉风格标识；省略时为 Pro。
- `settings.colorPresetSettings.light/dark`：沿用现有用户颜色覆盖，切换风格不清空覆盖。

预设使用 `presets/types.ts` 的契约，`impl` 生成变体。全部颜色收归 Core Token。UI 不持有主题色表，不增加持久化键或影子主题状态。

解析流程：`原有明暗基底 → 风格变体 → 现有市场约定 → 用户覆盖`。

`resolveTheme` 返回完整 Theme，`resolveThemeColors` 保留原渲染器接口并复用同一解析流程；`themeToCssVars` 照常输出间距、字体、动效 Token，但这些取值始终来自基础主题，不由风格预设改写。Tooltip 和颜色编辑器同样使用最终颜色。

## 交互浮层取色

预设改写的是画布与界面表面，不改变交互浮层的语义：十字线标签（右轴价签、底轴时间签、副图指标价签）在浅色下是“前景底 + 背景字”，深色下是“控件底 + 前景字”，两种模式都是暗底浅字。深色下不得把标签反相成近白底块——基础深色主题已经用中灰控件底规避轴上的刺眼亮块，预设必须沿同一规则，否则同一张图换个风格就出现白色药丸。

## 五种风格

| 风格 | 视觉策略 |
| --- | --- |
| Pro | 原版深浅主题，原始数据层级不变 |
| Exchange | 黑灰分层表面；深色保留琥珀强调，浅色与 Pro 共用墨黑交互强调 |
| Terminal | 冷灰面板、高对比边框与文字、琥珀强调 |
| Zen | 灰绿表面、极弱网格、低饱和强调色 |
| Quant | 蓝紫研究界面、已有十色分类色盘映射到 MA/BOLL 等指标 |

涨跌、成交量与收益颜色继承原版基底；品牌强调色不作为上涨或下跌颜色。十色分类色盘不重新发明，未覆盖指标继续复用原有 Token。

## 表层角色的派生关系

浅色把 chrome、提示、输入三档压成同一个中性色，靠 1px 边线分层；深色这些角色必须分开才看得见，
所以浅色值固定、深色值从预设色表派生：

| 角色 | 浅色 | 深色 |
| --- | --- | --- |
| `ui.surface` 内容面（弹窗、编辑区、卡片底） | 各预设的浅色表面 | 预设 `surface` |
| `ui.surroundBackground` chrome（标题栏、工具栏、侧边栏、面板外壳） | 固定 `#F7F7F7` | 预设 `surface` |
| `ui.noticeBackground` 提示与说明块 | 固定 `#F7F7F7` | 预设 `controlBackground` |
| `ui.inputBackground` 输入区与组合式输入框 | 固定 `#F7F7F7` | 预设 `controlBackground` |
| `ui.popover` 浮层菜单与弹层 | 固定 `#FFFFFF` | 预设 `card` |
| `color.chartNavigationBackground` 图表浮层控件底 | 固定 `#F9F9F9` | 预设 `controlBackground` |
| `agent.composer*` Agent 输入区与控件 | 固定浅色中性档 | 预设 `card` / `controlBackground` / `hover` |
| `ui.tabActiveBackground` 活动标签填充 | 与标题栏同色 | 与标题栏同色 |

约束：

- **预设不改写正文颜色**：`ui.text` / `ui.textSoft` / `ui.muted` / `ui.secondaryButtonText` / `foreground` 与 `text.*` 一律沿用模式基色
  （浅色 `#313131` / `#666666`，深色 `#DCE0E8` / `#ACB2BE`），换预设不改变正文与辅助文字的色相。
  图表内容色（轴文字、十字线标签、tooltip 文字）仍在各自色板里，跟随预设。
- 深色不能沿用浅色的常量，必须由预设派生；DTCG 侧改 `preset/visual-mapping.tokens.json`，
  运行时侧同步 `createVisualTheme()`，`pipeline.test.ts` 会校验两侧一致；`themePresets.test.ts` 守住正文色不随预设漂移。
- 一个区域只画一层底色：父级画了，子级保持透明（模态搜索条整条透明、只用下边线分隔；
  活动标签填充取 `ui.tabActiveBackground`，与标题栏同色，边界由栏内 SVG 轮廓负责）。
- 图例遮罩 `color.legendBackground` = 画布色 + 80% 不透明（`chartBackground` 的 `0xCC` 版本），
  由图例渲染器直接消费；组件不再用 `color-mix` 现算半透明底。
- 组件里不写 `light-dark()`，也不用 `[data-theme='dark']` 补丁补色差；模式差异只能落在 Token 关系里。

## UI 与验证

设置入口位于“样式 / 颜色”，与现有市场方向开关相邻。选择只更新弹窗草稿，确认通过既有持久化和 Controller 快照更新生效，取消不保存。卡片随明确的明暗偏好展示；auto 模式卡片使用深色缩略样式，实际图表继续跟随系统。

BaseButton、BaseTabs、DropMenu 和设置行消费现有间距、字号、动效 Token，主题选择面板也使用同一套间距和字体 Token。旧组件和 Canvas 字号尚未全部接入密度 Token。

测试覆盖五风格 × 两种明暗 × 两种市场方向、序列化恢复、用户覆盖优先级、基底不被污染、间距/字号/动效不被预设改写、未知预设过滤和独立偏好保留；浏览器验证实际图表、设置选择、取消与刷新恢复。

本次不包含自定义取色器工作台、数据源配置或模型代理配置。
