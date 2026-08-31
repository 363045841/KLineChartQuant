import { Type } from 'typebox'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  Tool,
  clearRegisteredToolsForTest,
  createRegisteredRuntimeTools,
  getRegisteredTools,
} from '../index'

afterEach(() => {
  clearRegisteredToolsForTest()
})

beforeEach(() => {
  clearRegisteredToolsForTest()
})

describe('@Tool', () => {
  it('registers static metadata and creates runtime definitions through the host factory', async () => {
    const Parameters = Type.Object({ symbol: Type.String() })
    const register = Tool({
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters: Parameters,
      safety: 'read-only',
      executionMode: 'parallel',
    })
    class InspectChartTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: 'BTCUSDT', summary: 'Chart inspected.' }
      }
    }
    register(InspectChartTool, decoratorContext(InspectChartTool))

    expect(getRegisteredTools()).toMatchObject([
      { config: { name: 'chart.inspect', safety: 'read-only' }, type: InspectChartTool },
    ])

    const createImplementation = vi.fn((tool) => new tool.type())
    const [definition] = createRegisteredRuntimeTools(false, createImplementation)
    expect(definition?.name).toBe('chart.inspect')
    expect(definition?.reversible).toBe(false)
    expect(createImplementation).not.toHaveBeenCalled()
    await expect(
      definition?.execute({ symbol: 'BTCUSDT' }, {
        runId: 'run-1',
        toolCallId: 'tool-1',
        signal: new AbortController().signal,
        progress: () => undefined,
      }),
    ).resolves.toMatchObject({ content: 'BTCUSDT' })
    expect(createImplementation).toHaveBeenCalledOnce()
  })

  it('rejects duplicate tool names during registration', () => {
    const registerFirst = Tool({
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters: Type.Object({}),
      safety: 'read-only',
    })
    class FirstTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: '', summary: '' }
      }
    }
    registerFirst(FirstTool, decoratorContext(FirstTool))

    let thrown: unknown
    try {
      const registerDuplicate = Tool({
        name: 'chart.inspect',
        label: 'Inspect again',
        description: 'Read another chart snapshot.',
        parameters: Type.Object({}),
        safety: 'read-only',
      })
      class DuplicateTool {
        async execute(): Promise<{ content: string; summary: string }> {
          return { content: '', summary: '' }
        }
      }
      registerDuplicate(DuplicateTool, decoratorContext(DuplicateTool))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ code: 'TOOL_NAME_CONFLICT' } satisfies Partial<AgentRuntimeError>)

    expect(FirstTool).toBeDefined()
  })

  it('owns an immutable schema copy instead of sharing the caller configuration', () => {
    const parameters = Type.Object({ symbol: Type.String() })
    const config = {
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters,
      safety: 'read-only' as const,
    }
    const register = Tool(config)
    class InspectTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: '', summary: '' }
      }
    }
    register(InspectTool, decoratorContext(InspectTool))

    Reflect.set(config, 'label', 'Mutated label')
    Reflect.set(parameters.properties.symbol, 'type', 'number')
    const [tool] = getRegisteredTools()
    const properties = Reflect.get(tool?.config.parameters ?? {}, 'properties')
    const symbolSchema = Reflect.get(properties, 'symbol')

    expect(tool?.config.label).toBe('Inspect chart')
    expect(Reflect.get(symbolSchema, 'type')).toBe('string')
    expect(Reflect.set(symbolSchema, 'type', 'number')).toBe(false)
  })

  it('validates Provider input before invoking a tool implementation', async () => {
    const execute = vi.fn(async () => ({ content: 'BTCUSDT', summary: 'Chart inspected.' }))
    const register = Tool({
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters: Type.Object({ symbol: Type.String() }),
      safety: 'read-only',
    })
    class InspectTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return execute()
      }
    }
    register(InspectTool, decoratorContext(InspectTool))

    const [definition] = createRegisteredRuntimeTools(false, (tool) => new tool.type())
    let thrown: unknown
    try {
      definition?.execute({ symbol: 1 }, {
        runId: 'run-1',
        toolCallId: 'tool-1',
        signal: new AbortController().signal,
        progress: () => undefined,
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({ code: 'INVALID_PAYLOAD' } satisfies Partial<AgentRuntimeError>)
    expect(thrown).toBeInstanceOf(AgentRuntimeError)
    expect((thrown as AgentRuntimeError).message).toContain('/symbol: must be string')
    expect(execute).not.toHaveBeenCalled()
  })

  it('uses a bounded JSON snapshot when a tool does not provide an input summary', () => {
    const register = Tool({
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters: Type.Object({ query: Type.String() }),
      safety: 'read-only',
    })
    class InspectTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: '', summary: '' }
      }
    }
    register(InspectTool, decoratorContext(InspectTool))

    const [definition] = createRegisteredRuntimeTools(false, (tool) => new tool.type())
    const summary = definition?.summarizeInput?.({ query: 'x'.repeat(250) })

    expect(summary).toHaveLength(200)
    expect(summary).toMatch(/^\{"query":"x+/)
    expect(summary?.endsWith('...')).toBe(true)
  })

  it('filters destructive tools from read-only runs', () => {
    const registerInspect = Tool({
      name: 'chart.inspect',
      label: 'Inspect chart',
      description: 'Read a chart snapshot.',
      parameters: Type.Object({}),
      safety: 'read-only',
    })
    class InspectTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: '', summary: '' }
      }
    }
    registerInspect(InspectTool, decoratorContext(InspectTool))

    const registerClear = Tool({
      name: 'chart.clear',
      label: 'Clear chart',
      description: 'Clear all chart drawings.',
      parameters: Type.Object({}),
      safety: 'destructive',
    })
    class ClearTool {
      async execute(): Promise<{ content: string; summary: string }> {
        return { content: '', summary: '' }
      }
    }
    registerClear(ClearTool, decoratorContext(ClearTool))

    const tools = createRegisteredRuntimeTools(true, (tool) => new tool.type())
    expect(tools.map((tool) => tool.name)).toEqual(['chart.inspect'])
    expect(InspectTool).toBeDefined()
    expect(ClearTool).toBeDefined()
  })
})

/** 模拟标准 Decorator 在类初始化完成后调用的注册回调。 */
function decoratorContext<T extends new (...args: any[]) => unknown>(type: T): ClassDecoratorContext<T> {
  return {
    kind: 'class',
    name: type.name,
    metadata: undefined,
    addInitializer(initializer) {
      initializer.call(type)
    },
  }
}
