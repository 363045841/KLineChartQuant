// 色板使用固定的色彩空间端点，独立于界面主题的深浅配色。
export const COLOR_PICKER_CSS_VARS = {
  '--klc-color-picker-white': '#ffffff',
  '--klc-color-picker-black': '#000000',
  '--klc-color-picker-spectrum':
    'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
} as const
