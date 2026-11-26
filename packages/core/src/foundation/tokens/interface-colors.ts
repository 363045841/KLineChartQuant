// 生成文件：由 `pnpm tokens:build` 从 src/foundation/tokens/dtcg/scheme/{dark,light}.tokens.json 生成，请勿手改。
// 图表、工具栏与 Agent 共用的冷黑界面配色；控件轻填充，行情与指标承担主要色彩。
import type { UiColors } from './types.js'

export const darkInterfaceColors: UiColors = {
  background: '#151619',
  surface: '#191A1E',
  surroundBackground: '#191A1E', // 图表周围的工作区背景：标题栏、工具栏、侧边栏与面板外壳。
  tabActiveBackground: '#191A1E', // 活动标签的填充：与标题栏同色，边界只由栏内 SVG 轮廓负责。
  noticeBackground: '#27292E', // 一般提示与说明区域的背景，不表示警告、错误或交互强调。
  inputBackground: '#27292E', // 输入区域的常驻背景，包含组合式数值输入框。
  card: '#1D1F24',
  input: '#1B1D22',
  popover: '#1E2025', // 浮层菜单与弹层表面：比 input 抬高一级，避免在深色图表背景上失去层次。
  controlBackground: '#27292E',
  hover: '#2D3036',
  selected: '#25272D',
  brandSurface: '#35784A', // 深色主题的实心绿底：比浅色略亮，保证圆在深色栏上仍可见（约 3.2:1）。
  brandOn: '#FFFFFF', // 深色 brandSurface 上的白色折线，对容器约 5.4:1。
  highlight: '#FFFFFF1F', // 轻强调底：叠加在深色表面上，不随预设 accent 变化。
  selection: '#FFFFFF2E', // 文本选区底，比 highlight 强一档。
  focusRing: '#FFFFFF8C', // box-shadow 聚焦环：55% 白，对深色底满足非文本 3:1。
  border: '#2D3036',
  borderStrong: '#434752',
  text: '#DCE0E8',
  textSoft: '#838A98',
  muted: '#ACB2BE',
  accent: '#626D82',
  accentStrong: '#556179',
  focus: '#94A3BC',
  warningBackground: '#302717',
  warningBorder: '#8F681D',
  warningText: '#E6B85C',
  warningStrong: '#B9822B',
  dangerBackground: '#351D1F',
  dangerBorder: '#A94F55',
  dangerText: '#FF8585',
  success: '#45C58E',
  warning: '#F0B44C',
  danger: '#FF7373',
  neutral: '#838A98',
  onAccent: '#FFFFFF',
  secondaryButtonText: '#ACB2BE',
  switchOn: '#626D82', // 开关 on 态轨道：深色沿用交互灰蓝。
  switchOff: '#838A98', // 开关 off 态轨道：比描边更亮一档，保证白色圆钮与轨道、轨道与背景的对比。
  switchThumb: '#FFFFFF', // 开关圆钮：两个主题统一使用白色。
}

export const lightInterfaceColors: UiColors = {
  background: '#FFFFFF',
  surface: '#F9F9F9',
  surroundBackground: '#F7F7F7', // 图表周围的工作区背景：标题栏、工具栏、侧边栏与面板外壳。
  tabActiveBackground: '#F7F7F7', // 活动标签的填充：与标题栏同色，边界只由栏内 SVG 轮廓负责。
  noticeBackground: '#F7F7F7', // 一般提示与说明区域的背景，不表示警告、错误或交互强调。
  inputBackground: '#F7F7F7', // 输入区域的常驻背景，包含组合式数值输入框。
  card: '#FFFFFF',
  input: '#FFFFFF',
  popover: '#FFFFFF',
  controlBackground: '#F4F4F4',
  hover: '#0000000A', // 黑色 3.9%：叠在任意表面色上都成立，不随背景换配方（参考 Vercel Light 的 interactive.hover #0000000a）。
  selected: '#E4E4E4',
  brandSurface: '#2E6B3A', // 品牌标记的实心绿底；不透明度 100%，配白色折线。
  brandOn: '#FFFFFF', // 品牌标记容器上的图形色：纯白，对 #2E6B3A 约 8.4:1。
  highlight: '#0000001A', // 轻强调底：说明框、标签胶囊、悬停强调。中性透明层，不跟随各预设的 accent。
  selection: '#0000002E', // 文本选区底（编辑器 selection），比 highlight 强一档，仍保持中性。
  focusRing: '#1717178C', // box-shadow 聚焦环：55% 墨黑，对白底约 4:1，满足非文本 3:1；组件不得再用 accent 百分比现算。
  border: '#00000013', // 黑色 7.5%：中性描边，压在白底上接近 Vercel Light 的 interactive.border #00000013。
  borderStrong: '#8C8C8C',
  text: '#313131',
  textSoft: '#6C6C6C',
  muted: '#666666',
  accent: '#171717', // 浅色唯一的交互强调色取墨黑：交易界面里蓝色与涨跌色、状态色争夺注意力，改用灰阶深端做“墨”，白字 18.9:1。中间灰在近白底上会读作脏色，不用。
  accentStrong: '#000000', // accent 的悬停/按下阶，压到纯黑。
  focus: '#171717', // 焦点环与 accent 同色，靠 outline-offset 与元素分离；焦点不靠半透明自造。
  warningBackground: '#FFF8E8',
  warningBorder: '#D29A3A',
  warningText: '#AD7414',
  warningStrong: '#996311',
  dangerBackground: '#FFF1F1',
  dangerBorder: '#D56A6A',
  dangerText: '#C63F3F',
  success: '#16885A',
  warning: '#C58A1A',
  danger: '#D14B4B',
  neutral: '#666666',
  onAccent: '#FFFFFF',
  secondaryButtonText: '#666666',
  switchOn: '#666666', // 开关 on 态轨道：浅色使用中性灰，避免大面积墨黑压过内容。
  switchOff: '#8C8C8C', // 开关 off 态轨道：中性描边色，与白色圆钮保持非文本对比。
  switchThumb: '#FFFFFF', // 开关圆钮：两个主题统一使用白色。
}
