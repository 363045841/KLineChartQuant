import type { McpToolSchema } from './types'

export const CHART_NAVIGATION_TOOLS: McpToolSchema[] = [
  {
    name: 'chart.zoomToLevel',
    description:
      'Zoom the chart to a specific discrete level (1 = most zoomed out, ' +
      'higher numbers = more zoomed in). Use when the user says "zoom in", ' +
      '"zoom out", "fit the chart", or asks for a specific zoom level.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'integer',
          minimum: 1,
          description:
            'Discrete zoom level (1 = most zoomed out). ' +
            'Upper bound depends on chart zoomLevels config (default 20).',
        },
        anchorX: {
          type: 'number',
          description: 'Optional X coordinate to keep stationary during zoom.',
        },
      },
      required: ['level'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'chart.setTheme',
    description:
      'Switch between light and dark theme. Use when the user asks for ' +
      '"dark mode", "light mode", or expresses a theme preference.',
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', enum: ['light', 'dark'] },
      },
      required: ['theme'],
    },
    safety: 'mutates-state',
  },
]

export const INDICATOR_TOOLS: McpToolSchema[] = [
  {
    name: 'indicators.add',
    description:
      'Add a technical indicator to the chart by its catalog id (e.g. "MA", ' +
      '"BOLL", "MACD", "RSI"). Use when the user asks to "add a moving ' +
      'average", "show MACD", "I want to see Bollinger Bands", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        definitionId: {
          type: 'string',
          description:
            'Catalog id of the indicator. Common: MA, EMA, BOLL, EXPMA, ' +
            'MACD, RSI, KDJ, VOL, ATR, OBV.',
        },
      },
      required: ['definitionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        instanceId: {
          type: 'string',
          description:
            'New instance id, or null if the indicator was already active.',
        },
      },
    },
    safety: 'mutates-state',
  },
  {
    name: 'indicators.remove',
    description: 'Remove an indicator instance by its instance id.',
    inputSchema: {
      type: 'object',
      properties: {
        instanceId: { type: 'string' },
      },
      required: ['instanceId'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'indicators.updateParams',
    description:
      'Change the parameters of an active indicator (e.g. MA period from ' +
      '20 to 50, BOLL multiplier from 2 to 2.5).',
    inputSchema: {
      type: 'object',
      properties: {
        instanceId: { type: 'string' },
        params: {
          type: 'object',
          properties: {},
          additionalProperties: true,
          description: 'Param key to value map (numbers, strings, booleans).',
        },
      },
      required: ['instanceId', 'params'],
    },
    safety: 'mutates-state',
  },
]

export const ALERT_TOOLS: McpToolSchema[] = [
  {
    name: 'alerts.addPriceCross',
    description:
      'Create a price-crossing alert. Use when the user says "alert me when ' +
      'BTC crosses 100k", "tell me when price drops below X", "wake me up at Y".',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique alert id.' },
        name: { type: 'string', description: 'Human-readable label.' },
        price: { type: 'number' },
        direction: { type: 'string', enum: ['up', 'down', 'any'] },
        oneShot: {
          type: 'boolean',
          description: 'If true, fires once then auto-disables.',
        },
      },
      required: ['id', 'name', 'price', 'direction', 'oneShot'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'alerts.addIndicatorCross',
    description:
      'Alert when an indicator value crosses a threshold (e.g. RSI > 70, MACD ' +
      'histogram goes positive).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        indicatorId: { type: 'string' },
        threshold: { type: 'number' },
        direction: { type: 'string', enum: ['up', 'down', 'any'] },
        oneShot: { type: 'boolean' },
      },
      required: [
        'id',
        'name',
        'indicatorId',
        'threshold',
        'direction',
        'oneShot',
      ],
    },
    safety: 'mutates-state',
  },
  {
    name: 'alerts.remove',
    description:
      'Remove an existing alert rule by its id. Use when the user says ' +
      '"cancel the BTC alert", "delete that alert", "I no longer need notification X".',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    safety: 'mutates-state',
  },
]

export const REPLAY_TOOLS: McpToolSchema[] = [
  {
    name: 'replay.seekTo',
    description:
      'Move the replay cursor to a specific bar index. Use when the user says ' +
      '"go to bar X", "rewind to the start", "show me what happened at this point".',
    inputSchema: {
      type: 'object',
      properties: {
        position: { type: 'number', description: 'Bar index (float).' },
      },
      required: ['position'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'replay.play',
    description:
      'Start replay from the current cursor at the configured pacing and speed. ' +
      'Use when the user says "play", "start replay", "go".',
    inputSchema: { type: 'object', properties: {} },
    safety: 'mutates-state',
  },
  {
    name: 'replay.pause',
    description:
      'Pause the replay at the current bar. Use when the user says "pause", ' +
      '"stop", "hold on", or wants to inspect a specific bar.',
    inputSchema: { type: 'object', properties: {} },
    safety: 'mutates-state',
  },
  {
    name: 'replay.setSpeed',
    description:
      'Set replay speed multiplier (1.0 = real-time, 10.0 = 10x speed). ' +
      'Use when the user says "faster", "slow down", "real-time".',
    inputSchema: {
      type: 'object',
      properties: { speed: { type: 'number', minimum: 0.01 } },
      required: ['speed'],
    },
    safety: 'mutates-state',
  },
]

export const ALL_TOOLS: ReadonlyArray<McpToolSchema> = [
  ...CHART_NAVIGATION_TOOLS,
  ...INDICATOR_TOOLS,
  ...ALERT_TOOLS,
  ...REPLAY_TOOLS,
]

export const TOOL_GROUPS = {
  navigation: CHART_NAVIGATION_TOOLS,
  indicators: INDICATOR_TOOLS,
  alerts: ALERT_TOOLS,
  replay: REPLAY_TOOLS,
} as const

export function findTool(name: string): McpToolSchema | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}
