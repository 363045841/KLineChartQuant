/** 脚本工具：静态参考查询、用户指标脚本读取与编辑；文档读写分属不同 effect。 */
import { Type } from 'typebox'

import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import type {
  ChartAgentScriptDocument,
  ChartAgentScriptRef,
  ChartAgentScripts,
  ScriptReferenceEntry,
  ScriptReferenceTopic,
} from '../../types.js'
import { SCRIPT_REFERENCE_TOPICS } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { jsonResult, rejectUnusedFields, requireFields, textResult } from './helpers.js'

export const SCRIPT_REFERENCE_QUERY_METADATA: ChartToolMetadata = {
  name: 'script_reference_query',
  label: 'Query script reference',
  description:
    'Read the indicator script reference before writing or changing a script. topic="guide" is the authoring guide: skeleton, series semantics, inputs, cross-bar state and common errors. Other topics list signatures, options and enum values.',
  effect: 'read',
}

export const SCRIPTS_READ_METADATA: ChartToolMetadata = {
  name: 'scripts_read',
  label: 'Read user scripts',
  description:
    'List or read user indicator scripts. Without scriptId it returns { scripts: [{ id, name }], folders: [{ path }] }. With scriptId it returns { script: { id, name, source } }. ' +
    'Built-in scripts and user libraries are not listed. Read the exact source before scripts_write update; never reconstruct a script from memory.',
  effect: 'read',
}

export const SCRIPTS_WRITE_METADATA: ChartToolMetadata = {
  name: 'scripts_write',
  label: 'Edit user scripts',
  description:
    'Create, update or delete a user indicator script. ' +
    'create: source plus an optional folder from scripts_read; the source is compiled and registered immediately, so a compile error is returned verbatim. ' +
    'update: scriptId plus the COMPLETE source; partial patches are not supported, so call scripts_read first. ' +
    'delete: scriptId; the chart instances of that script are removed with it. ' +
    'The source is the single source of truth: it must declare defineIndicator, the current indicator API version (version: 2), its name and position. Only indicator scripts are accepted; defineLibrary is rejected. ' +
    'A created script is registered but not added to the chart; call indicators_write add with its name afterwards.',
  effect: 'write',
}

const ScriptsReadParameters = Type.Object(
  {
    scriptId: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          'Script id from scripts_read. Omit to list every user indicator script and the writable folders.',
      }),
    ),
  },
  { additionalProperties: false },
)

const ScriptsWriteParameters = Type.Object(
  {
    action: Type.Union([Type.Literal('create'), Type.Literal('update'), Type.Literal('delete')]),
    scriptId: Type.Optional(
      Type.String({
        minLength: 1,
        description: 'update and delete: id returned by scripts_read.',
      }),
    ),
    folder: Type.Optional(
      Type.String({
        description:
          'create only: folder path from scripts_read. Omit to place the script at the indicator root.',
      }),
    ),
    source: Type.Optional(
      Type.String({
        minLength: 1,
        description:
          'create and update: the COMPLETE script source, including defineIndicator and the indicator API version.',
      }),
    ),
  },
  { additionalProperties: false },
)

interface ScriptsReadInput {
  readonly scriptId?: string
}

interface ScriptsWriteInput {
  readonly action: 'create' | 'update' | 'delete'
  readonly scriptId?: string
  readonly folder?: string
  readonly source?: string
}

/** 各 action 接受的字段；扁平 schema 无法表达，因此分发前显式拒绝多余字段。 */
const ALLOWED_FIELDS: Readonly<Record<ScriptsWriteInput['action'], ReadonlyArray<string>>> = {
  create: ['folder', 'source'],
  update: ['scriptId', 'source'],
  delete: ['scriptId'],
}

/** 把可用主题拼进描述，模型不需要猜有哪些主题。 */
function withTopics(metadata: ChartToolMetadata, scripts: ChartAgentScripts): string {
  const topics = scripts.listReferenceTopics()
  if (topics.length === 0) return metadata.description
  return `${metadata.description} Available topics: ${topics
    .map((topic) => `${topic.id} (${topic.title})`)
    .join(', ')}.`
}

/** 按主题读取一份参考；未知主题点名可用取值，便于模型直接重试。 */
export function createScriptReferenceQueryTool(scripts: ChartAgentScripts): ChartToolDefinition {
  return {
    ...SCRIPT_REFERENCE_QUERY_METADATA,
    description: withTopics(SCRIPT_REFERENCE_QUERY_METADATA, scripts),
    parameters: Type.Object(
      {
        // 主题清单是契约常量，宿主缺内容时也不会退化成开放字符串。
        topic: Type.Union(
          SCRIPT_REFERENCE_TOPICS.map((topic) => Type.Literal(topic)),
          { description: 'Reference topic id.' },
        ),
      },
      { additionalProperties: false },
    ),
    summarizeInput: (input) => (input as { readonly topic: string }).topic,
    async execute(input) {
      const args = input as { readonly topic: ScriptReferenceTopic }
      return textResult(scripts.readReference(args.topic), `Script reference: ${args.topic}`)
    },
  }
}

/** 读取用户指标脚本；列表不带源码，按 id 读取才展开正文。 */
export function createScriptsReadTool(scripts: ChartAgentScripts): ChartToolDefinition {
  return {
    ...SCRIPTS_READ_METADATA,
    parameters: ScriptsReadParameters,
    summarizeInput: (input) => (input as ScriptsReadInput).scriptId ?? 'list',
    async execute(input) {
      const args = input as ScriptsReadInput
      if (args.scriptId !== undefined) {
        const script = await scripts.read(args.scriptId)
        return jsonResult({ script }, `Read script ${script.name}.`)
      }
      const [items, folders] = await Promise.all([scripts.list(), scripts.listFolders()])
      return jsonResult(
        { scripts: items, folders },
        `Returned ${items.length} scripts and ${folders.length} folders.`,
      )
    },
  }
}

/** 创建、覆盖或删除用户指标脚本；每个动作只有一种合法语义。 */
export function createScriptsWriteTool(scripts: ChartAgentScripts): ChartToolDefinition {
  return {
    ...SCRIPTS_WRITE_METADATA,
    parameters: ScriptsWriteParameters,
    summarizeInput: (input) => {
      const args = input as ScriptsWriteInput
      return args.scriptId ?? args.action
    },
    async execute(input) {
      const args = input as ScriptsWriteInput
      rejectUnusedFields(args, ALLOWED_FIELDS)
      switch (args.action) {
        case 'create': {
          requireFields(
            args,
            ['source'],
            'create needs the complete script source with defineIndicator and version: 2.',
          )
          const script = await scripts.create({
            source: args.source!,
            ...(args.folder === undefined ? {} : { folder: args.folder }),
          })
          return jsonResult(
            { script },
            `Created script ${script.name}. Add it with indicators_write when it should appear on the chart.`,
          )
        }
        case 'update': {
          requireFields(
            args,
            ['scriptId', 'source'],
            'update needs scriptId and the COMPLETE source; call scripts_read first.',
          )
          const script = await scripts.update(args.scriptId!, args.source!)
          return jsonResult({ script }, `Updated script ${script.name}.`)
        }
        case 'delete': {
          requireFields(args, ['scriptId'])
          const script = await scripts.remove(args.scriptId!)
          return jsonResult(
            { script },
            `Deleted script ${script.name} and removed its chart instances.`,
          )
        }
      }
    },
  }
}

/**
 * 未接入脚本服务时的占位实现。
 *
 * 工具清单是静态契约，任何构建都必须能列出它；正文与文档由宿主注入。
 * 这里不返回空结果：宁可让调用明确失败，也不要让模型以为读写已经生效。
 */
export function createUnwiredScripts(): ChartAgentScripts {
  const fail = (): never => {
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_STATE,
      'The script service is not wired into this chart.',
    )
  }
  return Object.freeze({
    listReferenceTopics: (): ReadonlyArray<ScriptReferenceEntry> => [],
    readReference: fail,
    list: async (): Promise<ReadonlyArray<ChartAgentScriptRef>> => fail(),
    listFolders: async () => fail(),
    read: async (): Promise<ChartAgentScriptDocument> => fail(),
    create: async () => fail(),
    update: async () => fail(),
    remove: async () => fail(),
  })
}
