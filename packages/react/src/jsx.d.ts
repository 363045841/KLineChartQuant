import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kline-chart': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'y-padding-px'?: string
          'min-k-width'?: string
          'max-k-width'?: string
          'right-axis-width'?: string
          'bottom-axis-height'?: string
          'price-label-width'?: string
          'zoom-levels'?: string
          'initial-zoom-level'?: string
          'is-fullscreen'?: string
        },
        HTMLElement
      >
    }
  }
}
