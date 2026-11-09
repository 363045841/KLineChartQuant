/** 验证指标注册管线：收集 → 编译 → 注册三段、单次通知与逐条失败隔离。 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Indicator } from '../../indicatorDecorator'
import { IndicatorKind } from '../../indicatorMetadata'
import {
  clearIndicatorStoreForTest,
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  indicatorCatalogRevision,
  indicatorCommits,
  loadIndicatorDefinitions,
  readRegisteredDefinitions,
  registerIndicators,
  type IndicatorCandidate,
  type IndicatorFailure,
  type IndicatorStage,
  type RegistrableIndicator,
} from '../index'
import { resolveIndicatorLayerId } from '../../indicatorLayerNaming'
import { runIndicatorPipeline } from '../impl/runIndicatorPipeline'
import { createTestRendererLayer } from '../../__tests__/helpers/metadataTestKit'

/** 声明带别名的真实 Layer 定义，注册由用例决定。 */
function declareDefinition(
  name: string,
  alias: string,
  scriptDisplayName?: string,
  documentIdentity: 'builtin' | 'user' = 'user',
) {
  @Indicator({
    name,
    aliases: [alias],
    displayName: scriptDisplayName ?? name,
    source: scriptDisplayName === undefined ? 'native' : 'script',
    ...(scriptDisplayName === undefined
      ? {}
      : {
          document: {
            identity: documentIdentity,
            revision: 1,
            source: `// ${scriptDisplayName}`,
            trusted: true,
            folder: '',
            definition: { name: scriptDisplayName, inputs: {} },
          },
        }),
    kind: IndicatorKind.Indicator,
    category: 'oscillator',
    defaultPaneId: `sub_${alias}`,
    scale: { indicatorKey: name },
  })
  class Definition {
    static rendererFactory = () => createTestRendererLayer(name)
  }
  return Definition
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
  load?: () => Promise<import('../../indicatorDecorator').IndicatorDefinitionClass>,
): RegistrableIndicator {
  return {
    kind: 'descriptor',
    candidate: { key: name, origin: 'system', identity: 'native' },
    descriptor: {
      name,
      displayName: name,
      kind: IndicatorKind.System,
      category: 'main',
      defaultPaneId: 'main',
    },
    ...(load === undefined ? {} : { load }),
  }
}

describe('Indicator pipeline', () => {
  beforeEach(clearIndicatorStoreForTest)

  it('注册一次写入并只通知一次，重复注册保持幂等', () => {
    const first = declareDefinition('customRsi', 'CUSTOM_RSI')
    const second = declareDefinition('customMacd', 'CUSTOM_MACD')
    const before = indicatorCatalogRevision.peek()

    const report = registerIndicators([
      registrable('customRsi', first),
      registrable('customMacd', second),
    ])

    expect(report.failures).toEqual([])
    expect(indicatorCatalogRevision.peek()).toBe(before + 1)
    expect(indicatorCommits.peek()?.added).toHaveLength(2)
    expect(getRegisteredIndicatorDefinition('CUSTOM_RSI')?.name).toBe('customRsi')
    expect(getRegisteredIndicatorDefinition('custom rsi')?.name).toBe('customRsi')
    expect(resolveIndicatorLayerId('CUSTOM_RSI', 'pane')).toBe('plugin:customRsi_pane')
    expect(resolveIndicatorLayerId('CUSTOM_RSI', 'pane', 'scale')).toBe(
      'plugin:customRsiScale_pane',
    )

    const idempotentRevision = indicatorCatalogRevision.peek()
    registerIndicators([registrable('customRsi', first)])
    expect(readRegisteredDefinitions()).toHaveLength(2)
    expect(indicatorCatalogRevision.peek()).toBe(idempotentRevision)
  })

  it('冲突条目失败但不影响同批次其它条目', () => {
    registerIndicators([registrable('customRsi', declareDefinition('customRsi', 'OLD_RSI'))])
    const report = registerIndicators([
      registrable('customRsi', declareDefinition('customRsi', 'NEW_RSI')),
      registrable('other', declareDefinition('other', 'OTHER_RSI')),
    ])
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]).toMatchObject({ stage: 'register', origin: 'third-party' })
    expect(readRegisteredDefinitions()).toHaveLength(2)
  })

  it('拒绝未声明元数据的定义类', () => {
    class Undeclared {}
    const report = registerIndicators([
      {
        kind: 'definition',
        candidate: { key: 'undeclared', origin: 'third-party', identity: 'native' },
        definition: Undeclared,
      },
    ])
    expect(report.failures).toHaveLength(1)
  })

  it('脚本展示名冲突时拒绝替换并保留原定义', () => {
    registerIndicators([
      registrable('script_alpha', declareDefinition('script_alpha', 'alpha_alias', 'Alpha'), 'user-script'),
      registrable('script_beta', declareDefinition('script_beta', 'beta_alias', 'Beta'), 'user-script'),
    ])
    const report = registerIndicators([
      registrable('script_alpha', declareDefinition('script_alpha', 'alpha_alias', 'Beta'), 'user-script'),
    ])
    expect(report.failures[0]?.error).toBeInstanceOf(Error)
    expect(getRegisteredIndicatorDefinition('Alpha')?.displayName).toBe('Alpha')
    expect(getRegisteredIndicatorDefinition('Beta')?.displayName).toBe('Beta')
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
              registrable(candidate.key === 'good' ? 'pipelineGood' : 'pipelineBad', candidate.key === 'good' ? good : bad),
            ],
          }
        },
      },
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = await runIndicatorPipeline([stage])
    expect(report.failures).toEqual([compileFailure])
    expect(log).toHaveBeenCalled()
    log.mockRestore()

    expect(getRegisteredIndicatorDefinition('PIPELINE_GOOD')).toBeDefined()
    expect(getRegisteredIndicatorDefinition('PIPELINE_BAD')).toBeUndefined()
  })

  it('懒加载失败留下日志、保持目录项，并把异常交给调用方', async () => {
    const name = 'lazyBroken'
    registerIndicators([
      descriptorItem(name, async () => {
        throw new Error('模块加载失败')
      }),
    ])
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(loadIndicatorDefinitions([name])).rejects.toThrow('模块加载失败')
    expect(String(log.mock.calls[0]?.[0])).toContain('懒加载实现失败')
    expect(getIndicatorDescriptor(name)).toBeDefined()
    log.mockRestore()
  })

  it('同一份内置脚本重复注册保持幂等，源码不同才拒绝', () => {
    const first = declareDefinition('builtinAlpha', 'BUILTIN_ALPHA', '内置甲', 'builtin')
    registerIndicators([registrable('builtinAlpha', first, 'builtin-script')])
    const revision = indicatorCatalogRevision.peek()

    const repeated = registerIndicators([
      registrable(
        'builtinAlpha',
        declareDefinition('builtinAlpha', 'BUILTIN_ALPHA', '内置甲', 'builtin'),
        'builtin-script',
      ),
    ])
    expect(repeated.failures).toEqual([])
    expect(indicatorCatalogRevision.peek()).toBe(revision)
    expect(getRegisteredIndicatorDefinition('BUILTIN_ALPHA')).toBeDefined()

    const overwritten = registerIndicators([
      registrable(
        'builtinAlpha',
        declareDefinition('builtinAlpha', 'BUILTIN_ALPHA', '内置乙', 'builtin'),
        'builtin-script',
      ),
    ])
    expect(overwritten.failures).toHaveLength(1)
    expect(getRegisteredIndicatorDefinition('BUILTIN_ALPHA')?.displayName).toBe('内置甲')
  })

  it('目录项注册与定义注册共用同一次提交', () => {
    const before = indicatorCatalogRevision.peek()
    const report = registerIndicators([
      descriptorItem('systemFixture'),
      registrable('withDescriptor', declareDefinition('withDescriptor', 'WITH_DESCRIPTOR')),
    ])
    expect(report.failures).toEqual([])
    expect(indicatorCatalogRevision.peek()).toBe(before + 1)
    expect(indicatorCommits.peek()?.described.map((item) => item.name)).toEqual(['systemFixture'])
    expect(indicatorCommits.peek()?.added.map((item) => item.name)).toEqual(['withDescriptor'])
  })
})
