/**
 * 语义化配置校验器
 * 包含 JSON Schema 校验、安全校验、业务逻辑校验
 */

import type {
  SemanticChartConfig,
  DataConfig,
  ValidationResult,
  SecurityResult,
  MarkerStyle,
} from './types'

// ============ 常量定义 ============

/** 禁止的属性键（防止原型污染） */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype']

/** 颜色值正则（严格校验） */
const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\))$/

/** 股票代码正则规则
 * 注意：北交所规则持续扩充，以交易所官方公告为准
 * 规则版本日期：2025-01
 */
const SYMBOL_PATTERNS: Record<string, RegExp> = {
  SH: /^(600|601|603|605|688)\d{3}$/,
  SZ: /^(000|001|002|003|300|301)\d{3}$/,
  BJ: /^(83|87|43|82)\d{4}$/,
}

/** 安全限制 */
interface SecurityLimits {
  maxJsonSize: number
  maxIndicators: number
  maxCustomMarkers: number
}

/** 根据 period 计算最大日期范围（天数） */
function getMaxDateRangeDays(period: DataConfig['period']): number {
  const LIMITS: Record<string, number> = {
    '5min': 30,
    '15min': 60,
    '30min': 90,
    '60min': 180,
    daily: 365 * 3,
    weekly: 365 * 5,
    monthly: 365 * 10,
  }
  return LIMITS[period] ?? 365
}

// ============ 单例 Canvas（颜色校验用） ============

const _colorCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
const _colorCtx = _colorCanvas?.getContext('2d') ?? null

// ============ 校验器类 ============

export class SemanticConfigValidator {
  private limits: SecurityLimits
  private _ajv: Promise<any> | null = null

  constructor() {
    this.limits = {
      maxJsonSize: 64 * 1024, // 64KB
      maxIndicators: 10,
      maxCustomMarkers: 100,
    }
  }

  private async getAjv(): Promise<any> {
    if (!this._ajv) {
      this._ajv = (async () => {
        const Ajv = (await import('ajv')).default
        const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
        ajv.addFormat('date', {
          type: 'string',
          validate: (data: string) => /^\d{4}-\d{2}-\d{2}$/.test(data),
        })
        const schemaModule = await import('./schema.json')
        ajv.addSchema(schemaModule.default || schemaModule)
        return ajv
      })()
    }
    return this._ajv
  }

  /**
   * 入口校验（在 JSON.parse 之前调用）
   * 检查原始字符串大小
   */
  validateRawInput(raw: string): ValidationResult {
    const byteLength =
      typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(raw).byteLength : raw.length * 3 // SSR 降级：保守估计

    if (byteLength > this.limits.maxJsonSize) {
      return { valid: false, errors: ['JSON payload too large (max 64KB)'] }
    }
    return { valid: true }
  }

  /**
   * JSON Schema 校验
   */
  async validate(config: unknown): Promise<ValidationResult> {
    // 1. 类型检查
    if (!config || typeof config !== 'object') {
      return { valid: false, errors: ['Config must be an object'] }
    }

    // 2. 原型污染检查
    const protoCheck = this.checkPrototypePollution(config)
    if (!protoCheck.valid) {
      return protoCheck
    }

    // 3. JSON Schema 校验
    try {
      const ajv = await this.getAjv()
      const valid = ajv.validate('https://kmap.dev/schemas/semantic-chart-config/1.0.0', config)
      if (!valid) {
        const errors = ajv.errors?.map(
          (e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`,
        ) || ['Schema validation failed']
        return { valid: false, errors }
      }
    } catch {
      return { valid: false, errors: ['Schema validation unavailable (ajv not loaded)'] }
    }

    return { valid: true }
  }

  /**
   * 安全校验（纯同步）
   */
  securityCheck(config: SemanticChartConfig): SecurityResult {
    const violations: string[] = []

    // 1. 检查日期范围限制
    const dateCheck = this.checkDateRange(config.data)
    if (!dateCheck.valid) {
      violations.push(...(dateCheck.errors || []))
    }

    // 2. 检查股票代码格式
    const symbolCheck = this.checkSymbol(config.data)
    if (!symbolCheck.valid) {
      violations.push(...(symbolCheck.errors || []))
    }

    // 3. 检查指标数量限制
    if (config.indicators) {
      const mainCount = config.indicators.main?.length || 0
      const subCount = config.indicators.sub?.length || 0
      if (mainCount + subCount > this.limits.maxIndicators) {
        violations.push(`Too many indicators (max ${this.limits.maxIndicators})`)
      }
    }

    // 4. 检查标记数量限制
    const markerCount = config.markers?.customMarkers?.length || 0
    if (markerCount > this.limits.maxCustomMarkers) {
      violations.push(`Too many custom markers (max ${this.limits.maxCustomMarkers})`)
    }

    // 5. 检查颜色值格式
    if (config.markers?.customMarkers) {
      for (const marker of config.markers.customMarkers) {
        if (marker.style) {
          const colorCheck = this.checkMarkerStyle(marker.style, marker.id)
          violations.push(...colorCheck)
        }
        // 检查日期格式
        const dateCheck = this.checkMarkerDate(marker.date, marker.id)
        violations.push(...dateCheck)
      }
    }

    return {
      passed: violations.length === 0,
      violations: violations.length > 0 ? violations : undefined,
    }
  }

  // ============ 私有方法 ============

  private checkPrototypePollution(obj: unknown, path = ''): ValidationResult {
    if (!obj || typeof obj !== 'object') {
      return { valid: true }
    }

    const errors: string[] = []
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        errors.push(`Forbidden key "${key}" found at ${path}`)
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true }
  }

  private checkDateRange(data: DataConfig): ValidationResult {
    const errors: string[] = []

    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate)

    if (isNaN(startDate.getTime())) {
      errors.push(`Invalid startDate: ${data.startDate}`)
    }
    if (isNaN(endDate.getTime())) {
      errors.push(`Invalid endDate: ${data.endDate}`)
    }

    if (errors.length > 0) {
      return { valid: false, errors }
    }

    const maxDays = getMaxDateRangeDays(data.period)
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays > maxDays) {
      errors.push(
        `Date range exceeds maximum for period "${data.period}" (max ${maxDays} days, got ${diffDays})`,
      )
    }

    if (diffDays < 0) {
      errors.push('endDate must be after startDate')
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true }
  }

  private checkSymbol(data: DataConfig): ValidationResult {
    const { symbol, exchange } = data

    if (exchange) {
      const pattern = SYMBOL_PATTERNS[exchange]
      if (!pattern || !pattern.test(symbol)) {
        return { valid: false, errors: [`Invalid symbol "${symbol}" for exchange "${exchange}"`] }
      }
    } else {
      // 自动识别
      const valid = Object.values(SYMBOL_PATTERNS).some((p) => p.test(symbol))
      if (!valid) {
        return { valid: false, errors: [`Invalid symbol format: "${symbol}"`] }
      }
    }

    return { valid: true }
  }

  private checkMarkerStyle(style: MarkerStyle, markerId: string): string[] {
    const errors: string[] = []
    const colorFields = ['fillColor', 'strokeColor', 'textColor'] as const

    for (const field of colorFields) {
      const value = style[field]
      if (typeof value === 'string' && !COLOR_PATTERN.test(value)) {
        errors.push(`Invalid ${field} in marker "${markerId}": ${value}`)
      }
    }

    // 检查颜色值安全性（浏览器环境）
    if (_colorCtx) {
      for (const field of colorFields) {
        const value = style[field]
        if (typeof value === 'string') {
          _colorCtx.fillStyle = '#000000'
          _colorCtx.fillStyle = value
          // 浏览器会过滤非法值，如果返回的不是合法颜色说明有问题
          if (
            _colorCtx.fillStyle === '#000000' &&
            value !== '#000000' &&
            !value.startsWith('#000')
          ) {
            errors.push(`Potentially unsafe ${field} in marker "${markerId}": ${value}`)
          }
        }
      }
    }

    return errors
  }

  /** 日期格式正则：YYYY-MM-DD 或 YYYY-MM-DD HH:mm */
  private static readonly DATE_PATTERN = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/

  private checkMarkerDate(date: string, markerId: string): string[] {
    const errors: string[] = []

    if (!SemanticConfigValidator.DATE_PATTERN.test(date)) {
      errors.push(
        `Invalid date format in marker "${markerId}": ${date} (expected YYYY-MM-DD or YYYY-MM-DD HH:mm)`,
      )
      return errors
    }

    // 验证日期是否有效
    const hasTime = date.includes(' ')
    let parsed: Date

    if (hasTime) {
      parsed = new Date(date)
    } else {
      // 对于纯日期，解析为 UTC
      const [year, month, day] = date.split('-').map(Number)
      parsed = new Date(Date.UTC(year!, month! - 1, day!))
    }

    if (isNaN(parsed.getTime())) {
      errors.push(`Invalid date value in marker "${markerId}": ${date}`)
    }

    return errors
  }
}

// ============ 工具函数导出 ============

/**
 * 净化参数对象（防止原型污染）
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(params)) {
    if (!FORBIDDEN_KEYS.includes(key)) {
      safe[key] = value
    }
  }
  return safe
}

/**
 * 净化颜色值（浏览器环境）
 */
export function sanitizeColor(input: string): string | null {
  if (!_colorCtx) return null
  _colorCtx.fillStyle = '#000000'
  _colorCtx.fillStyle = input
  return _colorCtx.fillStyle
}

/**
 * 校验颜色值格式
 */
export function validateColor(color: string): boolean {
  return COLOR_PATTERN.test(color)
}

/**
 * 校验股票代码
 */
export function validateSymbol(symbol: string, exchange?: string): boolean {
  if (exchange) {
    return SYMBOL_PATTERNS[exchange]?.test(symbol) ?? false
  }
  return Object.values(SYMBOL_PATTERNS).some((p) => p.test(symbol))
}
