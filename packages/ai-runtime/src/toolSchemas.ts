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
  {
    name: 'chart.scrollToRight',
    description:
      'Scroll the chart to the rightmost position to show the latest ' +
      'data. Use when the user says "go to latest", "show recent", ' +
      '"scroll to end", or after navigating to historical data.',
    inputSchema: { type: 'object', properties: {} },
    safety: 'mutates-state',
  },
  {
    name: 'chart.zoomIn',
    description:
      'Zoom in one level, keeping the center (or a given anchor X) ' +
      'stationary. Use when the user says "zoom in", "get closer", ' +
      '"magnify", or wants to see fewer bars in more detail.',
    inputSchema: {
      type: 'object',
      properties: {
        anchorX: {
          type: 'number',
          description: 'Optional X coordinate to keep stationary.',
        },
      },
    },
    safety: 'mutates-state',
  },
  {
    name: 'chart.zoomOut',
    description:
      'Zoom out one level, keeping the center (or a given anchor X) ' +
      'stationary. Use when the user says "zoom out", "show more bars", ' +
      '"widen the view".',
    inputSchema: {
      type: 'object',
      properties: {
        anchorX: {
          type: 'number',
          description: 'Optional X coordinate to keep stationary.',
        },
      },
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

export const DATA_TOOLS: McpToolSchema[] = [
  {
    name: 'data.setSymbols',
    description:
      'Set the trading symbol (and optionally exchange, timeframe/period) ' +
      'on the chart. Use when the user says "show me AAPL", "switch to ' +
      'BTC/USDT", "go to daily chart", "change timeframe to 1 hour".',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, BTC/USDT, 600519.' },
        exchange: { type: 'string', description: 'Optional exchange name, e.g. NASDAQ, SSE, SZSE, HKEX, BINANCE.' },
        period: {
          type: 'string',
          description:
            'Timeframe / bar period. Common values: daily, 1min, 5min, 15min, 30min, 60min, weekly, monthly, quarterly, yearly.',
        },
        adjust: { type: 'string', description: 'Adjust type: qfq (forward), hfq (backward), none (raw).' },
        source: { type: 'string', description: 'Data source identifier.' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD.' },
      },
      required: ['symbol'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'data.appendData',
    description:
      'Append one or more new K-line bars to the end of the chart data. ' +
      'Use when new price data arrives or simulating real-time bar feed.',
    inputSchema: {
      type: 'object',
      properties: {
        bars: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'number', description: 'Unix timestamp in milliseconds. Optional; omitted for intraday bars without a fixed close time.' },
              open: { type: 'number', description: 'Opening price of the bar.' },
              high: { type: 'number', description: 'Highest price during the bar period.' },
              low: { type: 'number', description: 'Lowest price during the bar period.' },
              close: { type: 'number', description: 'Closing / last price of the bar.' },
              volume: { type: 'number', description: 'Trading volume in shares or contracts.' },
            },
            required: ['open', 'high', 'low', 'close', 'volume'],
          },
          description: 'Array of OHLCV K-line bars to append.',
        },
      },
      required: ['bars'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'data.updateData',
    description:
      'Update existing K-line bars (e.g. to refresh the latest incomplete ' +
      'bar). Bars are matched by timestamp. Use for real-time price updates.',
    inputSchema: {
      type: 'object',
      properties: {
        bars: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'number', description: 'Unix timestamp in milliseconds. Used to match existing bars — bars without timestamp update the last visible bar.' },
              open: { type: 'number', description: 'Opening price of the bar.' },
              high: { type: 'number', description: 'Highest price during the bar period.' },
              low: { type: 'number', description: 'Lowest price during the bar period.' },
              close: { type: 'number', description: 'Closing / last price of the bar.' },
              volume: { type: 'number', description: 'Trading volume in shares or contracts.' },
            },
            required: ['open', 'high', 'low', 'close', 'volume'],
          },
          description: 'Array of K-line bars to upsert.',
        },
      },
      required: ['bars'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'data.addComparisonSymbol',
    description:
      'Add a comparison/overlay symbol to the chart (e.g. compare AAPL ' +
      'against MSFT or SPY). Use when the user says "compare with", ' +
      '"overlay symbol X". The symbol is rendered as an overlaid line ' +
      'on the main pane.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol to compare, e.g. SPY, MSFT, 000001.' },
        exchange: { type: 'string', description: 'Exchange name, e.g. NYSE, SSE, SZSE, HKEX, BINANCE. Matches the primary symbol\'s exchange if omitted.' },
        source: {
          type: 'string',
          description:
            'Data source identifier, e.g. gotdx, tradingview. Defaults to the primary symbol\'s source if omitted.',
        },
      },
      required: ['symbol'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'data.removeComparisonSymbol',
    description:
      'Remove a previously added comparison/overlay symbol from the chart.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol to remove from comparisons, e.g. SPY, MSFT.' },
      },
      required: ['symbol'],
    },
    safety: 'mutates-state',
  },
]

export const DRAWING_TOOLS: McpToolSchema[] = [
  {
    name: 'drawing.setTool',
    description:
      'Activate a drawing tool by type. Once active, subsequent clicks on ' +
      'the chart create drawings of that type. Pass null to deactivate and ' +
      'return to cursor mode.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: ['trendline', 'horizontal', 'fib', 'rectangle', 'arrow', null],
          description:
            'Drawing tool type, or null to deactivate. ' +
            'trendline=trend line, horizontal=horizontal line, fib=Fibo retracement, ' +
            'rectangle=rectangle, arrow=arrow marker.',
        },
      },
      required: ['tool'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'drawing.add',
    description:
      'Add a drawing/annotation at specific anchor points. Use when the ' +
      'user says "draw a trend line from bar 10 to bar 50", "mark a ' +
      'horizontal line at price 150", "add Fibonacci retracement", ' +
      '"draw a vertical line here". Anchors are positioned by bar index ' +
      '(0 = first visible bar) and price.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [
            'trend-line',
            'ray',
            'extended-line',
            'horizontal-line',
            'horizontal-ray',
            'vertical-line',
            'cross-line',
            'info-line',
            'parallel-channel',
            'regression-channel',
            'flat-line',
            'disjoint-channel',
          ],
          description:
            'Type of drawing. trend-line = segment between 2 points; ' +
            'ray = line extending right; extended-line = line extending both ' +
            'directions; horizontal-line = full-width horizontal; ' +
            'vertical-line = full-height vertical; cross-line = both; ' +
            'info-line = labeled segment; parallel-channel / flat-line / ' +
            'disjoint-channel = 3-anchor channels; ' +
            'regression-channel = linear regression with std-dev bands.',
        },
        anchors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              barIndex: {
                type: 'number',
                description:
                  'Bar index (0-based, relative to visible data range). ' +
                  'e.g. 0 = first bar, use -1 for the last bar.',
              },
              price: { type: 'number', description: 'Price value for the anchor point.' },
            },
            required: ['barIndex', 'price'],
          },
          description:
            'Anchor points defining the drawing. Single-anchor kinds ' +
            '(horizontal-line, vertical-line, etc.) need 1 anchor; ' +
            'dual-anchor kinds (trend-line, ray, etc.) need 2; ' +
            'triple-anchor kinds (parallel-channel, flat-line, etc.) need 3.',
        },
        style: {
          type: 'object',
          properties: {
            stroke: { type: 'string', description: 'Line color (hex, e.g. #FF5722).' },
            strokeWidth: { type: 'number', description: 'Line width in pixels (default 1).' },
            strokeStyle: {
              type: 'string',
              enum: ['solid', 'dashed', 'dotted'],
              description: 'Line style (default solid).',
            },
          },
          description: 'Optional visual style overrides.',
        },
      },
      required: ['kind', 'anchors'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'drawing.clear',
    description:
      'Remove all drawings from the chart. Use when the user says "clear ' +
      'all drawings", "remove all annotations", "clean up".',
    inputSchema: { type: 'object', properties: {} },
    safety: 'mutates-state',
  },
  {
    name: 'drawing.remove',
    description: 'Remove a specific drawing by its id.',
    inputSchema: {
      type: 'object',
      properties: {
        drawingId: { type: 'string', description: 'The drawing object id to remove.' },
      },
      required: ['drawingId'],
    },
    safety: 'mutates-state',
  },
]

export const MARKER_TOOLS: McpToolSchema[] = [
  {
    name: 'markers.update',
    description:
      'Set custom markers on the chart. Replaces all existing markers ' +
      'with the provided list. Use for annotations like "mark this high", ' +
      '"flag this date", "label this point".',
    inputSchema: {
      type: 'object',
      properties: {
        markers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique marker identifier.' },
              date: { type: 'string', description: 'Date string: YYYY-MM-DD for daily, YYYY-MM-DD HH:mm for intraday.' },
              shape: {
                type: 'string',
                enum: ['arrow_up', 'arrow_down', 'flag', 'circle', 'rectangle', 'diamond'],
                description: 'Visual shape of the marker.',
              },
              groupKey: { type: 'string', description: 'Optional grouping key.' },
              style: {
                type: 'object',
                additionalProperties: true,
                description: 'Optional style overrides (fillColor, strokeColor, size, etc.).',
              },
              label: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'Label text content.' },
                  position: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'inside'], description: 'Label position relative to marker.' },
                },
                required: ['text'],
                description: 'Optional text label.',
              },
            },
            required: ['id', 'date', 'shape'],
          },
          description: 'Full list of custom markers to display.',
        },
      },
      required: ['markers'],
    },
    safety: 'mutates-state',
  },
  {
    name: 'markers.clear',
    description:
      'Remove all custom markers from the chart. Use when the user says ' +
      '"clear markers", "remove all annotations".',
    inputSchema: { type: 'object', properties: {} },
    safety: 'mutates-state',
  },
]

export const SETTINGS_TOOLS: McpToolSchema[] = [
  {
    name: 'settings.update',
    description:
      'Update chart settings and options. Accepts arbitrary key-value ' +
      'pairs for chart behavior (settings) and appearance (options). ' +
      'Use for fine-grained configuration changes.',
    inputSchema: {
      type: 'object',
      properties: {
        settings: {
          type: 'object',
          additionalProperties: true,
          description: 'Chart settings key-value pairs (behaviour).',
        },
        options: {
          type: 'object',
          additionalProperties: true,
          description: 'Chart options key-value pairs (appearance).',
        },
      },
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
  ...DATA_TOOLS,
  ...DRAWING_TOOLS,
  ...MARKER_TOOLS,
  ...SETTINGS_TOOLS,
  ...ALERT_TOOLS,
  ...REPLAY_TOOLS,
]

export const TOOL_GROUPS = {
  navigation: CHART_NAVIGATION_TOOLS,
  indicators: INDICATOR_TOOLS,
  data: DATA_TOOLS,
  drawing: DRAWING_TOOLS,
  markers: MARKER_TOOLS,
  settings: SETTINGS_TOOLS,
  alerts: ALERT_TOOLS,
  replay: REPLAY_TOOLS,
} as const

export function findTool(name: string): McpToolSchema | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}
