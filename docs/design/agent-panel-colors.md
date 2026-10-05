# 图表与 Agent 共用界面配色

`interface-colors.ts` 是默认深浅界面配色的唯一来源。图表画布、坐标轴、浮层、工具栏、自选股与 Agent 的通用表面、控件、边框和文字共用这套 Token。Agent 工作区将 `--klc-color-ui-*` 映射成 `--agent-*`；不再保存重复的面板配色。

深色界面参考冷黑工作台：主背景 `#151619`、栏位 `#191A1E`、卡片 `#1D1F24` 逐级提亮，网格与边框采用较弱的冷灰。控件使用轻填充，选中和焦点使用柔和的钢灰强调；行情与指标保留数据颜色。浅色主题使用对应的白灰层次。

Composer 输入框使用独立的语义颜色 `colors.agent.composerInputBackground`，避免调整通用 `ui.input` 时影响其他表单控件。

Composer 的深色输入框复用界面卡片底色 `#1D1F24`，略亮于面板背景，避免大面积亮灰显得突兀；浅色采用白色。专属语义 Token 保留，现有 `themeToCssVars` 自动生成 `--klc-color-agent-composer-input-background`，Vue 的 `.composer__textarea` 直接消费该变量。

消息编辑框继续使用透明背景，不消费这个 Token。

Composer 的模型和思考力度按钮共同消费 `composerControlBackground` 与 `composerControlHover`，深色主题复用通用控件底色 `#27292E` 和悬停色 `#2D3036`，略亮于输入框，保持统一的冷灰层次与交互样式。

只读开关通过共享 ToggleSwitch 的颜色变量消费工作区配色；其他使用 ToggleSwitch 的界面沿用默认主题。警告与错误继续使用对应的状态色。
