/**
 * 定义注册表契约：指标与警报定义的唯一可写仓库。
 *
 * 生产者通过 `register` 提交，消费者通过只读快照和修订信号读取。
 */
import type { IndicatorMetadata } from '../indicatorMetadata.js'
import type {
  IndicatorCatalogCommitSignal,
  IndicatorCatalogRevision,
  IndicatorDescriptor,
  IndicatorFailure,
  IndicatorFailureSignal,
  IndicatorPipelineReport,
  RegistrableIndicator,
} from '../pipeline/types.js'

export interface DefinitionRegistry {
  /** 注册表修订号；任意增删改都会推进。 */
  readonly revision: IndicatorCatalogRevision
  /** 最近一次提交的变更摘要。 */
  readonly commits: IndicatorCatalogCommitSignal
  /** 最近一次管线登记的失败清单。 */
  readonly failures: IndicatorFailureSignal

  register(items: readonly RegistrableIndicator[]): IndicatorPipelineReport
  unregister(definitionId: string): void
  setFailures(list: readonly IndicatorFailure[]): void

  readDescriptors(): readonly IndicatorDescriptor[]
  readIndicatorDescriptors(): readonly IndicatorDescriptor[]
  readAlertDescriptors(): readonly IndicatorDescriptor[]
  readDefinitions(): readonly IndicatorMetadata[]

  getDescriptor(nameOrDisplayName: string): IndicatorDescriptor | undefined
  getDefinition(nameOrDisplayName: string): IndicatorMetadata | undefined
  isLoaded(nameOrDisplayName: string): boolean
  isAlert(nameOrDisplayName: string): boolean

  load(names: Iterable<string>): Promise<void>
  loadAll(): Promise<void>

  resolveCanonicalId(
    descriptor: Pick<IndicatorDescriptor, 'name' | 'displayName' | 'source'>,
  ): string
  resolveDefinitionId(nameOrDisplayName: string): string | undefined

  /** 清空全部定义与目录；只用于测试与显式重置。 */
  clear(): void
  dispose(): void
}
