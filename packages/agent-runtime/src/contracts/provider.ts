/**
 * Provider 域契约：宿主文档的只读投影、远端目录视图与页面可发起的命令集合。
 *
 * 页面不持有 Provider 状态：读只有一个入口 `snapshot()`，写全部是命令并返回同一口径的
 * 完整快照；跨线程载荷只含标识与普通数据，不传视图对象。
 */

/** 受支持的 OpenAI-compatible API 协议。 */
export const PROVIDER_API_PROTOCOLS = ['openai-responses', 'openai-completions'] as const

export type ProviderApiProtocol = (typeof PROVIDER_API_PROTOCOLS)[number]

/** 模型可声明的思考强度。 */
export const PROVIDER_REASONING_EFFORTS = ['high', 'medium', 'low', 'none'] as const

export type ProviderReasoningEffort = (typeof PROVIDER_REASONING_EFFORTS)[number]

/** Provider 未声明单次输出上限时使用的具名默认值。 */
export const DEFAULT_PROVIDER_MAX_OUTPUT_TOKENS = 16_384

/** 一个可加入模型池或被选中的模型记录。 */
export interface ProviderModelView {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  reasoningEfforts?: readonly ProviderReasoningEffort[]
  defaultReasoningEffort?: ProviderReasoningEffort
}

/** 已保存的供应商配置条目；API Key 永不出宿主。 */
export interface ProviderProfileView {
  id: string
  name: string
  active: boolean
}

/** 已保存的连接设置；不含凭据。 */
export interface ProviderConnectionView {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 当前激活配置的完整只读快照；页面渲染 Provider 的唯一事实来源。 */
export interface ProviderSnapshot {
  /** 宿主文档的写入版本；页面据此丢弃过期应答。 */
  revision: number
  profiles: readonly ProviderProfileView[]
  activeProfileId: string | null
  connection: ProviderConnectionView | null
  /** 连接版本；保存连接时递增，用于判定已取回的目录是否仍对应当前连接。 */
  connectionRevision: number
  credentialPresent: boolean
  /** 当前配置已启用（模型池）的模型记录。 */
  models: readonly ProviderModelView[]
  selectedModelId: string | null
  reasoningEffort?: ProviderReasoningEffort
  exaConfigured: boolean
}

/** 一次远端模型目录读取结果；不持久化，每次按需现取。 */
export interface ProviderCatalogView {
  /** 读取时该配置的标识。 */
  profileId: string
  /** 读取时该配置的连接版本。 */
  connectionRevision: number
  models: readonly ProviderModelView[]
}

/** 保存连接的命令输入；`apiKey` 省略或为空表示保留已保存的凭据。 */
export interface ProviderConnectionInput {
  profileId: string
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
  apiKey?: string
}

/**
 * Provider 管理 API：宿主实现、页面调用，任何行为都不得绕过。
 *
 * 命令只接收标识与普通数据，返回新快照；唯一触网的是 `refreshCatalog`。
 */
export interface ProviderAdmin {
  /** 读取当前完整快照。 */
  snapshot(): Promise<ProviderSnapshot>
  /** 新建配置并设为激活项。 */
  createProfile(name: string): Promise<ProviderSnapshot>
  /** 重命名配置；模型池随配置存储，不需要级联改写。 */
  renameProfile(profileId: string, name: string): Promise<ProviderSnapshot>
  /** 删除配置及其凭据与模型池。 */
  deleteProfile(profileId: string): Promise<ProviderSnapshot>
  /** 切换激活配置。 */
  selectProfile(profileId: string): Promise<ProviderSnapshot>
  /** 保存连接；连接变化时递增连接版本，模型池保持不动。 */
  saveConnection(input: ProviderConnectionInput): Promise<ProviderSnapshot>
  /** 读取远端模型目录；宿主不缓存，每次都现取。 */
  refreshCatalog(profileId: string): Promise<ProviderCatalogView>
  /** 把一个模型加入模型池。 */
  addModel(profileId: string, model: ProviderModelView): Promise<ProviderSnapshot>
  /** 从模型池移除一个模型；若是当前选中项则一并清空选择。 */
  removeModel(profileId: string, modelId: string): Promise<ProviderSnapshot>
  /** 选择当前运行使用的模型。 */
  selectModel(profileId: string, modelId: string): Promise<ProviderSnapshot>
  /** 设置思考强度；模型未声明该档位时明确报错。 */
  setReasoningEffort(
    profileId: string,
    effort: ProviderReasoningEffort | undefined,
  ): Promise<ProviderSnapshot>
  /** 保存全局 Web Search 凭据；空值表示清除。 */
  saveExaKey(apiKey: string): Promise<ProviderSnapshot>
}
