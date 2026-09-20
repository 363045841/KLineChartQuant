/**
 * Agent Provider HTTP 测试共享夹具：模型目录响应与 OpenAI-compatible fetch stub。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import { vi } from 'vitest'

/** 模型目录条目（OpenAI-compatible `data` 数组元素）。 */
export interface ProviderModelFixture {
  id: string
  name: string
}

/** FakeAgentBridge 用例的默认模型目录。 */
export const FAKE_PROVIDER_MODELS: ReadonlyArray<ProviderModelFixture> = [
  { id: 'provider-model-a', name: 'Provider Model A' },
  { id: 'provider-model-b', name: 'Provider Model B' },
]

/** 浏览器 bridge 用例的默认模型目录。 */
export const CHART_PROVIDER_MODELS: ReadonlyArray<ProviderModelFixture> = [
  { id: 'chart-model', name: 'Chart model' },
]

/** 构造 OpenAI-compatible 模型目录响应。 */
export function providerModelCatalogResponse(
  models: ReadonlyArray<ProviderModelFixture> = FAKE_PROVIDER_MODELS,
): Response {
  return new Response(JSON.stringify({ data: models }), {
    headers: { 'content-type': 'application/json' },
  })
}

/** 将全局 fetch 替换为固定返回模型目录响应的 stub。 */
export function stubProviderModelCatalog(
  models: ReadonlyArray<ProviderModelFixture> = FAKE_PROVIDER_MODELS,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => providerModelCatalogResponse(models)),
  )
}

/**
 * 构造 OpenAI-compatible Provider fetch stub：
 * `/models` 返回模型目录，chat completions 无 tools 时回文本、有 tools 时回显函数探针。
 */
export function createOpenAiCompatibleFetchStub(
  models: ReadonlyArray<ProviderModelFixture> = CHART_PROVIDER_MODELS,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input).endsWith('/models')) return providerModelCatalogResponse(models)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (!Array.isArray(body.tools)) {
      return new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }
    const tool = body.tools[0] as {
      function: { name: string; parameters: { properties: { nonce: { const: string } } } }
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: tool.function.name,
                    arguments: JSON.stringify({
                      nonce: tool.function.parameters.properties.nonce.const,
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  })
}
