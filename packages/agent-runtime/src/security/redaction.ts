// 本文件只提供用户输入文本的脱敏，不扫描事件或返回对象的字段名。
const AUTHORIZATION = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const API_KEY = /\bsk-[A-Za-z0-9_-]{12,}\b/g
const LOCAL_PATH = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/g

export interface RedactionOptions {
  secretValues?: readonly string[]
  replacement?: string
}

export function redactString(value: string, options: RedactionOptions = {}): string {
  const replacement = options.replacement ?? '[REDACTED]'
  let redacted = value.replace(AUTHORIZATION, replacement).replace(API_KEY, replacement)
  redacted = redacted.replace(LOCAL_PATH, '[LOCAL_PATH]')
  for (const secret of options.secretValues ?? []) {
    if (secret.length > 0) redacted = redacted.split(secret).join(replacement)
  }
  return redacted
}
