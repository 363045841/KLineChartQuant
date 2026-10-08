import {
  DEFAULT_MAX_K_WIDTH,
  DEFAULT_MIN_K_WIDTH,
  DEFAULT_ZOOM_LEVEL_COUNT,
} from '../../../engine/viewport/zoom.js'

export const DEFAULT_OPTS = {
  yPaddingPx: 20,
  minKWidth: DEFAULT_MIN_K_WIDTH,
  maxKWidth: DEFAULT_MAX_K_WIDTH,
  rightAxisWidth: 0,
  leftAxisWidth: 0,
  bottomAxisHeight: 24,
  priceLabelWidth: 60,
  zoomLevels: DEFAULT_ZOOM_LEVEL_COUNT,
  initialZoomLevel: 3,
} as const
