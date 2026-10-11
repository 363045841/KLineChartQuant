// 生成文件：由 `pnpm tokens:build` 从 src/foundation/tokens/dtcg/{foundation,scheme}/*.tokens.json 生成，请勿手改。
// 设计 Token v2 基础层：圆角、字阶、间距、密度、阴影层级、动效、层级、断点与品牌强调色。
// Theme 层（lightTheme / darkTheme）保持冻结；resolveTheme() 按 mode 挂载到 Theme.foundation。
import type { FoundationTokens } from './types.js'

const shared = {
  radius: {
    0: '0',
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  text: {
    12: {
      fontSize: '12px',
      lineHeight: '16px',
      letterSpacing: '0',
      fontWeight: 400,
    },
    13: {
      fontSize: '13px',
      lineHeight: '18px',
      letterSpacing: '-0.003em',
      fontWeight: 400,
    },
    14: {
      fontSize: '14px',
      lineHeight: '20px',
      letterSpacing: '-0.006em',
      fontWeight: 400,
    },
    16: {
      fontSize: '16px',
      lineHeight: '24px',
      letterSpacing: '-0.011em',
      fontWeight: 400,
    },
    20: {
      fontSize: '20px',
      lineHeight: '24px',
      letterSpacing: '-0.017em',
      fontWeight: 600,
    },
    24: {
      fontSize: '24px',
      lineHeight: '28px',
      letterSpacing: '-0.02em',
      fontWeight: 600,
    },
    32: {
      fontSize: '32px',
      lineHeight: '36px',
      letterSpacing: '-0.022em',
      fontWeight: 600,
    },
    48: {
      fontSize: '48px',
      lineHeight: '48px',
      letterSpacing: '-0.04em',
      fontWeight: 600,
    },
    72: {
      fontSize: '72px',
      lineHeight: 0.9,
      letterSpacing: '-0.04em',
      fontWeight: 600,
    },
    '11Mono': {
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize: '11px',
      lineHeight: '16px',
      letterSpacing: '0',
      fontWeight: 400,
    },
    label: {
      12: {
        fontSize: '12px',
        lineHeight: '16px',
        letterSpacing: '0',
        fontWeight: 500,
      },
      13: {
        fontSize: '13px',
        lineHeight: '18px',
        letterSpacing: '-0.003em',
        fontWeight: 500,
      },
      14: {
        fontSize: '14px',
        lineHeight: '20px',
        letterSpacing: '-0.006em',
        fontWeight: 500,
      },
      16: {
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '-0.011em',
        fontWeight: 500,
      },
      20: {
        fontSize: '20px',
        lineHeight: '24px',
        letterSpacing: '-0.017em',
        fontWeight: 600,
      },
    },
    copy: {
      13: {
        fontSize: '13px',
        lineHeight: '18px',
        letterSpacing: '-0.003em',
        fontWeight: 400,
      },
      14: {
        fontSize: '14px',
        lineHeight: '20px',
        letterSpacing: '-0.006em',
        fontWeight: 400,
      },
      16: {
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '-0.011em',
        fontWeight: 400,
      },
      20: {
        fontSize: '20px',
        lineHeight: '24px',
        letterSpacing: '-0.017em',
        fontWeight: 600,
      },
      24: {
        fontSize: '24px',
        lineHeight: '28px',
        letterSpacing: '-0.02em',
        fontWeight: 600,
      },
    },
    numeric: 'tabular-nums',
  },
  space: {
    2: '2px',
    4: '4px',
    8: '8px',
    12: '12px',
    16: '16px',
    24: '24px',
    32: '32px',
    40: '40px',
    48: '48px',
    64: '64px',
    80: '80px',
    96: '96px',
    160: '160px',
  },
  density: {
    compact: '24px',
    default: '32px',
    comfortable: '40px',
    touch: '48px',
    hitTarget: '24px',
    hitTargetTouch: '44px',
  },
  motion: {
    ease: {
      out: 'cubic-bezier(0.23, 1, 0.32, 1)',
      inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
      drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    dur: {
      0: '0ms',
      press: '140ms',
      fast: '160ms',
      base: '200ms',
      slow: '260ms',
      sheet: '500ms',
      toast: '400ms',
    },
    stagger: '40ms',
    loaderDelay: '200ms',
    loaderMin: '400ms',
    flash: '500ms',
    fade: '1000ms',
  },
  zIndex: {
    base: 0,
    chartOverlay: 10,
    sticky: 100,
    dropdown: 1000,
    popover: 1010,
    modal: 1100,
    toast: 1150,
    tooltip: 1200,
  },
  breakpoint: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} satisfies Omit<FoundationTokens, 'elevation' | 'brand'>

export const lightFoundation: FoundationTokens = {
  ...shared,
  elevation: {
    1: '0 0.5px 1px hsl(220 3% 15% / 0.1), 0 1px 2px hsl(220 3% 15% / 0.06)',
    2: '0 1px 2px hsl(220 3% 15% / 0.08), 0 2px 4px hsl(220 3% 15% / 0.07), 0 4px 8px hsl(220 3% 15% / 0.06)',
    3: '0 1px 2px hsl(220 3% 15% / 0.07), 0 2px 4px hsl(220 3% 15% / 0.06), 0 4px 8px hsl(220 3% 15% / 0.05), 0 8px 16px hsl(220 3% 15% / 0.05), 0 16px 32px hsl(220 3% 15% / 0.04)',
    hairline: '0 0 0 1px hsl(220 3% 15% / 0.08)',
  },
  brand: {
    accent: '#4C77C6',
    accentText: '#456FBD',
  },
}

export const darkFoundation: FoundationTokens = {
  ...shared,
  elevation: {
    1: '0 0.5px 1px hsl(0 0% 0% / 0.5), 0 1px 2px hsl(0 0% 0% / 0.5)',
    2: '0 1px 2px hsl(0 0% 0% / 0.4), 0 2px 4px hsl(0 0% 0% / 0.4), 0 4px 8px hsl(0 0% 0% / 0.4)',
    3: '0 1px 2px hsl(0 0% 0% / 0.3), 0 2px 4px hsl(0 0% 0% / 0.3), 0 4px 8px hsl(0 0% 0% / 0.3), 0 8px 16px hsl(0 0% 0% / 0.3), 0 16px 32px hsl(0 0% 0% / 0.3)',
    hairline: '0 0 0 1px hsl(0 0% 100% / 0.08)',
  },
  brand: {
    accent: '#4C77C6',
    accentText: '#537ECD',
  },
}

/** 按明暗模式索引的基础 Token。 */
export const foundationTokens: Readonly<Record<'light' | 'dark', FoundationTokens>> = {
  light: lightFoundation,
  dark: darkFoundation,
}
