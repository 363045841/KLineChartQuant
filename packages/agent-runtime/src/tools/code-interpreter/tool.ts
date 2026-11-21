// 本文件把代码解释器包装成标准工具定义；执行逻辑留在 CodeInterpreterTool。
import { type Static, Type } from 'typebox'
import type { RuntimeToolDefinition } from '../../pi/types.js'
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

/** 执行期只需要取消信号与进度回报。 */
interface ExecutionControl {
  readonly signal: AbortSignal
  progress(update: { readonly label: string }): void
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** 代码解释器执行逻辑；工具契约由 {@link createCodeInterpreterTool} 声明。 */
export class CodeInterpreterTool {
  readonly #interpreter: CodeInterpreter

  constructor(interpreter: CodeInterpreter) {
    this.#interpreter = interpreter
  }

  /** 提交并轮询一次执行；取消时先终止沙箱任务再返回最终结果。 */
  async runPython(
    input: CodeInterpreterToolInput,
    context?: ExecutionControl,
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

/** 把执行逻辑包装成 Pi 可调用的工具；执行代码有副作用，plan 模式执行期拒绝。 */
export function createCodeInterpreterTool(interpreter: CodeInterpreter): RuntimeToolDefinition {
  const tool = new CodeInterpreterTool(interpreter)
  return {
    name: CODE_INTERPRETER_TOOL_NAME,
    label: 'Run Python',
    description:
      'Execute Python code in an isolated sandbox with numpy and pandas available and outbound network disabled. ' +
      'Read inputs from $INPUT_DIR and write files you want returned into $OUTPUT_DIR.',
    parameters: CodeInterpreterToolParameters,
    effect: 'write',
    executionMode: 'sequential',
    summarizeInput: (input) => `${(input as CodeInterpreterToolInput).code.length} bytes of Python`,
    async execute(input, context) {
      const result = await tool.runPython(input as CodeInterpreterToolInput, context)
      return {
        content: JSON.stringify(result),
        summary:
          result.exitCode === undefined
            ? `Code interpreter finished with status ${result.status}.`
            : `Code interpreter exited with code ${result.exitCode}.`,
      }
    },
  }
}
