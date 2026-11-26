/** 验证指标注册管线：收集 → 编译 → 注册三段、单次通知与逐条失败隔离。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestRendererLayer } from '../../__tests__/helpers/metadataTestKit'
import { createIndicatorLayerId } from '../../indicatorLayerNaming'
import type { IndicatorMetadata } from '../../indicatorMetadata'
import type { DefinitionRegistry } from '../../registry/index'
import { createTestDefinitions } from '../../__tests__/helpers/definitionsTestKit'
import { runIndicatorPipeline } from '../impl/runIndicatorPipeline'
import type {
  IndicatorCandidate,
  IndicatorFailure,
  IndicatorStage,
  RegistrableIndicator,
} from '../types'

/** 本用例独立的定义注册表。 */
let definitions: DefinitionRegistry

/** 声明真实 Layer 定义；displayName 是除内部名外的另一个查询键。 */
function declareDefinition(
  name: string,
  displayName = name,
  scriptName?: string,
  documentIdentity: 'builtin' | 'user' = 'user',
) {
  return {
    name,
    displayName,
    source: scriptName === undefined ? 'native' : 'script',
    ...(scriptName === undefined
      ? {}
      : {
          document: {
            identity: documentIdentity,
            revision: 1,
            source: `// ${scriptName}`,
            trusted: true,
            folder: '',
            definition: { kind: 'indicator', name: scriptName, inputs: {} },
          },
        }),
    kind: 'indicator' as const,
    category: 'oscillator',
    defaultPaneId: `sub_${name}`,
    scale: { indicatorKey: name },
    rendererFactory: () => createTestRendererLayer(name),
    getRendererName: ({ paneId }: { paneId: string }) => `${name}_${paneId}`,
  } satisfies IndicatorMetadata
}

/** 构造一个第三方来源的可注册定义。 */
function registrable(
  name: string,
  definition: ReturnType<typeof declareDefinition>,
  origin: IndicatorCandidate['origin'] = 'third-party',
): RegistrableIndicator {
  return {
    kind: 'definition',
    candidate: { key: name, origin, identity: 'native' },
    definition,
  }
}

/** 构造一个只登记目录项的指标；可指定懒加载入口。 */
function descriptorItem(
  name: string,
  load?: () => Promise<IndicatorMetadata>,
): RegistrableIndicator {
  return {
    kind: 'descriptor',
    candidate: { key: name, origin: 'third-party', identity: 'native' },
    descriptor: {
      kind: 'indicator' as const,
      name,
      displayName: name,
      category: 'main',
      defaultPaneId: 'main',
    },
    ...(load === undefined ? {} : { load }),
  }
}

describe('Indicator pipeline', () => {
  beforeEach(() => {
    definitions = createTestDefinitions()
  })

  it('注册一次写入并只通知一次，重复注册保持幂等', () => {
    const first = declareDefinition('customRsi', 'CUSTOM_RSI')
    const second = declareDefinition('customMacd', 'CUSTOM_MACD')
    const before = definitions.revision.peek()

    const report = definitions.register([
      registrable('customRsi', first),
      registrable('customMacd', second),
    ])

    expect(report.failures).toEqual([])
    expect(definitions.revision.peek()).toBe(before + 1)
    expect(definitions.commits.peek()?.added).toHaveLength(2)
    expect(definitions.getDefinition('CUSTOM_RSI')?.name).toBe('customRsi')
    expect(definitions.getDefinition('custom rsi')?.name).toBe('customRsi')
    expect(createIndicatorLayerId(first.getRendererName, 'customRsi', 'pane')).toBe('plugin:customRsi_pane')

    const idempotentRevision = definitions.revision.peek()
    definitions.register([registrable('customRsi', first)])
    expect(definitions.readDefinitions()).toHaveLength(2)
    expect(definitions.revision.peek()).toBe(idempotentRevision)
  })

  it('冲突条目失败但不影响同批次其它条目', () => {
    definitions.register([registrable('customRsi', declareDefinition('customRsi', 'OLD_RSI'))])
    const report = definitions.register([
      registrable('customRsi', declareDefinition('customRsi', 'NEW_RSI')),
      registrable('other', declareDefinition('other', 'OTHER_RSI')),
    ])
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]).toMatchObject({ stage: 'register', origin: 'third-party' })
    expect(definitions.readDefinitions()).toHaveLength(2)
  })

  it('拒绝没有身份的定义对象', () => {
    const report = definitions.register([
      {
        kind: 'definition',
        candidate: { key: 'undeclared', origin: 'third-party', identity: 'native' },
        definition: declareDefinition('', ''),
      },
    ])
    expect(report.failures).toHaveLength(1)
  })

  it('脚本展示名冲突时拒绝替换并保留原定义', () => {
    definitions.register([
      registrable(
        'script_alpha',
        declareDefinition('script_alpha', 'Alpha', 'Alpha'),
        'user-script',
      ),
      registrable(
        'script_beta',
        declareDefinition('script_beta', 'Beta', 'Beta'),
        'user-script',
      ),
    ])
    const report = definitions.register([
      registrable(
        'script_alpha',
        declareDefinition('script_alpha', 'Beta', 'Beta'),
        'user-script',
      ),
    ])
    expect(report.failures[0]?.error).toBeInstanceOf(Error)
    expect(definitions.getDefinition('Alpha')?.displayName).toBe('Alpha')
    expect(definitions.getDefinition('Beta')?.displayName).toBe('Beta')
  })

  it('管线逐条隔离失败，并把失败与成功一起返回', async () => {
    const good = declareDefinition('pipelineGood', 'PIPELINE_GOOD')
    const bad = declareDefinition('pipelineBad', 'PIPELINE_BAD')
    const compileFailure: IndicatorFailure = {
      stage: 'compile',
      origin: 'third-party',
      key: 'broken',
      name: 'broken',
      error: new Error('编译失败'),
    }
    const stage: IndicatorStage = {
      collector: {
        origin: 'third-party',
        async collect() {
          return {
            ok: true,
            items: [
              { key: 'good', origin: 'third-party', identity: 'native' },
              { key: 'broken', origin: 'third-party', identity: 'native' },
            ],
          }
        },
      },
      compiler: {
        origin: 'third-party',
        async compile(candidate) {
          if (candidate.key === 'broken') return { ok: false, failure: compileFailure }
          return {
            ok: true,
            items: [
              registrable(
                candidate.key === 'good' ? 'pipelineGood' : 'pipelineBad',
                candidate.key === 'good' ? good : bad,
              ),
            ],
          }
        },
      },
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = await runIndicatorPipeline(definitions, [stage])
    expect(report.failures).toEqual([compileFailure])
    expect(log).toHaveBeenCalled()
    log.mockRestore()

    expect(definitions.getDefinition('PIPELINE_GOOD')).toBeDefined()
    expect(definitions.getDefinition('PIPELINE_BAD')).toBeUndefined()
  })

  it('懒加载失败留下日志、保持目录项，并把异常交给调用方', async () => {
    const name = 'lazyBroken'
    definitions.register([
      descriptorItem(name, async () => {
        throw new Error('模块加载失败')
      }),
    ])
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(definitions.load([name])).rejects.toThrow('模块加载失败')
    expect(String(log.mock.calls[0]?.[0])).toContain('懒加载实现失败')
    expect(definitions.getDescriptor(name)).toBeDefined()
    log.mockRestore()
  })

  it('同一份内置脚本重复注册保持幂等，源码不同才拒绝', () => {
    const first = declareDefinition('builtinAlpha', '内置甲', '内置甲', 'builtin')
    definitions.register([registrable('builtinAlpha', first, 'builtin-script')])
    const revision = definitions.revision.peek()

    const repeated = definitions.register([
      registrable(
        'builtinAlpha',
        declareDefinition('builtinAlpha', '内置甲', '内置甲', 'builtin'),
        'builtin-script',
      ),
    ])
    expect(repeated.failures).toEqual([])
    expect(definitions.revision.peek()).toBe(revision)
    expect(definitions.getDefinition('内置甲')).toBeDefined()

    const overwritten = definitions.register([
      registrable(
        'builtinAlpha',
        declareDefinition('builtinAlpha', '内置乙', '内置乙', 'builtin'),
        'builtin-script',
      ),
    ])
    expect(overwritten.failures).toHaveLength(1)
    expect(definitions.getDefinition('内置甲')?.displayName).toBe('内置甲')
  })

  it('目录项注册与定义注册共用同一次提交', () => {
    const before = definitions.revision.peek()
    const report = definitions.register([
      descriptorItem('systemFixture'),
      registrable('withDescriptor', declareDefinition('withDescriptor', 'WITH_DESCRIPTOR')),
    ])
    expect(report.failures).toEqual([])
    expect(definitions.revision.peek()).toBe(before + 1)
    expect(definitions.commits.peek()?.described.map((item) => item.name)).toEqual(['systemFixture'])
    expect(definitions.commits.peek()?.added.map((item) => item.name)).toEqual(['withDescriptor'])
  })
})

