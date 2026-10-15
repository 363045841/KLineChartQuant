// 本文件把代码解释器注册进 Core 的 ChartToolRegistry。
// 注册表是 Core 提供的「机制」，本工具是住在 agent-runtime 的「内容」——
// 二者共享同一个模块实例即可跨包注册（design.md §1.1）。
import { type ChartToolExecutionContext, Tool } from '@363045841yyt/klinechart-core/agent-tools'
import { type Static, Type } from 'typebox'
import type { CodeInterpreter, ExecutionRequest, ExecutionResult, InputFile } from './contract.js'
import { MAX_TIMEOUT_MS } from './contract.js'

export const CODE_INTERPRETER_TOOL_NAME = 'code_interpreter'

/** 轮询间隔：本地子进程与云沙箱都以秒级收敛，无需更密。 */
const POLL_INTERVAL_MS = 100

export const CodeInterpreterToolParameters = Type.Object(
  {
    code: Type.String({
      minLength: 1,
      description:
        'Python source to execute. Only the standard library plus numpy and pandas are available.',
    }),
    files: Type.Optional(
      Type.Array(
        Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 255 }),
            content: Type.String(),
            encoding: Type.Optional(Type.Union([Type.Literal('utf8'), Type.Literal('base64')])),
          },
          { additionalProperties: false },
        ),
        { maxItems: 16 },
      ),
    ),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TIMEOUT_MS })),
  },
  { additionalProperties: false },
)

export type CodeInterpreterToolInput = Static<typeof CodeInterpreterToolParameters>

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * `code_interpreter` 工具宿主。
 * 参数校验复用 ChartToolRegistry 的 TypeBox 路径，不另造校验层。
 */
export class CodeInterpreterTool {
  readonly #interpreter: CodeInterpreter

  constructor(interpreter: CodeInterpreter) {
    this.#interpreter = interpreter
  }

  @Tool({
    name: CODE_INTERPRETER_TOOL_NAME,
    label: 'Run Python',
    description:
      'Execute Python code in an isolated sandbox with numpy and pandas available and outbound network disabled. ' +
      'Read inputs from $INPUT_DIR and write files you want returned into $OUTPUT_DIR.',
    parameters: CodeInterpreterToolParameters,
    // 执行 Agent 生成的代码有副作用，按 PRD R5 标注为 destructive。
    safety: 'destructive',
    executionMode: 'sequential',
  })
  async runPython(
    input: CodeInterpreterToolInput,
    context?: ChartToolExecutionContext,
  ): Promise<ExecutionResult> {
    const request: ExecutionRequest = {
      language: 'python',
      code: input.code,
      files: input.files as InputFile[] | undefined,
      policy: { network: 'disabled', packages: 'base' },
      ...(input.timeoutMs === undefined ? {} : { limits: { timeoutMs: input.timeoutMs } }),
    }
    context?.signal.throwIfAborted()
    const task = await this.#interpreter.submit(request)
    context?.progress({ label: 'queued' })

    let reportedRunning = false
    try {
      for (;;) {
        if (context?.signal.aborted) {
          await this.#interpreter.cancel(task.taskId)
          return await this.#interpreter.get(task.taskId)
        }
        const result = await this.#interpreter.get(task.taskId)
        if (result.status === 'running' && !reportedRunning) {
          reportedRunning = true
          context?.progress({ label: 'running' })
        }
        if (result.status !== 'queued' && result.status !== 'running') return result
        await sleep(POLL_INTERVAL_MS)
      }
    } catch (error) {
      await this.#interpreter.cancel(task.taskId).catch(() => undefined)
      throw error
    }
  }
}
