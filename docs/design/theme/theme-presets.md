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

## 五种风格

| 风格 | 视觉策略 |
| --- | --- |
| Pro | 原版深浅主题，原始数据层级不变 |
| Exchange | 黑灰分层表面、独立琥珀强调色 |
| Terminal | 冷灰面板、高对比边框与文字、琥珀强调 |
| Zen | 灰绿表面、极弱网格、低饱和强调色 |
| Quant | 蓝紫研究界面、已有十色分类色盘映射到 MA/BOLL 等指标 |

涨跌、成交量与收益颜色继承原版基底；品牌强调色不作为上涨或下跌颜色。十色分类色盘不重新发明，未覆盖指标继续复用原有 Token。

## UI 与验证

设置入口位于“样式 / 颜色”，与现有市场方向开关相邻。选择只更新弹窗草稿，确认通过既有持久化和 Controller 快照更新生效，取消不保存。卡片随明确的明暗偏好展示；auto 模式卡片使用深色缩略样式，实际图表继续跟随系统。

BaseButton、BaseTabs、Dropdown 和设置行消费现有间距、字号、动效 Token，主题选择面板也使用同一套间距和字体 Token。旧组件和 Canvas 字号尚未全部接入密度 Token。

测试覆盖五风格 × 两种明暗 × 两种市场方向、序列化恢复、用户覆盖优先级、基底不被污染、间距/字号/动效不被预设改写、未知预设过滤和独立偏好保留；浏览器验证实际图表、设置选择、取消与刷新恢复。

本次不包含自定义取色器工作台、数据源配置或模型代理配置。
