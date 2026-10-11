// Style Dictionary v5：负责别名解析与 DTCG → CSS 值转换。排列由 resolver.mjs 负责，
// 因为 SD 尚未支持 Resolver Module（style-dictionary#1590）。
import StyleDictionary from 'style-dictionary'
import { cssValue } from './css-value.mjs'

const TRANSFORM = 'kcq/css-value'
let registered = false

function register() {
  if (registered) return
  StyleDictionary.registerTransform({
    name: TRANSFORM,
    type: 'value',
    // 传递式：别名先指向已转换的目标值，再对复合值（如引用颜色的阴影）补做序列化。
    transitive: true,
    filter: () => true,
    transform: (token) => cssValue(token.$type, token.$value, token.$extensions),
  })
  registered = true
}

/**
 * 返回已解析、已转换的 token 树。每个叶子保留 `$value`（CSS 文本或数字）、
 * `$type`、`path` 与 `original`（含原始别名），供各输出格式使用。
 */
export async function exportTokens(tokens) {
  register()
  const sd = new StyleDictionary({
    tokens,
    platforms: { kcq: { transforms: [TRANSFORM] } },
    log: { verbosity: 'silent', warnings: 'disabled', errors: { brokenReferences: 'throw' } },
  })
  return sd.exportPlatform('kcq')
}
