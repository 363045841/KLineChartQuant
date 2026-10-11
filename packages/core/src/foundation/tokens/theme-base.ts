// 生成文件：由 `pnpm tokens:build` 从 src/foundation/tokens/dtcg/foundation/theme-base.tokens.json 生成，请勿手改。
import type { MotionTokens, SpacingTokens, TypographyTokens } from './types.js'

export const spacing: SpacingTokens = {
  none: '0',
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '64px',
}

export const typography: TypographyTokens = {
  fontFamily: 'inherit', // 不指定字体，DOM 界面继承宿主页面字体。
  // 代码、版本号、数字等优先使用 JetBrains Mono，缺失时回退系统等宽字体。
  fontFamilyMono:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  fontSizeSm: '10px',
  fontSizeMd: '12px',
  fontSizeLg: '14px',
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  lineHeightTight: 1.2,
  lineHeightStandard: 1.4,
}

export const motion: MotionTokens = {
  durationInstant: '0ms',
  durationFast: '120ms',
  durationModerate: '200ms',
  easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easingDecelerate: 'cubic-bezier(0, 0, 0.2, 1)',
}
