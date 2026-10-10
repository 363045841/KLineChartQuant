// 本文件定义 Agent 绘图工具允许使用的低刺激颜色令牌。

/** Agent 绘图颜色的有限集合，避开 K 线使用的红色与绿色。 */
export const AGENT_DRAWING_COLOR_VALUES = [
  '#4A90D9', // 柔和蓝
  '#7C6FCD', // 柔和靛紫
  '#C08457', // 柔和棕橙
  '#8B5E83', // 柔和灰紫
  '#9CA3AF', // 中性灰
] as const
