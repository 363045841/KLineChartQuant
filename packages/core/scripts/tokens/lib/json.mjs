// DTCG JSON 序列化：分组展开，token 叶子在行宽内单行输出，便于审阅；最终由 biome 规范化。

function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`
  if (v && typeof v === 'object') {
    const body = Object.entries(v)
      .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
      .join(', ')
    return body ? `{ ${body} }` : '{}'
  }
  return JSON.stringify(v)
}

const isLeaf = (v) => v && typeof v === 'object' && !Array.isArray(v) && '$value' in v

export function stringifyTokens(data, width = 100) {
  function block(v, ind) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return inline(v)
    const pad = ' '.repeat(ind + 2)
    const entries = Object.entries(v).map(([k, x]) => {
      const head = `${pad}${JSON.stringify(k)}: `
      if (isLeaf(x)) {
        const s = inline(x)
        if (head.length + s.length + 1 <= width) return head + s
        const inner = Object.entries(x).map(
          ([kk, xx]) => `${pad}  ${JSON.stringify(kk)}: ${inline(xx)}`,
        )
        return `${head}{\n${inner.join(',\n')}\n${pad}}`
      }
      return head + block(x, ind + 2)
    })
    return entries.length ? `{\n${entries.join(',\n')}\n${' '.repeat(ind)}}` : '{}'
  }
  return `${block(data, 0)}\n`
}
