# 图表与 Agent 共用界面配色

`interface-colors.ts` 是默认深浅界面配色的唯一来源。图表画布、坐标轴、浮层、工具栏、自选股与 Agent 的通用表面、控件、边框和文字共用这套 Token。Agent 工作区将 `--klc-color-ui-*` 映射成 `--agent-*`；不再保存重复的面板配色。

深色界面参考冷黑工作台：主背景 `#151619`、栏位 `#191A1E`、卡片 `#1D1F24` 逐级提亮，网格与边框采用较弱的冷灰。控件使用轻填充，选中和焦点使用柔和的钢灰强调；行情与指标保留数据颜色。浅色主题使用对应的白灰层次。

Agent 面板的表面只有两个来源，都在 `packages/vue/src/features/agent/components/agent-surface.css`：`.agent-raised-surface`（抬升面：Composer 输入框、上下文胶囊、注入预览按钮）与 `.agent-bordered-surface`（描边面：提问卡这类信息块）。底色统一 `--klc-color-ui-card`、圆角统一取 `--agent-control-radius`（= `--klc-radius-md`）、抬升边缘取 `--klc-elevation-raised`，深色再叠 2% 顶部薄光。使用方只写布局与排版，不再出现“同一份材质抄四遍、其中一处还多一条 1px 边框”的情况。

该文件同时固定三条使用约定：一个浮层只有一层表面（内部内容不再加同类底色或阴影，否则会出现“同色叠两层、圆角处露出另一层”的假透明）；交互态用 `linear-gradient(hover, hover)` 叠加而不是直接改 `background`（否则半透明 hover 色会把不透明表面变成洞）；会遮住其它区域的浮层内容交给浮层原语承载，不塞进装饰性容器。

**圆角只有四档**：表面与控件 `--agent-control-radius`（8px）、微型元素 `--klc-radius-xs`（4px，行内代码、方形小图标按钮）、胶囊 `--klc-radius-full`、圆点 `50%`。历史遗留的 3 / 6 / 7 / 10px 已全部并入这四档——相差 2px 的“五档圆角”构不成层级，只是噪声。

**字号只走标度**：正文 13px（`--klc-text-copy-13-*`）、元信息 12px（`--klc-text-12-*`）、代码与工具元数据 11px 等宽（`--klc-text-11-mono-*`）。10 / 11 / 15 / 17px 这些标度外字号已并入，markdown 标题按 20 / 16 / 14 / 13 排序。

**共享几何只有一个声明点**：`.agent-workspace` 定义 `--agent-gutter`（12px 水平内衬）、`--agent-chip-height`（26px 控件高）、`--agent-bar-pad`（8px 栏内边距）与两个面板内层叠 `--agent-z-bar` / `--agent-z-drawer`；Composer、上下文条、时间线尾部预留都由它们推导，不再各写一份 12px / 26px / 60px。

原先为输入框单列的 `colors.agent.composerInputBackground` 已删除，输入框改用 `ui.card`：它在深浅两种模式下解析出的值与卡片色完全相同（浅色 `#FFFFFF`、深色 `#1D1F24`，五套风格也各自等于自己的 `card`），两个名字一份值是分层的反面教材。

深色输入区取该主题的卡片底色（Pro 为 `#1D1F24`，五套风格各自取自己预设的 `card`），比面板背景亮 2~3.7 L*，与面板内其他卡片同一级，避免大面积亮灰显得突兀；浅色采用白色。

抬升感来自 foundation 的 `--klc-elevation-raised`：顶部受光线 + 环 + 两层投影全部画在 `box-shadow` 里，不占布局，也比面板内的菜单（`--klc-elevation-2`）低一级。深色环是 3% 白内边——近黑底上一圈发亮的描边会发糊，层次交给底色台阶与外投影承担；浅色环是 0.5px 14% 黑外环，保持亚像素：整像素描边会读成“特意画上去的边框”。投影一律带负 spread（`-0.5px` / `-2px`）收进轮廓：spread 为 0 的大 blur 会向四周溢出成灰晕，再被 y 偏移压向下侧，看上去就像“阴影偏了”。

上下文栏悬浮在输入区上沿：自身透明、宽度随内容收缩，右侧空白不属于这一层，因此不需要 `pointer-events` 补丁；它不占时间线高度，时间线按 `--agent-chip-height` + 栏内边距推导出尾部预留空间。栏的高度因此是恒定的——注入内容预览是 `BasePopover` 浮层（自带定位、Esc 与点击外部收起、`popover-surface` 材质），不再就地展开在栏里，所以既不需要把展开态提升到栏上，也不需要为它动态预留高度。

消息编辑框继续使用透明背景，不消费这套表面材质。

Composer 的模型和思考力度按钮共同消费 `composerControlBackground` 与 `composerControlHover`，深色主题复用通用控件底色 `#27292E` 和悬停色 `#2D3036`，略亮于输入框，保持统一的冷灰层次与交互样式。

只读开关通过共享 ToggleSwitch 的颜色变量消费工作区配色；其他使用 ToggleSwitch 的界面沿用默认主题。警告与错误继续使用对应的状态色。
