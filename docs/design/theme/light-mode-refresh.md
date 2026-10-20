# 浅色模式 Token 刷新

## 背景

Issue #322 指出浅色模式颜色 Token 长期未维护，需要与夜间模式建立同一套语义层级。实现前先复核了 2026 年产品界面趋势和前端 Token 工程实践，结论是：

- 高频数据产品正在从高装饰、强渐变和泛化卡片布局，回到 calm interface：低视觉噪声、强信息层级、清晰边界和克制动效。
- a16z 系产品的可借鉴部分是 editorial restraint，而不是品牌橙色：near-black 正文、带轻微色相的 off-white 表面、细边框、有限强调色、弱阴影。
- 交易界面需要比营销页面更偏 utilitarian：网格、数字、状态和操作优先，装饰不得与行情争夺注意力。
- 色彩系统采用 DTCG 单一源、primitive / semantic / component 分层，并把明暗语义组合纳入自动对比度校验。
- WCAG 2.2 AA 是硬门槛：正文 4.5:1，UI 边界和图形 3:1；APCA 仅作建议。

参考：

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [DTCG Design Tokens Format 2025.10](https://www.designtokens.org/tr/2025.10/format/)
- [Radix Colors scale composition](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- [Vercel Geist Colors](https://vercel.com/geist/colors)
- [a16z](https://a16z.com/)

## 设计决策

浅色模式采用“纸面背景 + 近白外壳 + 石墨文字”的三级表面，不再让图表背景、工具栏和弹窗都停留在同一亮度。每个预设保留原有色相性格，但共享以下规则：

| 语义 | 规则 |
| --- | --- |
| `background` | 图表与页面底层，亮度最低并带轻微材质色相 |
| `surface` | 工具栏、弹层和弹窗，高于页面一层 |
| `card` | 分组内容和 Agent 消息表面，与 `surface` 明确区分 |
| `controlBackground` | 控件轻填充，不使用纯白 |
| `border` | 发丝边界，只承担分隔 |
| `borderStrong` | 交互边界和 tooltip 外框，满足 3:1 |
| `text` / `textSoft` / `muted` | 近黑正文、次级说明、辅助元数据，按信息优先级递减 |
| `accent` | 低饱和业务强调色，只用于选中、焦点和关键操作 |

五个预设的浅色表面阶梯：

| 预设 | background | surface | card | control / input |
| --- | --- | --- | --- | --- |
| Pro | `#F4F2EC` | `#FBFAF6` | `#FFFFFF` | `#EDEAE3` / `#F0EDE6` |
| Exchange | `#F7F5EE` | `#FCFBF7` | `#F0ECE3` | `#EFEAE0` |
| Terminal | `#F0F2F5` | `#FAFBFC` | `#E8ECF1` | `#E7EBF0` |
| Zen | `#F5F6F1` | `#FBFCF8` | `#EEF1E8` | `#ECEFE5` |
| Quant | `#F5F6FA` | `#FCFCFE` | `#EDEFF7` | `#EAEDF5` |

Pro 从旧冷灰 `#F5F5F7` 调整为暖纸面，其他预设同步收窄过度明亮的白色面积。`borderStrong`、`warningText`、次级按钮文字和品牌链接文字按实际背景重新测量，不做只追求“刚好过线”的微调。

涨跌色、成交量色和指标分类色保持不变。浅色蜡烛色在新背景上仍满足非文字 3:1；本次不重新定义行情语义色。

## 可访问性结果

`pnpm tokens:contrast` 覆盖 5 个预设 × 明暗 × 绿涨/红涨，共 540 组检查。刷新后：

- 浅色模式 WCAG AA 失败从 26 组降为 0。
- 全量剩余 6 组失败均位于深色模式，属于既有基线；本次不修改深色 Token。
- Pro 的 `textSoft`、全部预设的 `warningText`、浅色 `borderStrong`、Zen/Quant 次级按钮文字，以及 Terminal 背景上的品牌链接文字均已通过。
- APCA 继续作为建议指标输出，不进入 CI 硬门槛。

## 工程边界

- 只修改 DTCG 源：`scheme/light.tokens.json` 与四个 preset 的 `light.visual.*`。
- TS、CSS 和预设映射由 `pnpm tokens:build` 生成，禁止手改。
- 组件继续消费 `--klc-color-ui-*` / `--klc-color-*`，不增加局部颜色或预设判断。
- 深色 Token 不变；组件层只修正视觉层级与交互反馈，不改变业务行为。
- `contrast-known-failures.json` 仅保留仍存在的深色失败，浅色失败不得重新进入已知清单。

## 组件层锐度修正

颜色刷新只解决表面层级，无法消除旧组件中的松散间距、胶囊按钮和多处分隔线。本批次在不改 Canvas、渲染器和业务契约的前提下，补一组面向图表工作台的视觉修正：

- 顶部命令栏以当前标的为 13px 主层级，周期、复权、图表类型保持 12px 上下文层级；控件统一为 32px 高、4px 圆角，并只在不同语义组之间保留分隔线。
- 共用按钮、左侧工具轨和 Agent 图标按钮统一消费 density、space、radius、text Token；焦点态改为内嵌 2px 实线轮廓，避免阴影式焦点在浅色表面上发虚。
- 左侧工具轨收紧为 48px，选中态使用无边框的高对比反色块，悬浮态只保留轻填充；下拉菜单取消 blur，改用实色 card 与 elevation Token。
- Agent 空状态从居中的营销式胶囊按钮改为左对齐的操作清单，用行分隔和方向箭头建立可扫描层级；Agent 面板增加明确的图表侧边界。

这些改动只消费现有 Token，不新增硬编码颜色，也不引入新的交互模式。

## 验证

```bash
pnpm tokens:build
pnpm tokens:check
pnpm tokens:contrast
pnpm test:unit -- packages/core/src/foundation/tokens
pnpm lint
pnpm type-check
```

浏览器人工检查覆盖：Pro/Exchange/Terminal/Zen/Quant 浅色图表、顶部工具栏、左侧工具栏、设置弹窗、主题卡片、下拉菜单、Tooltip、焦点态和 Agent 面板。
