/**
 * 宿主独占的 Agent 设置文档、唯一写入口与对外投影。
 *
 * 文档只存在于宿主（SharedWorker）的内存与 IndexedDB：Provider 配置、模型池、
 * 工具禁用集合与 API Key 都不经过页面。外部只能通过 `AgentSettingsStore.update`
 * 提交一次完整变更，读到的永远是 projection，而不是可变文档。
 */

import { AgentRuntimeError } from '../../contracts/errors.js'
import {
  DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS,
  PROVIDER_API_PROTOCOLS,
  PROVIDER_REASONING_EFFORTS,
  type ProviderApiProtocol,
  type ProviderModelView,
  type ProviderReasoningEffort,
  type ProviderSnapshot,
} from '../../contracts/provider.js'
import type { OpenAiCompatibleProviderSettings } from '../../provider-openai-compatible/types.js'
import { PROVIDER_SETTINGS_VERSION } from '../../provider-openai-compatible/types.js'

/** 当前设置文档版本；结构变化必须递增并给出迁移。 */
export const AGENT_SETTINGS_VERSION = 3

/** 一份已保存的 Provider 连接。 */
export interface AgentProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 模型池中的一条记录；元数据在加入时由宿主校验并固化。 */
export interface AgentProviderModel {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens: number
  reasoningEfforts: ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

/** 一个已保存的 Provider 配置；模型池随配置存储，不再有跨表外键。 */
export interface AgentProviderProfile {
  id: string
  name: string
  apiKey: string
  active: boolean
  connectionRevision: number
  connection?: AgentProviderConnection
  models: AgentProviderModel[]
  selectedModelId?: string
  reasoningEffort?: ProviderReasoningEffort
}

/** 宿主设置文档；唯一事实来源。 */
export interface AgentSettingsDocument {
  version: typeof AGENT_SETTINGS_VERSION
  /** 每次写入递增；跨线程快照用它丢弃过期应答。 */
  revision: number
  profiles: AgentProviderProfile[]
  disabledTools: string[]
  exaApiKey?: string
}

/** 设置文档的持久化端口；`read` 在从未写入时返回 null。 */
export interface AgentSettingsStorage {
  read(): Promise<unknown>
  write(document: unknown): Promise<void>
}

/** 新装用户的空文档。 */
export function createEmptyAgentSettingsDocument(): AgentSettingsDocument {
  return { version: AGENT_SETTINGS_VERSION, revision: 0, profiles: [], disabledTools: [] }
}

/** 解析失败统一抛出可展示错误，不尝试修补输入。 */
function invalid(message: string): AgentRuntimeError {
  return new AgentRuntimeError('INVALID_PAYLOAD', message)
}

/** 判定值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取必填字符串。 */
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`Agent settings field "${field}" must be a string.`)
  return value
}

/** 读取必填的非负整数。 */
function requireCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw invalid(`Agent settings field "${field}" must be a non-negative integer.`)
  return value
}

/** 读取必填的正整数。 */
function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw invalid(`Agent settings field "${field}" must be a positive integer.`)
  return value
}

/** 读取数组字段。 */
function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`Agent settings field "${field}" must be an array.`)
  return value
}

/** 校验并复制请求头表；空对象与缺失等价。 */
export function normalizeProviderHeaders(
  value: unknown,
  field = 'headers',
): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw invalid(`Agent settings field "${field}" must be an object.`)
  const headers: Record<string, string> = {}
  for (const [name, header] of Object.entries(value)) {
    if (!name.trim() || typeof header !== 'string')
      throw invalid(`Agent settings field "${field}" must map header names to strings.`)
    headers[name] = header
  }
  return headers
}

/** 校验并规范化配置名称。 */
export function normalizeProfileName(value: unknown): string {
  const name = requireString(value, 'profile.name').trim()
  if (!name) throw invalid('The Provider configuration name is required.')
  return name
}

/** 校验协议取值。 */
function normalizeProtocol(value: unknown, field: string): ProviderApiProtocol {
  const protocol = PROVIDER_API_PROTOCOLS.find((candidate) => candidate === value)
  if (protocol === undefined)
    throw invalid(`Agent settings field "${field}" has an unsupported API protocol.`)
  return protocol
}

/** 校验协议取值；命令入口复用文档规则。 */
export function normalizeProviderProtocol(value: unknown): ProviderApiProtocol {
  return normalizeProtocol(value, 'connection.protocol')
}

/** 校验思考强度取值；undefined 表示不声明。 */
function normalizeEffort(value: unknown, field: string): ProviderReasoningEffort | undefined {
  if (value === undefined) return undefined
  const effort = PROVIDER_REASONING_EFFORTS.find((candidate) => candidate === value)
  if (effort === undefined)
    throw invalid(`Agent settings field "${field}" has an unsupported reasoning effort.`)
  return effort
}

/** 校验思考强度列表。 */
function normalizeEfforts(value: unknown, field: string): ProviderReasoningEffort[] {
  return requireArray(value, field).map((entry, index) => {
    const effort = normalizeEffort(entry, `${field}[${index}]`)
    if (effort === undefined) throw invalid(`Agent settings field "${field}" must not be empty.`)
    return effort
  })
}

/**
 * 校验模型记录；缺省输出上限使用具名默认值。
 * @param value 页面或旧文档提供的模型记录。
 * @returns 可持久化的模型记录。
 */
export function normalizeProviderModel(value: unknown): AgentProviderModel {
  if (!isRecord(value)) throw invalid('The Provider model must be an object.')
  const id = requireString(value.id, 'model.id')
  if (!id) throw invalid('The Provider model id is required.')
  const reasoningEfforts = normalizeEfforts(value.reasoningEfforts ?? [], 'model.reasoningEfforts')
  const defaultReasoningEffort = normalizeEffort(
    value.defaultReasoningEffort,
    'model.defaultReasoningEffort',
  )
  if (defaultReasoningEffort !== undefined && !reasoningEfforts.includes(defaultReasoningEffort))
    throw invalid('The default reasoning effort must be one of the declared efforts.')
  return {
    id,
    name: requireString(value.name, 'model.name'),
    maxOutputTokens:
      value.maxOutputTokens === undefined
        ? DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS
        : requirePositiveInteger(value.maxOutputTokens, 'model.maxOutputTokens'),
    reasoningEfforts,
    ...(value.contextWindow === undefined
      ? {}
      : { contextWindow: requirePositiveInteger(value.contextWindow, 'model.contextWindow') }),
    ...(defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort }),
  }
}

/** 解析一条连接；缺失表示尚未保存连接。 */
function parseConnection(value: unknown, field: string): AgentProviderConnection | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw invalid(`Agent settings field "${field}" must be an object.`)
  return {
    baseUrl: requireString(value.baseUrl, `${field}.baseUrl`),
    headers: normalizeProviderHeaders(value.headers, `${field}.headers`),
    protocol: normalizeProtocol(value.protocol, `${field}.protocol`),
  }
}

/** 解析模型池记录。 */
function parseModels(value: unknown, field: string): AgentProviderModel[] {
  return requireArray(value, field).map((entry) => normalizeProviderModel(entry))
}

/** 解析配置条目；`id` 缺失时生成稳定标识。 */
function parseProfile(value: unknown, index: number, createId: () => string): AgentProviderProfile {
  const field = `profiles[${index}]`
  if (!isRecord(value)) throw invalid(`Agent settings field "${field}" must be an object.`)
  if (typeof value.active !== 'boolean')
    throw invalid(`Agent settings field "${field}.active" must be a boolean.`)
  const selectedModelId = value.selectedModelId
  if (selectedModelId !== undefined && typeof selectedModelId !== 'string')
    throw invalid(`Agent settings field "${field}.selectedModelId" must be a string.`)
  return {
    id: value.id === undefined ? createId() : requireString(value.id, `${field}.id`),
    name: normalizeProfileName(value.name),
    apiKey: requireString(value.apiKey, `${field}.apiKey`),
    active: value.active,
    connectionRevision: requireCount(value.connectionRevision, `${field}.connectionRevision`),
    models: parseModels(value.models, `${field}.models`),
    ...(value.connection === undefined
      ? {}
      : { connection: parseConnection(value.connection, `${field}.connection`) }),
    ...(selectedModelId === undefined ? {} : { selectedModelId }),
    ...(value.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: normalizeEffort(value.reasoningEffort, `${field}.reasoningEffort`) }),
  }
}

/** 解析禁用集合；缺省表示没有禁用任何工具。 */
function parseDisabledTools(value: unknown): string[] {
  if (value === undefined) return []
  return requireArray(value, 'disabledTools').map((entry, index) =>
    requireString(entry, `disabledTools[${index}]`),
  )
}

/** 解析全局 Web Search 凭据。 */
function parseExaApiKey(value: unknown): { exaApiKey?: string } {
  return value === undefined ? {} : { exaApiKey: requireString(value, 'exaApiKey') }
}

/** 生成一个配置标识。 */
function defaultCreateId(): string {
  return `pf_${crypto.randomUUID()}`
}

/**
 * 解析一份设置文档；形状不合法时明确报错，不尝试修复。
 *
 * v1 / v2 的模型池是跨配置的平铺列表，按 `provider` 名称分派到各配置；
 * 找不到对应配置的条目视为文档损坏，不做猜测性丢弃。
 */
export function parseAgentSettingsDocument(
  value: unknown,
  createId: () => string = defaultCreateId,
): AgentSettingsDocument {
  if (!isRecord(value)) throw invalid('Agent settings document must be an object.')
  if (value.version === AGENT_SETTINGS_VERSION) {
    return {
      version: AGENT_SETTINGS_VERSION,
      revision: requireCount(value.revision, 'revision'),
      profiles: requireArray(value.profiles, 'profiles').map((profile, index) =>
        parseProfile(profile, index, createId),
      ),
      disabledTools: parseDisabledTools(value.disabledTools),
      ...parseExaApiKey(value.exaApiKey),
    }
  }
  if (value.version !== 1 && value.version !== 2)
    throw invalid('Agent settings document has an unsupported version.')
  return migrateLegacyDocument(value, createId)
}

/**
 * 把 v1 / v2 文档迁移到当前版本。
 *
 * 旧文档的 `profile.settings` 是选中模型的整份副本：这里只保留模型身份，
 * 能力字段从同配置的模型池记录重建，其余副本丢弃。
 */
function migrateLegacyDocument(
  value: Record<string, unknown>,
  createId: () => string,
): AgentSettingsDocument {
  const pool = requireArray(value.modelPool, 'modelPool').map((entry, index) => {
    if (!isRecord(entry))
      throw invalid(`Agent settings field "modelPool[${index}]" must be an object.`)
    return {
      provider: requireString(entry.provider, `modelPool[${index}].provider`),
      model: normalizeProviderModel(entry),
    }
  })
  const profiles = requireArray(value.profiles, 'profiles').map((profile, index) => {
    if (!isRecord(profile))
      throw invalid(`Agent settings field "profiles[${index}]" must be an object.`)
    const name = normalizeProfileName(profile.name)
    if (typeof profile.active !== 'boolean')
      throw invalid(`Agent settings field "profiles[${index}].active" must be a boolean.`)
    const models = pool.filter((entry) => entry.provider === name).map((entry) => entry.model)
    const settings = isRecord(profile.settings) ? profile.settings : undefined
    const selectedModelId =
      settings !== undefined &&
      typeof settings.modelId === 'string' &&
      models.some((model) => model.id === settings.modelId)
        ? settings.modelId
        : undefined
    const reasoningEffort =
      selectedModelId === undefined
        ? undefined
        : normalizeEffort(settings?.reasoningEffort, `profiles[${index}].settings.reasoningEffort`)
    return {
      id: createId(),
      name,
      apiKey: requireString(profile.apiKey, `profiles[${index}].apiKey`),
      active: profile.active,
      connectionRevision: 1,
      models,
      ...(profile.connection === undefined
        ? {}
        : { connection: parseConnection(profile.connection, `profiles[${index}].connection`) }),
      ...(selectedModelId === undefined ? {} : { selectedModelId }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    } satisfies AgentProviderProfile
  })
  for (const entry of pool) {
    if (!profiles.some((profile) => profile.name === entry.provider))
      throw invalid(`Agent settings modelPool entry "${entry.provider}" has no matching profile.`)
  }
  return {
    version: AGENT_SETTINGS_VERSION,
    revision: 1,
    profiles,
    disabledTools: value.version === 2 ? parseDisabledTools(value.disabledTools) : [],
    ...parseExaApiKey(value.exaApiKey),
  }
}

/**
 * 把旧版 LocalStorage 文档转换成宿主文档。
 *
 * 旧文档没有版本字段，凭据存在配置上；导入是唯一的兼容入口，导入后页面删除旧键。
 */
export function parseLegacySettingsDocument(
  value: unknown,
  createId: () => string = defaultCreateId,
): AgentSettingsDocument {
  if (!isRecord(value)) throw invalid('Legacy Agent settings must be an object.')
  return migrateLegacyDocument({ ...value, version: 2 }, createId)
}

/** 取当前激活的配置。 */
export function activeProfile(document: AgentSettingsDocument): AgentProviderProfile | undefined {
  return document.profiles.find((profile) => profile.active)
}

/** 取指定配置；不存在时明确报错，不做静默兜底。 */
export function requireProfile(
  document: AgentSettingsDocument,
  profileId: string,
): AgentProviderProfile {
  const profile = document.profiles.find((item) => item.id === profileId)
  if (!profile)
    throw new AgentRuntimeError(
      'PROVIDER_NOT_CONFIGURED',
      'The Provider configuration was not found.',
    )
  return profile
}

/**
 * 把文档投影成运行时所需的已选模型设置。
 *
 * 选中模型必须仍在模型池中，否则视为未配置——不变量由投影保证，
 * 调用方不需要在别处维护“连接变化要清空选择”之类的清理逻辑。
 */
export function projectProviderSettings(
  document: AgentSettingsDocument,
): OpenAiCompatibleProviderSettings | undefined {
  const profile = activeProfile(document)
  const model = profile?.models.find((item) => item.id === profile.selectedModelId)
  if (!profile?.connection || !model) return undefined
  return {
    version: PROVIDER_SETTINGS_VERSION,
    ...profile.connection,
    modelId: model.id,
    modelName: model.name,
    maxOutputTokens: model.maxOutputTokens,
    reasoningEfforts: [...model.reasoningEfforts],
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(profile.reasoningEffort === undefined ? {} : { reasoningEffort: profile.reasoningEffort }),
  }
}

/** 把文档投影成页面消费的只读快照。 */
export function projectProviderSnapshot(document: AgentSettingsDocument): ProviderSnapshot {
  const profile = activeProfile(document)
  return {
    revision: document.revision,
    profiles: document.profiles.map((item) => ({
      id: item.id,
      name: item.name,
      active: item.active,
    })),
    activeProfileId: profile?.id ?? null,
    connection:
      profile?.connection === undefined
        ? null
        : { ...profile.connection, headers: { ...profile.connection.headers } },
    connectionRevision: profile?.connectionRevision ?? 0,
    credentialPresent: Boolean(profile?.apiKey),
    models: (profile?.models ?? []).map(toModelView),
    selectedModelId: profile?.selectedModelId ?? null,
    ...(profile?.reasoningEffort === undefined ? {} : { reasoningEffort: profile.reasoningEffort }),
    exaConfigured: Boolean(document.exaApiKey?.trim()),
  }
}

/** 把持久化模型记录投影成视图；数组复制，避免页面拿到宿主引用。 */
function toModelView(model: AgentProviderModel): ProviderModelView {
  return {
    id: model.id,
    name: model.name,
    maxOutputTokens: model.maxOutputTokens,
    reasoningEfforts: [...model.reasoningEfforts],
    ...(model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
    ...(model.defaultReasoningEffort === undefined
      ? {}
      : { defaultReasoningEffort: model.defaultReasoningEffort }),
  }
}

/**
 * 宿主设置文档的唯一内存与持久化入口。
 *
 * 写入只允许通过 `update`：变更函数拿到的是隔离副本，提交就是一次完整文档替换，
 * 不会出现半个更新；版本号与写入版本由这里统一维护。
 */
export class AgentSettingsStore {
  private document: AgentSettingsDocument | undefined

  constructor(
    private readonly storage: AgentSettingsStorage,
    private readonly createId: () => string = defaultCreateId,
  ) {}

  /** 读取当前文档；首次访问时从存储载入，从未写入时使用空文档。 */
  async read(): Promise<AgentSettingsDocument> {
    this.document ??= await this.load()
    return this.document
  }

  /**
   * 提交一次完整变更。
   * @param change 在隔离副本上执行的变更函数；不得返回新文档。
   * @returns 已提交的新文档。
   */
  async update(change: (draft: AgentSettingsDocument) => void): Promise<AgentSettingsDocument> {
    const current = await this.read()
    const draft = structuredClone(current)
    change(draft)
    draft.version = AGENT_SETTINGS_VERSION
    draft.revision = current.revision + 1
    this.document = draft
    await this.storage.write(draft)
    return draft
  }

  /** 用旧版文档替换全部设置；已有文档时拒绝，保证迁移只发生一次。 */
  async importLegacy(raw: unknown): Promise<void> {
    if ((await this.storage.read()) !== null)
      throw new AgentRuntimeError(
        'DUPLICATE_REQUEST',
        'Agent settings were already imported into the host store.',
      )
    await this.commit(parseLegacySettingsDocument(raw, this.createId))
  }

  /** 直接落盘一份已解析文档；只供迁移与内部初始化使用。 */
  private async commit(document: AgentSettingsDocument): Promise<void> {
    this.document = document
    await this.storage.write(document)
  }

  /** 载入存储内容；`null` 表示尚未写入，任何其它非法形状都明确报错。 */
  private async load(): Promise<AgentSettingsDocument> {
    const stored = await this.storage.read()
    return stored === null
      ? createEmptyAgentSettingsDocument()
      : parseAgentSettingsDocument(stored, this.createId)
  }
}
