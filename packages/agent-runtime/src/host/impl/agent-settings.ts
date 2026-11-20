/**
 * 宿主独占的 Agent 设置文档与持久化端口。
 *
 * 文档只存在于宿主（SharedWorker）一侧的 IndexedDB 中：Provider 配置、模型池、
 * 工具启用集合与 API Key 都不再经过页面，也不再有第二个读取源。
 */

import { AgentRuntimeError } from '../../contracts/errors.js'
import type { ProviderApiProtocol, ProviderReasoningEffort } from '../../contracts/ui.js'
import { PROVIDER_API_PROTOCOLS, PROVIDER_REASONING_EFFORTS } from '../../contracts/ui.js'
import type {
  OpenAiCompatibleProviderSettings,
  ProviderCredentialStore,
  ProviderModelPoolEntry,
  ProviderSettingsStore,
} from '../../index.js'
import { PROVIDER_SETTINGS_VERSION } from '../../provider-openai-compatible/types.js'

/** Provider 连接信息；apiKey 单独存放在 profile 上，不进入设置视图。 */
export interface AgentProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 一个已保存的 Provider 配置；apiKey 只在宿主内读写。 */
export interface AgentProviderProfile {
  name: string
  apiKey: string
  settings?: OpenAiCompatibleProviderSettings
  connection?: AgentProviderConnection
  active: boolean
}

/** 宿主设置文档；字段变化必须递增版本并给出迁移。 */
export interface AgentSettingsDocument {
  version: 1
  profiles: AgentProviderProfile[]
  modelPool: ProviderModelPoolEntry[]
  /** `null` 表示用户从未配置过；空数组表示用户关闭了全部工具。 */
  enabledTools: string[] | null
  /** 全局 Web Search 凭据。 */
  exaApiKey?: string
}

/** 宿主设置文档的持久化端口；`read` 在从未写入时返回 null。 */
export interface AgentSettingsStorage {
  read(): Promise<unknown>
  write(document: unknown): Promise<void>
}

/** 创建空设置文档；新装用户从全默认状态开始。 */
export function createEmptyAgentSettingsDocument(): AgentSettingsDocument {
  return { version: 1, profiles: [], modelPool: [], enabledTools: null }
}

/** 判定值是否为普通对象，供文档解析使用。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解析失败统一抛出可展示错误，不尝试修补输入。 */
function invalid(message: string): AgentRuntimeError {
  return new AgentRuntimeError('INVALID_PAYLOAD', message)
}

/** 读取必填字符串字段。 */
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`Agent settings field "${field}" must be a string.`)
  return value
}

/** 读取必填数字字段。 */
function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw invalid(`Agent settings field "${field}" must be a finite number.`)
  return value
}

/** 读取数组字段。 */
function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`Agent settings field "${field}" must be an array.`)
  return value
}

/** 解析请求头表；空对象与缺失等价。 */
function parseHeaders(value: unknown, field: string): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw invalid(`Agent settings field "${field}" must be an object.`)
  const headers: Record<string, string> = {}
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== 'string')
      throw invalid(`Agent settings header "${name}" must be a string.`)
    headers[name] = headerValue
  }
  return headers
}

/** 解析 API 协议；只接受受支持的取值。 */
function parseProtocol(value: unknown, field: string): ProviderApiProtocol {
  const protocol = PROVIDER_API_PROTOCOLS.find((candidate) => candidate === value)
  if (protocol === undefined)
    throw invalid(`Agent settings field "${field}" has an unsupported API protocol.`)
  return protocol
}

/** 解析思考强度；空值表示不声明。 */
function parseReasoningEffort(value: unknown, field: string): ProviderReasoningEffort | undefined {
  if (value === undefined) return undefined
  const effort = PROVIDER_REASONING_EFFORTS.find((candidate) => candidate === value)
  if (effort === undefined)
    throw invalid(`Agent settings field "${field}" has an unsupported reasoning effort.`)
  return effort
}

/** 解析思考强度列表。 */
function parseReasoningEfforts(value: unknown, field: string): ProviderReasoningEffort[] {
  return requireArray(value, field).map((entry, index) => {
    const effort = parseReasoningEffort(entry, `${field}[${index}]`)
    if (effort === undefined) throw invalid(`Agent settings field "${field}" must not be empty.`)
    return effort
  })
}

/** 解析 Provider 连接；缺失表示尚未填写连接信息。 */
function parseConnection(value: unknown): AgentProviderConnection | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw invalid('Agent settings connection must be an object.')
  return {
    baseUrl: requireString(value.baseUrl, 'connection.baseUrl'),
    headers: parseHeaders(value.headers, 'connection.headers'),
    protocol: parseProtocol(value.protocol, 'connection.protocol'),
  }
}

/** 解析已选模型的完整设置；版本号只接受当前发布版本。 */
function parseProviderSettings(value: unknown): OpenAiCompatibleProviderSettings | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw invalid('Agent settings profile settings must be an object.')
  if (value.version !== PROVIDER_SETTINGS_VERSION)
    throw invalid('Agent settings profile settings version is unsupported.')
  return {
    version: PROVIDER_SETTINGS_VERSION,
    baseUrl: requireString(value.baseUrl, 'settings.baseUrl'),
    headers: parseHeaders(value.headers, 'settings.headers'),
    modelId: requireString(value.modelId, 'settings.modelId'),
    modelName: requireString(value.modelName, 'settings.modelName'),
    maxOutputTokens: requireNumber(value.maxOutputTokens, 'settings.maxOutputTokens'),
    reasoningEfforts: parseReasoningEfforts(value.reasoningEfforts, 'settings.reasoningEfforts'),
    protocol: parseProtocol(value.protocol, 'settings.protocol'),
    ...(value.contextWindow === undefined
      ? {}
      : { contextWindow: requireNumber(value.contextWindow, 'settings.contextWindow') }),
    ...(value.reasoningEffort === undefined
      ? {}
      : {
          reasoningEffort: parseReasoningEffort(value.reasoningEffort, 'settings.reasoningEffort'),
        }),
  }
}

/** 解析一个 Provider 配置。 */
function parseProfile(value: unknown, index: number): AgentProviderProfile {
  if (!isRecord(value)) throw invalid(`Agent settings profiles[${index}] must be an object.`)
  if (typeof value.active !== 'boolean')
    throw invalid(`Agent settings profiles[${index}].active must be a boolean.`)
  return {
    name: requireString(value.name, `profiles[${index}].name`),
    apiKey: requireString(value.apiKey, `profiles[${index}].apiKey`),
    active: value.active,
    ...(value.settings === undefined ? {} : { settings: parseProviderSettings(value.settings) }),
    ...(value.connection === undefined ? {} : { connection: parseConnection(value.connection) }),
  }
}

/** 解析模型池中的一条模型记录。 */
function parseModelPoolEntry(value: unknown, index: number): ProviderModelPoolEntry {
  if (!isRecord(value)) throw invalid(`Agent settings modelPool[${index}] must be an object.`)
  return {
    provider: requireString(value.provider, `modelPool[${index}].provider`),
    id: requireString(value.id, `modelPool[${index}].id`),
    name: requireString(value.name, `modelPool[${index}].name`),
    ...(value.contextWindow === undefined
      ? {}
      : { contextWindow: requireNumber(value.contextWindow, `modelPool[${index}].contextWindow`) }),
    ...(value.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: requireNumber(
            value.maxOutputTokens,
            `modelPool[${index}].maxOutputTokens`,
          ),
        }),
    ...(value.reasoningEfforts === undefined
      ? {}
      : {
          reasoningEfforts: parseReasoningEfforts(
            value.reasoningEfforts,
            `modelPool[${index}].reasoningEfforts`,
          ),
        }),
    ...(value.defaultReasoningEffort === undefined
      ? {}
      : {
          defaultReasoningEffort: parseReasoningEffort(
            value.defaultReasoningEffort,
            `modelPool[${index}].defaultReasoningEffort`,
          ),
        }),
  }
}

/** 解析启用集合；`null` 表示从未配置。 */
function parseEnabledTools(value: unknown): string[] | null {
  if (value === null || value === undefined) return null
  return requireArray(value, 'enabledTools').map((entry, index) =>
    requireString(entry, `enabledTools[${index}]`),
  )
}

/** 解析一份设置文档；形状不合法时明确报错，不尝试修复。 */
export function parseAgentSettingsDocument(value: unknown): AgentSettingsDocument {
  if (!isRecord(value) || value.version !== 1)
    throw invalid('Agent settings document has an unsupported version.')
  return {
    version: 1,
    profiles: requireArray(value.profiles, 'profiles').map(parseProfile),
    modelPool: requireArray(value.modelPool, 'modelPool').map(parseModelPoolEntry),
    enabledTools: parseEnabledTools(value.enabledTools),
    ...(value.exaApiKey === undefined
      ? {}
      : { exaApiKey: requireString(value.exaApiKey, 'exaApiKey') }),
  }
}

/**
 * 把旧版 LocalStorage 文档转换成宿主文档。
 *
 * 旧文档没有版本字段，凭据存在 profile 上；导入是唯一的兼容入口，
 * 导入完成后页面侧会删除旧键，不留双读。
 */
export function parseLegacySettingsDocument(value: unknown): AgentSettingsDocument {
  if (!isRecord(value)) throw invalid('Legacy Agent settings must be an object.')
  return {
    version: 1,
    profiles: requireArray(value.profiles, 'profiles').map(parseProfile),
    modelPool: requireArray(value.modelPool, 'modelPool').map(parseModelPoolEntry),
    enabledTools: parseEnabledTools(value.enabledTools ?? null),
    ...(value.exaApiKey === undefined
      ? {}
      : { exaApiKey: requireString(value.exaApiKey, 'exaApiKey') }),
  }
}

/**
 * 宿主设置文档的唯一内存与持久化入口。
 *
 * 所有写入先落内存、再写存储；存储失败直接抛出，内存与存储不会长期发散。
 */
export class AgentSettingsStore {
  private document: AgentSettingsDocument | undefined

  constructor(private readonly storage: AgentSettingsStorage) {}

  /** 读取当前文档；首次访问时从存储载入，从未写入时使用空文档。 */
  async read(): Promise<AgentSettingsDocument> {
    this.document ??= await this.load()
    return this.document
  }

  /** 载入存储内容；`null` 表示尚未写入，任何其它非法形状都明确报错。 */
  private async load(): Promise<AgentSettingsDocument> {
    const stored = await this.storage.read()
    return stored === null ? createEmptyAgentSettingsDocument() : parseAgentSettingsDocument(stored)
  }

  /** 整体替换文档并持久化。 */
  async replace(document: AgentSettingsDocument): Promise<void> {
    this.document = document
    await this.storage.write(document)
  }

  /** 用旧版文档替换全部设置；已有文档时拒绝，保证迁移只发生一次。 */
  async importLegacy(raw: unknown): Promise<void> {
    if ((await this.storage.read()) !== null)
      throw new AgentRuntimeError(
        'DUPLICATE_REQUEST',
        'Agent settings were already imported into the host store.',
      )
    await this.replace(parseLegacySettingsDocument(raw))
  }
}

/** 绑定设置文档的 Provider 凭据存储；Key 始终留在宿主。 */
export class AgentSettingsCredentialStore implements ProviderCredentialStore {
  constructor(private readonly settings: AgentSettingsStore) {}

  async read(): Promise<string | undefined> {
    const document = await this.settings.read()
    return document.profiles.find((profile) => profile.active)?.apiKey || undefined
  }

  async write(apiKey: string): Promise<void> {
    const document = await this.settings.read()
    await this.settings.replace({
      ...document,
      profiles: document.profiles.map((profile) =>
        profile.active ? { ...profile, apiKey } : profile,
      ),
    })
  }

  async delete(): Promise<void> {
    await this.write('')
  }
}

/** 绑定设置文档的 Provider 设置存储。 */
export class AgentSettingsProviderStore implements ProviderSettingsStore {
  constructor(private readonly settings: AgentSettingsStore) {}

  async read(): Promise<OpenAiCompatibleProviderSettings | undefined> {
    const document = await this.settings.read()
    return document.profiles.find((profile) => profile.active)?.settings
  }

  async write(settings: OpenAiCompatibleProviderSettings): Promise<void> {
    const document = await this.settings.read()
    await this.settings.replace({
      ...document,
      profiles: document.profiles.map((profile) =>
        profile.active
          ? {
              ...profile,
              settings,
              connection: {
                baseUrl: settings.baseUrl,
                headers: settings.headers,
                protocol: settings.protocol,
              },
            }
          : profile,
      ),
    })
  }
}
