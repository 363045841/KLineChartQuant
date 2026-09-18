import { redactString } from '@363045841yyt/klinechart-agent-runtime'
import { beforeEach, describe, expect, it } from 'vitest'

import { BrowserAgentBridge } from '../browser-agent-bridge'

/**
 * `PiRunDriver` 的内置正则只覆盖 Bearer/Basic、`sk-` 前缀与本地路径。真实 Provider Key
 * 必须经 `secretValues` 逐字剔除，否则非 `sk-` 形态的凭据会原样出现在事件流里。
 */
describe('BrowserAgentBridge secret redaction', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  const secretsOf = async (bridge: BrowserAgentBridge): Promise<readonly string[]> =>
    // secretValues 是私有的：这里断言的是它的产物，而不是它的存在。
    await (bridge as unknown as { secretValues(): Promise<readonly string[]> }).secretValues()

  it('collects the provider key so it can be stripped verbatim', async () => {
    const bridge = new BrowserAgentBridge()
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'glm-4-not-an-openai-shaped-key',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    expect(await secretsOf(bridge)).toContain('glm-4-not-an-openai-shaped-key')
  })

  it('strips a non sk- provider key that the built-in patterns miss', async () => {
    const key = 'glm-4-not-an-openai-shaped-key'
    // 先证明内置正则确实漏掉它，再证明加入 secretValues 后被剔除。
    expect(redactString(`leaked ${key}`)).toContain(key)
    expect(redactString(`leaked ${key}`, { secretValues: [key] })).not.toContain(key)
  })

  it('includes the web search key alongside the provider key', async () => {
    const bridge = new BrowserAgentBridge()
    await bridge.saveProvider({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'provider-secret',
      exaApiKey: 'exa-secret',
      protocol: 'openai-completions',
      profileName: 'Provider example',
    })

    const secrets = await secretsOf(bridge)
    expect(secrets).toContain('provider-secret')
    expect(secrets).toContain('exa-secret')
  })

  it('yields no secrets before a provider is configured', async () => {
    expect(await secretsOf(new BrowserAgentBridge())).toEqual([])
  })
})
