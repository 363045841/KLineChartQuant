// 外部链接与导航策略：Renderer 里的任何 URL 都被视为不可信内容，只有显式解析并命中
// 协议/域名白名单的地址才允许交给系统浏览器打开，主窗口也不得被导航离开应用自身来源。

/** 外链唯一允许的协议，`http:`/`file:`/`javascript:`/自定义协议一律拒绝。 */
export const EXTERNAL_LINK_PROTOCOL = 'https:'

/** 外链允许的域名，命中条目本身或其子域才放行，避免 `evil-302.ai` 这类后缀伪造。 */
export const EXTERNAL_LINK_ALLOWED_HOSTS: readonly string[] = ['302.ai', 'github.com']

/** 打包后 Renderer 页面使用的协议。 */
export const APPLICATION_FILE_PROTOCOL = 'file:'

export type ExternalLinkRejection = 'malformed' | 'protocol-not-allowed' | 'host-not-allowed'

export type ExternalLinkDecision =
  | { readonly allowed: true; readonly url: string }
  | { readonly allowed: false; readonly reason: ExternalLinkRejection }

export interface NavigationPolicyOptions {
  /** 放行时真正打开外链的实现，注入以便测试与主进程解耦。 */
  readonly openExternal: (url: string) => void
  /** 应用自身页面地址：开发模式是 Vite Renderer URL，打包后是 index.html 的 file URL。 */
  readonly applicationUrl: string
  /** 拒绝时的上报回调，用于审计，不参与放行决策。 */
  readonly onRejected?: (rawUrl: string, reason: ExternalLinkRejection) => void
}

export interface NavigationPolicy {
  /** 处理 Renderer 请求打开新窗口的 URL；只有通过白名单才交给系统浏览器。 */
  handleWindowOpen(rawUrl: string): void
  /** 判断主窗口是否可以导航到该 URL；返回 false 时调用方必须阻止本次导航。 */
  handleWillNavigate(rawUrl: string): boolean
}

// host 精确等于白名单条目，或是它的子域。
function hostAllowed(host: string): boolean {
  const normalized = host.toLowerCase()
  return EXTERNAL_LINK_ALLOWED_HOSTS.some(
    (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
  )
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/** 判定一个 URL 能否作为外链交给系统浏览器，失败时给出可审计的拒绝原因。 */
export function decideExternalLink(rawUrl: string): ExternalLinkDecision {
  const url = parseUrl(rawUrl)
  if (!url) return { allowed: false, reason: 'malformed' }
  if (url.protocol !== EXTERNAL_LINK_PROTOCOL) {
    return { allowed: false, reason: 'protocol-not-allowed' }
  }
  if (!hostAllowed(url.hostname)) return { allowed: false, reason: 'host-not-allowed' }
  return { allowed: true, url: url.toString() }
}

/**
 * 判断 URL 是否指向应用自身页面。只用于放行应用内导航，不能用来放行外链。
 * `file:` URL 的 origin 恒为 `null`，因此改为比较页面路径，避免把任意本地文件当成自身来源。
 */
export function isApplicationOrigin(rawUrl: string, applicationUrl: string): boolean {
  const url = parseUrl(rawUrl)
  const application = parseUrl(applicationUrl)
  if (!url || !application || url.protocol !== application.protocol) return false
  return url.protocol === APPLICATION_FILE_PROTOCOL
    ? url.pathname === application.pathname
    : url.origin === application.origin
}

/** 组装窗口打开与导航两处的策略处理器，供主进程接到对应 Electron 事件上。 */
export function createNavigationPolicy(options: NavigationPolicyOptions): NavigationPolicy {
  const reject = (rawUrl: string, reason: ExternalLinkRejection): void => {
    options.onRejected?.(rawUrl, reason)
  }

  return {
    handleWindowOpen(rawUrl) {
      const decision = decideExternalLink(rawUrl)
      if (decision.allowed) options.openExternal(decision.url)
      else reject(rawUrl, decision.reason)
    },
    handleWillNavigate(rawUrl) {
      // 应用自身页面正常导航；外部地址一律阻止，命中白名单的改为在系统浏览器打开。
      if (isApplicationOrigin(rawUrl, options.applicationUrl)) return true
      const decision = decideExternalLink(rawUrl)
      if (decision.allowed) options.openExternal(decision.url)
      else reject(rawUrl, decision.reason)
      return false
    },
  }
}
