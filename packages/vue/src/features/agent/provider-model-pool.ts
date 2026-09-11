/** Provider 模型池的分组 CRUD；持久化由注入的 read/write 提供，内存优先写入。 */
import type { ProviderModelPoolEntry, ProviderModelView } from './agent-contracts'

/** 对模型池数组做增删改查，并按 Provider Profile 名称分组。 */
export class ProviderModelPool {
  private cache: readonly ProviderModelPoolEntry[] | undefined

  constructor(
    private readonly read: () => readonly ProviderModelPoolEntry[],
    private readonly write: (models: readonly ProviderModelPoolEntry[]) => void,
  ) {}

  /** 返回指定分组的模型。 */
  list(providerName: string): ProviderModelPoolEntry[] {
    return this.models().filter((model) => model.provider === providerName)
  }

  /** 向分组新增或按模型 ID 覆盖一个模型。 */
  add(providerName: string, model: ProviderModelView): void {
    const models = this.models()
    const entry = { ...model, provider: providerName }
    const index = models.findIndex((item) => item.provider === providerName && item.id === model.id)
    this.commit(
      index < 0 ? [...models, entry] : models.map((item, i) => (i === index ? entry : item)),
    )
  }

  /** 从分组移除一个模型。 */
  remove(providerName: string, modelId: string): void {
    this.commit(
      this.models().filter((model) => !(model.provider === providerName && model.id === modelId)),
    )
  }

  /** 重命名分组并保留其模型。 */
  renameGroup(previousName: string, nextName: string): void {
    this.commit(
      this.models().map((model) =>
        model.provider === previousName ? { ...model, provider: nextName } : model,
      ),
    )
  }

  /** 删除分组及其模型。 */
  removeGroup(providerName: string): void {
    this.commit(this.models().filter((model) => model.provider !== providerName))
  }

  /** 惰性载入模型池，之后作为唯一内存真相源。 */
  private models(): readonly ProviderModelPoolEntry[] {
    this.cache ??= [...this.read()]
    return this.cache
  }

  /** 更新内存并同步持久化一次。 */
  private commit(models: readonly ProviderModelPoolEntry[]): void {
    this.cache = models
    this.write(models)
  }
}
