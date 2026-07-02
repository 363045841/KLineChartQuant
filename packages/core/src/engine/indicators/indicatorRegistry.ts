import { KLineChartError } from '../../errors'

import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry'
import type { IndicatorMetadata } from './indicatorMetadata'

/**
 * IndicatorRegistry - 指标注册表
 *
 * 管理所有已注册指标的元数据
 * 支持运行时动态注册/注销指标
 *
 * 构造时自动从全局 {@link getRegisteredIndicatorDefinitions | indicatorDefinitionRegistry}
 * 同步已声明的指标，无需外部手动桥接。
 *
 * @param autoSync - 是否在构造时自动同步全局 registry（默认 true）；
 *                   测试环境下应设为 `false` 以避免全局状态污染。
 */
export class IndicatorRegistry {
  private indicators = new Map<string, IndicatorMetadata>()
  private aliases = new Map<string, string>()

  constructor(private autoSync = true) {
    if (autoSync) {
      for (const def of getRegisteredIndicatorDefinitions()) {
        this.register(def)
      }
    }
  }

  private normalize(id: string): string {
    return id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  }

  private indexAlias(alias: string, name: string): void {
    const normalized = this.normalize(alias)
    if (normalized) {
      this.aliases.set(normalized, name)
    }
  }

  private removeAliasesFor(name: string): void {
    for (const [alias, target] of this.aliases) {
      if (target === name) {
        this.aliases.delete(alias)
      }
    }
  }

  /**
   * 注册指标
   * @param meta - 指标元数据
   * @throws 如果 name 为空或元数据无效
   */
  register<T>(meta: IndicatorMetadata<T>): void {
    // 验证必填字段
    if (!meta.name || typeof meta.name !== 'string') {
      throw new KLineChartError('INVALID_PARAM', '[IndicatorRegistry] Indicator name is required')
    }

    if (!meta.displayName) {
      throw new KLineChartError(
        'INVALID_PARAM',
        `[IndicatorRegistry] displayName is required for indicator '${meta.name}'`,
      )
    }

    if (!meta.rendererFactory || typeof meta.rendererFactory !== 'function') {
      throw new KLineChartError(
        'INVALID_PARAM',
        `[IndicatorRegistry] rendererFactory is required for indicator '${meta.name}'`,
      )
    }

    const normalizedName = this.normalize(meta.name)
    if (!normalizedName) {
      throw new KLineChartError('INVALID_PARAM', '[IndicatorRegistry] Indicator name is required')
    }

    // 检查重复注册
    if (this.indicators.has(normalizedName)) {
      console.warn(`[IndicatorRegistry] Indicator '${meta.name}' already registered, overwriting`)
      this.removeAliasesFor(normalizedName)
    }

    this.indicators.set(normalizedName, meta as IndicatorMetadata)
    this.indexAlias(meta.name, normalizedName)
    this.indexAlias(meta.displayName, normalizedName)
    for (const alias of meta.aliases ?? []) {
      this.indexAlias(alias, normalizedName)
    }
  }

  /**
   * 注销指标
   * @param name - 指标名称
   * @returns 是否成功注销
   */
  unregister(name: string): boolean {
    const normalizedName = this.normalize(name)
    const canonicalName = this.aliases.get(normalizedName) ?? normalizedName
    const meta = this.indicators.get(canonicalName)
    if (!meta) return false

    this.indicators.delete(canonicalName)
    this.removeAliasesFor(canonicalName)
    return true
  }

  /**
   * 获取指定指标的元数据
   * @param name - 指标名称
   * @returns 元数据或 undefined
   */
  get(name: string): IndicatorMetadata | undefined {
    const normalizedName = this.normalize(name)
    const canonicalName = this.aliases.get(normalizedName) ?? normalizedName
    return this.indicators.get(canonicalName)
  }

  getRequired(name: string): IndicatorMetadata {
    const meta = this.get(name)
    if (!meta) {
      throw new KLineChartError('NOT_REGISTERED', `[IndicatorRegistry] Unknown indicator '${name}'`)
    }
    return meta
  }

  /**
   * 检查指标是否已注册
   * @param name - 指标名称
   */
  has(name: string): boolean {
    return this.get(name) !== undefined
  }

  /**
   * 获取所有已注册指标
   */
  getAll(): readonly IndicatorMetadata[] {
    return [...this.indicators.values()]
  }

  /**
   * 获取主图指标
   */
  getMainIndicators(): readonly IndicatorMetadata[] {
    return this.getAll().filter((m) => m.category === 'main')
  }

  /**
   * 获取副图指标
   */
  getSubIndicators(): readonly IndicatorMetadata[] {
    return this.getAll().filter((m) => m.category === 'sub')
  }

  /**
   * 获取指标名称列表
   */
  getNames(): string[] {
    return [...this.indicators.keys()]
  }

  /**
   * 清空所有注册指标
   */
  clear(): void {
    this.indicators.clear()
    this.aliases.clear()
  }

  /**
   * 获取已注册指标数量
   */
  get size(): number {
    return this.indicators.size
  }
}
