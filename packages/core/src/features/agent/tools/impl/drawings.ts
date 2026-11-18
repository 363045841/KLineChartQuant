/**
 * 图元工具：窗格用显示行寻址，图元用系统分配的 id 引用，时间用 RFC 3339。
 *
 * 锚点形状（几个点、每个点需要哪些坐标轴）从种类声明派生，工具只负责声明契约
 * 与分发动作；行号解析、时间解析和领域错误都在命令层完成。
 */
import { Type } from 'typebox'

import {
  AGENT_DRAWING_KINDS,
  DRAWING_LABEL_INDEX_PATTERN,
  type DrawingLabelGroups,
  type DrawingTimeframeVisibility,
} from '../../../../engine/drawing/index.js'
import { ToolInputValidationError } from '../../../../foundation/agent/index.js'
import { AGENT_DRAWING_COLOR_VALUES } from '../../../../foundation/tokens/agentDrawingColors.js'
import type { ChartAgentDrawingCommands } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { describeDrawingAnchorContract } from '../../impl/drawingAnchorContract.js'
import { jsonResult, requireFields } from './helpers.js'

const DrawingKind = Type.Enum([...AGENT_DRAWING_KINDS])
const DrawingColor = Type.Enum(AGENT_DRAWING_COLOR_VALUES)

/** RFC 3339 带偏移量；日线及以上允许只给交易日。 */
const ANCHOR_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?(Z|[+-]\\d{2}:\\d{2}))?$'

const DrawingAnchor = Type.Object(
  {
    time: Type.Optional(
      Type.String({
        pattern: ANCHOR_TIME_PATTERN,
        description:
          'RFC 3339 with an offset in the chart timezone, exactly as drawings_list returns it. Daily and higher periods also accept a bare date.',
      }),
    ),
    price: Type.Optional(Type.Number({ description: 'Price coordinate of this anchor.' })),
  },
  { additionalProperties: false },
)

const DrawingStyleFields = Type.Object({
  stroke: DrawingColor,
  strokeWidth: Type.Number({ exclusiveMinimum: 0 }),
  strokeStyle: Type.Union([
    Type.Literal('solid'),
    Type.Literal('dashed'),
    Type.Literal('dotted'),
  ]),
  fill: DrawingColor,
  fillOpacity: Type.Number({ minimum: 0, maximum: 1 }),
  pointRadius: Type.Number({ exclusiveMinimum: 0 }),
  textColor: DrawingColor,
  fontSize: Type.Number({ exclusiveMinimum: 0 }),
})

const DrawingStyle = Type.Partial(DrawingStyleFields)

const DrawingLabel = Type.Object(
  {
    text: Type.String({ description: '标签文本。使用字面量 \\n 作为唯一换行控制码。' }),
    position: Type.Union([Type.Literal('start'), Type.Literal('center'), Type.Literal('end')]),
  },
  { additionalProperties: false },
)

/** 标签组：键为渲染输出的线段或区域序号，从 "0" 起的字符串数字。 */
function labelGroup(description: string) {
  return Type.Optional(
    Type.Record(Type.String({ pattern: DRAWING_LABEL_INDEX_PATTERN }), DrawingLabel, {
      additionalProperties: false,
      description,
    }),
  )
}

const DrawingLabels = Type.Object(
  {
    line: labelGroup(
      'Labels on line segments (trend-line, ray, channel edges). Omit when this kind has no segment label; on update, an omitted group keeps its current labels.',
    ),
    area: labelGroup(
      'Labels inside filled regions (rectangle, channel fill). Omit when this kind has no filled area; on update, an omitted group keeps its current labels.',
    ),
  },
  { additionalProperties: false, description: 'Optional text labels, grouped by render output.' },
)

const TimeframeVisibility = Type.Object(
  {
    mode: Type.Union([
      Type.Literal('all'),
      Type.Literal('above'),
      Type.Literal('below'),
      Type.Literal('current'),
    ]),
    period: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'Reference period; required unless mode is "all", for example "daily".',
      }),
    ),
  },
  { additionalProperties: false },
)

const DrawingsWriteParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal('create'),
      Type.Literal('update'),
      Type.Literal('delete'),
    ]),
    row: Type.Optional(
      Type.Integer({
        minimum: 0,
        description:
          'create only: display row from drawings_list, where 0 is the top row. The main chart can be at any row.',
      }),
    ),
    kind: Type.Optional(DrawingKind),
    anchors: Type.Optional(
      Type.Array(DrawingAnchor, {
        minItems: 1,
        maxItems: 3,
        description:
          'create only: the defining points, exactly as many as the kind declares. Each point carries the axes that kind uses.',
      }),
    ),
    style: Type.Optional(DrawingStyle),
    labels: Type.Optional(DrawingLabels),
    visible: Type.Optional(Type.Boolean()),
    locked: Type.Optional(Type.Boolean()),
    zIndex: Type.Optional(Type.Number({ description: '同一行内的绘制层级，越大越靠上。' })),
    timeframeVisibility: Type.Optional(TimeframeVisibility),
    drawingId: Type.Optional(
      Type.String({ minLength: 1, description: 'update and delete: id returned by drawings_list.' }),
    ),
  },
  { additionalProperties: false },
)

interface TimeframeVisibilityInput {
  readonly mode: 'all' | 'above' | 'below' | 'current'
  readonly period?: string
}

interface DrawingsWriteInput {
  readonly action: 'create' | 'update' | 'delete'
  readonly row?: number
  readonly kind?: (typeof AGENT_DRAWING_KINDS)[number]
  readonly anchors?: ReadonlyArray<{ readonly time?: string; readonly price?: number }>
  readonly style?: Readonly<Record<string, string | number | undefined>>
  readonly labels?: Readonly<DrawingLabelGroups>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
  readonly timeframeVisibility?: TimeframeVisibilityInput
  readonly drawingId?: string
}

/** 各 action 接受的字段；扁平 schema 无法表达，因此分发前显式拒绝多余字段。 */
const ALLOWED_FIELDS: Readonly<Record<DrawingsWriteInput['action'], ReadonlyArray<string>>> = {
  create: [
    'row',
    'kind',
    'anchors',
    'style',
    'labels',
    'visible',
    'locked',
    'zIndex',
    'timeframeVisibility',
  ],
  update: ['drawingId', 'style', 'labels', 'visible', 'locked', 'zIndex', 'timeframeVisibility'],
  delete: ['drawingId'],
}

/** 由种类声明生成锚点契约，描述与校验共用同一句。 */
export const DRAWINGS_LIST_METADATA: ChartToolMetadata = {
  name: 'drawings_list',
  label: 'List drawings',
  description:
    'List every drawing on the current symbol. Returns timezone, period and drawings. Each drawing exposes id, kind, row, anchors, style, labels, visible, locked, zIndex, timeframeVisibility and visibleInCurrentPeriod. ' +
    'row is the display row and identifies the pane; id is assigned by the chart. ' +
    'anchor time is RFC 3339 with an offset in the chart timezone and can be written back unchanged.',
  effect: 'read',
}

export const DRAWINGS_WRITE_METADATA: ChartToolMetadata = {
  name: 'drawings_write',
  label: 'Edit drawings',
  description:
    'Create, update or delete chart drawings. ' +
    'create: row from drawings_list, kind, anchors and style; row is the display row, where 0 is the top and the main chart can be any row. ' +
    'update: drawingId plus any of style, labels, visible, locked, zIndex, timeframeVisibility; geometry changes by delete then create. ' +
    'delete: drawingId. ' +
    `Anchor shapes by kind: ${describeDrawingAnchorContract()}. ` +
    'Times are RFC 3339 with an offset in the chart timezone, exactly as drawings_list returns them.',
  effect: 'write',
}

/** 列出当前标的的图元。 */
export function createDrawingsListTool(drawings: ChartAgentDrawingCommands): ChartToolDefinition {
  return {
    ...DRAWINGS_LIST_METADATA,
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute() {
      const list = drawings.list()
      return jsonResult(list, `Returned ${list.drawings.length} drawings.`)
    },
  }
}

/** 图元写工具；每个动作只有一种合法语义，非法字段在分发前拒绝。 */
export function createDrawingsWriteTool(
  drawings: ChartAgentDrawingCommands,
): ChartToolDefinition {
  return {
    ...DRAWINGS_WRITE_METADATA,
    parameters: DrawingsWriteParameters,
    summarizeInput: (input) => {
      const args = input as DrawingsWriteInput
      const subject = args.drawingId ?? args.kind
      return subject ? `${args.action} ${subject}` : args.action
    },
    async execute(input) {
      const args = input as DrawingsWriteInput
      rejectUnusedFields(args)
      switch (args.action) {
        case 'create': {
          requireFields(
            args,
            ['row', 'kind', 'anchors', 'style'],
            'create needs the target display row, the kind, its defining anchors and a style.stroke.',
          )
          if (args.style?.stroke === undefined) {
            throw new ToolInputValidationError(
              'action=create requires style.stroke. Supply one of the drawing color values.',
            )
          }
          const view = drawings.create({
            row: args.row!,
            kind: args.kind!,
            anchors: args.anchors!,
            style: args.style,
            ...(args.labels === undefined ? {} : { labels: args.labels }),
            ...(args.visible === undefined ? {} : { visible: args.visible }),
            ...(args.locked === undefined ? {} : { locked: args.locked }),
            ...(args.zIndex === undefined ? {} : { zIndex: args.zIndex }),
            ...(args.timeframeVisibility === undefined
              ? {}
              : { timeframeVisibility: parseVisibility(args.timeframeVisibility) }),
          })
          return jsonResult({ drawing: view }, `Created ${view.kind} at row ${view.row}.`)
        }
        case 'update': {
          requireFields(args, ['drawingId'])
          const patch = {
            ...(args.style === undefined ? {} : { style: args.style }),
            ...(args.labels === undefined ? {} : { labels: args.labels }),
            ...(args.visible === undefined ? {} : { visible: args.visible }),
            ...(args.locked === undefined ? {} : { locked: args.locked }),
            ...(args.zIndex === undefined ? {} : { zIndex: args.zIndex }),
            ...(args.timeframeVisibility === undefined
              ? {}
              : { timeframeVisibility: parseVisibility(args.timeframeVisibility) }),
          }
          if (Object.keys(patch).length === 0) {
            const writable = ALLOWED_FIELDS.update.filter((field) => field !== 'drawingId')
            throw new ToolInputValidationError(
              `action=update requires drawingId and at least one of ${writable.join(', ')}.`,
            )
          }
          const view = drawings.update(args.drawingId!, patch)
          return jsonResult({ drawing: view }, `Updated ${view.kind} ${view.id}.`)
        }
        case 'delete': {
          requireFields(args, ['drawingId'])
          const view = drawings.remove(args.drawingId!)
          return jsonResult({ deleted: view }, `Deleted ${view.kind} ${view.id}.`)
        }
      }
    },
  }
}

/** 拒绝当前 action 不接受的字段，避免扁平 schema 静默忽略错放的参数。 */
function rejectUnusedFields(args: DrawingsWriteInput): void {
  const allowed = ALLOWED_FIELDS[args.action]
  if (allowed === undefined) {
    throw new ToolInputValidationError(`Unsupported action '${String(args.action)}'.`)
  }
  const unused = Object.keys(args).filter((key) => key !== 'action' && !allowed.includes(key))
  if (unused.length === 0) return
  throw new ToolInputValidationError(
    `action=${args.action} does not accept ${unused.join(', ')}. Allowed fields: ${allowed.join(', ')}.`,
  )
}

/** 周期可见性：非 all 必须带参考周期。 */
function parseVisibility(input: TimeframeVisibilityInput): DrawingTimeframeVisibility {
  if (input.mode === 'all') return { mode: 'all' }
  if (input.period === undefined) {
    throw new ToolInputValidationError(
      `timeframeVisibility.mode '${input.mode}' requires period, for example "daily".`,
    )
  }
  return { mode: input.mode, period: input.period }
}
