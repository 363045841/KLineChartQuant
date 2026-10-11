// Radix Colors 3.0.0 参考阶梯（MIT），取自 npm 包 @radix-ui/colors@3.0.0 的 index.js。
// 只用作 12 级阶梯的明度 / 彩度轮廓，不直接输出这些颜色。
// 语义（S20）：1 应用背景、2 次级背景、3–5 组件背景（常态/悬停/按下）、6–8 边框（分隔/控件/悬停）、
// 9–10 实色（常态/悬停）、11 低对比文字、12 高对比文字；11/12 在 step 2 上保证 APCA Lc 60 / 90。

export const RADIX_SOURCE = '@radix-ui/colors@3.0.0 (MIT): gray, grayDark, blue, blueDark'

/** 中性色参考（gray / grayDark）。 */
export const NEUTRAL = {
  light: [
    '#fcfcfc',
    '#f9f9f9',
    '#f0f0f0',
    '#e8e8e8',
    '#e0e0e0',
    '#d9d9d9',
    '#cecece',
    '#bbbbbb',
    '#8d8d8d',
    '#838383',
    '#646464',
    '#202020',
  ],
  dark: [
    '#111111',
    '#191919',
    '#222222',
    '#2a2a2a',
    '#313131',
    '#3a3a3a',
    '#484848',
    '#606060',
    '#6e6e6e',
    '#7b7b7b',
    '#b4b4b4',
    '#eeeeee',
  ],
}

/** 彩色参考（blue / blueDark）：step 9 为纯色锚点。 */
export const CHROMATIC = {
  light: [
    '#fbfdff',
    '#f4faff',
    '#e6f4fe',
    '#d5efff',
    '#c2e5ff',
    '#acd8fc',
    '#8ec8f6',
    '#5eb1ef',
    '#0090ff',
    '#0588f0',
    '#0d74ce',
    '#113264',
  ],
  dark: [
    '#0d1520',
    '#111927',
    '#0d2847',
    '#003362',
    '#004074',
    '#104d87',
    '#205d9e',
    '#2870bd',
    '#0090ff',
    '#3b9eff',
    '#70b8ff',
    '#c2e6ff',
  ],
}
