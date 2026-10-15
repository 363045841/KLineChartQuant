// 本文件承载分级传输选路与日志截断。阈值来自 fly.io 实测（design.md §4.1）。
import { type Artifact, ExecutionRejectedError, type InputFile } from '../contract.js'

import type { ProviderCapabilities } from '../providers/runtime-provider.js'

/** stdout/stderr 各自的截断上限；实测中二者共享 10 MiB 编码预算，此值已在安全线上，不可上调。 */
export const MAX_STREAM_BYTES = 1024 * 1024

const TRUNCATION_MARKER = '\n[truncated: exceeded 1 MiB stream limit]\n'

// 本文件运行在 Provider 无关的层，只用跨环境可用的 Web API，不依赖 Node Buffer。
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** 输入文件的原始字节数。 */
export function inputFileBytes(file: InputFile): number {
  return file.encoding === 'base64'
    ? Math.floor((file.content.replace(/=+$/, '').length * 3) / 4)
    : encoder.encode(file.content).byteLength
}

/**
 * 按 Provider 自述能力选路：小输入走 exec，超阈值切挂载。
 * 超阈值且无挂载通道时返回明确错误——宁可拒绝，也不给一个会静默截断的通道。
 */
export function selectChannel(
  files: readonly InputFile[],
  capabilities: ProviderCapabilities,
): 'inline' | 'mount' {
  const total = files.reduce((sum, file) => sum + inputFileBytes(file), 0)
  if (total <= capabilities.maxInlineInputBytes) return 'inline'
  if (capabilities.supportsMount) return 'mount'
  throw new ExecutionRejectedError(
    `Input files total ${total} bytes, which exceeds the inline limit of ` +
      `${capabilities.maxInlineInputBytes} bytes, and this runtime has no mount channel.`,
  )
}

/** 截断到 1 MiB 并留下明确标记；调用方不得再做二次截断。 */
export function truncateStream(value: string): string {
  const bytes = encoder.encode(value)
  if (bytes.byteLength <= MAX_STREAM_BYTES) return value
  // 忽略尾部被切断的多字节序列，保证结果仍是合法字符串。
  return decoder.decode(bytes.subarray(0, MAX_STREAM_BYTES)) + TRUNCATION_MARKER
}

/**
 * 产物不与日志共用同一次响应（实测：2 MiB 日志已吃满编码预算）。
 * 超出 inline 上限且无挂载通道时，只回传元数据并说明原因，绝不截断内容。
 */
export function applyArtifactPolicy(
  artifacts: readonly Artifact[],
  capabilities: ProviderCapabilities,
): Artifact[] {
  return artifacts.map((artifact) => {
    if (artifact.sizeBytes <= capabilities.maxInlineOutputBytes) return artifact
    if (capabilities.supportsMount) return artifact
    return {
      name: artifact.name,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      omittedReason:
        `Artifact is ${artifact.sizeBytes} bytes, which exceeds the inline limit of ` +
        `${capabilities.maxInlineOutputBytes} bytes, and this runtime has no mount channel.`,
    }
  })
}
