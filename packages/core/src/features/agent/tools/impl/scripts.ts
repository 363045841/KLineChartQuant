/** 脚本参考查询工具：只读静态文档，不读写图表状态。 */
import { Type } from 'typebox'

import { GENERIC_ERROR_CODES, KLineChartError } from '../../../../errors.js'
import type { ChartAgentScriptReference, ScriptReferenceTopic } from '../../types.js'
import { SCRIPT_REFERENCE_TOPICS } from '../../types.js'
import type { ChartToolDefinition, ChartToolMetadata } from '../types.js'
import { textResult } from './helpers.js'

export const SCRIPT_REFERENCE_QUERY_METADATA: ChartToolMetadata = {
  name: 'script_reference_query',
  label: 'Query script reference',
  description:
    'Read the indicator script reference before writing or changing a script. topic="guide" is the authoring guide: skeleton, series semantics, inputs, cross-bar state and common errors. Other topics list signatures, options and enum values.',
  effect: 'read',
}

/**
 * 未接入参考内容时的占位实现。
 *
 * 工具清单是静态契约，任何构建都必须能列出它；正文由宿主随脚本包注入。
 * 这里不返回空文档：宁可让调用明确失败，也不要让模型照着空内容写脚本。
 */
export function createUnwiredScriptReference(): ChartAgentScriptReference {
  return Object.freeze({
    list: () => [],
    read: (): string => {
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_STATE,
        'The script reference is not wired into this chart.',
      )
    },
  })
}

/** 把可用主题拼进描述，模型不需要猜有哪些主题。 */
function withTopics(metadata: ChartToolMetadata, scripts: ChartAgentScriptReference): string {
  const topics = scripts.list()
  if (topics.length === 0) return metadata.description
  return `${metadata.description} Available topics: ${topics
    .map((topic) => `${topic.id} (${topic.title})`)
    .join(', ')}.`
}

/** 按主题读取一份参考；未知主题点名可用取值，便于模型直接重试。 */
export function createScriptReferenceQueryTool(
  scripts: ChartAgentScriptReference,
): ChartToolDefinition {
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
      return textResult(scripts.read(args.topic), `Script reference: ${args.topic}`)
    },
  }
}
