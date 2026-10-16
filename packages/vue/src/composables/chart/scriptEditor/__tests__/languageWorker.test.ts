/** 使用真实 TypeScript 语言服务验证脚本契约、补全和草稿变化，不替换语言服务实现。 */

import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import { describe, expect, it } from 'vitest'
import averageSource from '../../../../../../script/scripts/open-close-average.ts?raw'
import smaSource from '../../../../../../script/scripts/sma.ts?raw'
import { createScriptLanguageWorker } from '../impl/languageWorker.js'
import { SCRIPT_EDITOR_FILE, type ScriptLanguageWorker } from '../types.js'

/** 创建已初始化的语言会话，并把真实源码装入其中。 */
async function createSession(source: string) {
  const worker = createScriptLanguageWorker()
  await worker.initialize()
  worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: source })
  return worker
}

/** 取 token 第 occurrence 次出现的位置，避免命中间名字符串或声明。 */
function positionOf(source: string, token: string, occurrence: number): number {
  let position = -1
  for (let index = 0; index <= occurrence; index++) {
    position = source.indexOf(token, position + 1)
    if (position < 0) throw new Error(`未找到第 ${occurrence} 次出现的 ${token}`)
  }
  return position
}

/** 取 token 第 occurrence 次出现处的悬浮类型文本。 */
function hoveredType(
  worker: ScriptLanguageWorker,
  source: string,
  token: string,
  occurrence = 0,
): string {
  const hover = worker.getHover({
    path: SCRIPT_EDITOR_FILE,
    pos: positionOf(source, token, occurrence),
  })
  return hover?.quickInfo?.displayParts?.map((part) => part.text).join('') ?? ''
}

/** 查询当前文档末尾的候选，复用实际编辑器所用的补全适配。 */
async function completions(source: string) {
  const worker = await createSession(source)
  const result = await worker.getAutocompletion({
    path: SCRIPT_EDITOR_FILE,
    context: { pos: source.length, explicit: true },
  })
  return result?.options.map((option) => option.label) ?? []
}

describe('script language service', () => {
  it('按 inputs 推导的参数类型参与数值上下文判定', async () => {
    const source = `defineIndicator({
      name: 'ParameterContext', inputs: { level: input(2) },
      onBar() {
        function double(value: typeof params.level): number { return value * 2 }
        plot.Line(double(close), { id: 'value' })
      },
    })`
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    expect(hoveredType(worker, source, 'close')).toContain('close: number')
  })

  it.each([
    ["plot.Line(close, { id: 'close', color: Color.Purple })", 'close', 0, 'close: number'],
    ['ta.sma(close, 20)', 'close', 0, 'close: Series'],
    ['const src = close; plot.Line(src, { id: "c" })', 'src', 1, 'src: number'],
    ['const average = ta.sma(close, 20); plot.Line(average, { id: "a" })', 'average', 1, 'number'],
    ['const data = { src: close }; Math.max(data.src, 1)', 'src', 1, 'src: number'],
  ])('悬浮提示按使用位置显示类型：%s', async (source, token, occurrence, expected) => {
    const worker = await createSession(source)
    const position = positionOf(source, token, occurrence)
    const hover = worker.getHover({ path: SCRIPT_EDITOR_FILE, pos: position })
    expect(hover?.quickInfo?.displayParts?.map((part) => part.text).join('')).toContain(expected)
    expect(hover?.start).toBe(position)
    expect(hover?.end).toBe(position + token.length)
  })

  it('函数符号仍显示声明签名，不被当前值映射改写', async () => {
    const source = 'plot.Line(ta.sma(close, 20), { id: "a" })'
    const worker = await createSession(source)
    const hover = worker.getHover({ path: SCRIPT_EDITOR_FILE, pos: positionOf(source, 'sma', 0) })
    expect(hover?.quickInfo?.displayParts?.map((part) => part.text).join('')).toContain(
      'source: Series',
    )
  })

  it('数值上下文无需 [0]，索引访问保持完整序列', async () => {
    const source = `const src = close
      const average = ta.sma(src, 2)
      plot.Line(high - low + src[1] + average, { id: 'combined' })`
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    expect(hoveredType(worker, source, 'average', 1)).toContain('average: number')
    expect(hoveredType(worker, source, 'src', 2)).toContain('src: Series')
  })

  it('globalThis 行情序列与全局序列同型，赋值给非序列值仍被拒绝', async () => {
    const source = `plot.Line(globalThis.close, { id: 'close' })`
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    expect(hoveredType(worker, source, 'close')).toContain('close: number')

    const assigning = await createSession('close = 1')
    expect(assigning.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({ message: expect.stringContaining('Series') }),
    ])
  })

  it('转换后诊断、补全和签名的位置对应原文，更新后不残留旧映射', async () => {
    const prefix = `const spread = high - low; plot.Line(close, { id: 'c' });\n`
    const bad = `${prefix}ta.sma(close, "bad")`
    const worker = await createSession(bad)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({
        from: bad.indexOf('"bad"'),
        to: bad.indexOf('"bad"') + '"bad"'.length,
      }),
    ])
    expect(worker.getSignatureHelp(SCRIPT_EDITOR_FILE, bad.indexOf('"bad"'))?.text).toContain(
      'length: number',
    )
    const editing = `${prefix}ta.sm`
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: editing })
    const result = await worker.getAutocompletion({
      path: SCRIPT_EDITOR_FILE,
      context: { pos: editing.length, explicit: true },
    })
    expect(result?.from).toBe(editing.length - 2)
    expect(result?.options.map((option) => option.label)).toContain('sma')

    const invalid = 'const label = "text"; label - 1'
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: invalid })
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({
        from: invalid.indexOf('label - 1'),
        message: expect.stringContaining('arithmetic operation'),
      }),
    ])
  })

  it('在 plot 对象字面量的属性上显示契约注释', async () => {
    const source = `plot.Point(1, { id: 'overbought', color: '#ff0000', size: ShapeSize.Tiny })`
    const worker = await createSession(source)
    for (const [property, expected] of [
      ['id', '图形 ID'],
      ['color', 'CSS'],
      ['size', '尺寸档位'],
    ]) {
      const hover = worker.getHover({
        path: SCRIPT_EDITOR_FILE,
        pos: source.indexOf(`${property}:`),
      })
      expect(hover?.quickInfo?.documentation?.map((part) => part.text).join('')).toContain(expected)
    }
  })

  it.each([
    ['Line', 'dash: [4, 2]', 'dash', '虚线'],
    ['Histogram', 'baseline: 0', 'baseline', '基线'],
    ['Shape', 'location: ShapeLocation.AboveBar', 'location', '标记位置'],
    ['Shape', 'style: ShapeStyle.Circle', 'style', '标记形状'],
    ['Shape', "text: 'signal'", 'text', '附加文字'],
    ['Shape', "textColor: 'red'", 'textColor', 'CSS'],
    ['Char', "char: '★'", 'char', 'Unicode'],
    ['Arrow', "colorUp: 'red'", 'colorUp', '正值'],
    ['Arrow', "colorDown: 'green'", 'colorDown', '负值'],
  ])('显示 %s 的 %s 属性注释', async (kind, option, property, expected) => {
    const source = `plot.${kind}(1, { id: 'signal', ${option} })`
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    const hover = worker.getHover({
      path: SCRIPT_EDITOR_FILE,
      pos: source.indexOf(`${property}:`),
    })
    expect(hover?.quickInfo?.documentation?.map((part) => part.text).join('')).toContain(expected)
  })

  it.each(builtinScriptSources)('接受现有内置脚本，行情全局不会与 DOM 冲突', async (source) => {
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    const program = worker.getEnv().languageService.getProgram()
    expect(program?.getSourceFiles().some((file) => file.fileName.includes('lib.dom.'))).toBe(false)
    expect(program?.getOptionsDiagnostics()).toEqual([])
  })

  it('从类型声明补全 ta、标准 JS 成员和用户局部变量', async () => {
    expect(await completions('ta.')).toEqual(expect.arrayContaining(['sma', 'wma', 'vwma']))
    expect(await completions('Math.')).toContain('abs')
    expect(await completions('con')).toContain('const')
    expect(await completions('const settings = { length: 20 }; settings.')).toContain('length')
  })

  it.each(['ta.', 'const analysis = ta; analysis.', "importLibrary('ta')."])(
    '从库声明读取补全项右侧的中文名：%s',
    async (source) => {
      const worker = await createSession(source)
      const result = await worker.getAutocompletion({
        path: SCRIPT_EDITOR_FILE,
        context: { pos: source.length, explicit: true },
      })
      expect(result?.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'ema', detail: '指数移动平均', apply: 'ema' }),
          expect.objectContaining({ label: 'vwma', detail: '成交量加权移动平均', apply: 'vwma' }),
          expect.objectContaining({ label: 'crossover', detail: '上穿', apply: 'crossover' }),
          expect.objectContaining({ label: 'crossunder', detail: '下穿', apply: 'crossunder' }),
        ]),
      )
    },
  )

  it('用户库可通过 summary 注释提供中文名，未标注的函数不附加名称', async () => {
    const source = `const stats = defineLibrary('stats', {
      /** @summary 均价 */
      mean(left: number, right: number) { return (left + right) / 2 },
      sum(left: number, right: number) { return left + right }
    }); stats.`
    const worker = await createSession(source)
    const result = await worker.getAutocompletion({
      path: SCRIPT_EDITOR_FILE,
      context: { pos: source.length, explicit: true },
    })
    expect(result?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'mean', detail: '均价', apply: 'mean' }),
        expect.objectContaining({ label: 'sum', detail: undefined, apply: 'sum' }),
      ]),
    )
  })

  it('补全绘图方法，并拒绝旧的函数调用', async () => {
    expect(await completions('plot.')).toEqual(
      expect.arrayContaining(['Line', 'Histogram', 'Point', 'Shape', 'Char', 'Arrow']),
    )
    const worker = await createSession(`plot.Histogram(1, { id: 'volume' })`)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: `plot('histogram', 1, { id: 'volume' })` })
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toHaveLength(
      1,
    )
  })

  it('补全全局 PaneKind 枚举，并检查 pane 的枚举类型', async () => {
    expect(await completions('PaneKind.')).toEqual(expect.arrayContaining(['Main', 'Sub']))
    const worker = await createSession(
      `defineIndicator({ name: 'Pane', pane: PaneKind.Sub, inputs: {}, onBar() {} })`,
    )
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
    worker.updateFile({
      path: SCRIPT_EDITOR_FILE,
      code: `defineIndicator({ name: 'Pane', pane: 'sub', inputs: {}, onBar() {} })`,
    })
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toHaveLength(
      1,
    )
  })

  it.each([
    `plot.Point(true, { id: 'signal' })`,
    `plot.Arrow(false, { id: 'signal' })`,
    `plot.Line(1, { id: 'signal', baseline: 0 })`,
    `plot.Point(1, { id: 'signal', style: ShapeStyle.Circle })`,
    `plot.Shape(true, { id: 'signal', char: 'A' })`,
  ])('按绘图方法检查值和专属样式：%s', async (source) => {
    const worker = await createSession(source)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toHaveLength(
      1,
    )
  })

  it('形状和字符方法接受布尔条件', async () => {
    const worker = await createSession(`
      plot.Shape(true, { id: 'shape', style: ShapeStyle.Circle })
      plot.Char(false, { id: 'char', char: 'A' })
    `)
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
  })

  it('显示 ta 函数的参数签名与类型诊断', async () => {
    const source = 'ta.sma(close, "bad")'
    const worker = await createSession(source)
    expect(worker.getSignatureHelp(SCRIPT_EDITOR_FILE, source.indexOf('"bad"'))?.text).toContain(
      'length: number',
    )
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({ message: expect.stringContaining('number') }),
    ])
    const hover = worker.getHover({ path: SCRIPT_EDITOR_FILE, pos: source.indexOf('sma') })
    expect(hover).toBeTruthy()
  })

  it.each([
    ['ta.sma(', 'source: Series'],
    ['ta.sma(close, ', 'length: number'],
    ['ta.sma(Math.max(1, 2), ', 'length: number'],
    ['Math.max(1, 2, ', '...values: number[]'],
  ])('定位当前参数的签名文本范围：%s', async (source, expected) => {
    const worker = await createSession(source)
    const signature = worker.getSignatureHelp(SCRIPT_EDITOR_FILE, source.length)
    expect(signature?.activeParameter).not.toBeNull()
    const range = signature?.activeParameter
    expect(range && signature?.text.slice(range.from, range.to)).toBe(expected)
  })

  it('从当前 inputs 推导参数，修改草稿后移除旧参数并采用新类型', async () => {
    const worker = await createSession(smaSource)
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: `${smaSource}\nparams.` })
    const first = await worker.getAutocompletion({
      path: SCRIPT_EDITOR_FILE,
      context: { pos: `${smaSource}\nparams.`.length, explicit: true },
    })
    expect(first?.options.map((option) => option.label)).toContain('period')
    const updated = `defineIndicator({
      name: 'Changed', inputs: { enabled: input(true) },
      onBar() { plot.Line(params.enabled ? close[0] : NaN, { id: 'value' }) }
    });\nparams.`
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: updated })
    const next = await worker.getAutocompletion({
      path: SCRIPT_EDITOR_FILE,
      context: { pos: updated.length, explicit: true },
    })
    expect(next?.options.map((option) => option.label)).toContain('enabled')
    expect(next?.options.map((option) => option.label)).not.toContain('period')
    worker.updateFile({
      path: SCRIPT_EDITOR_FILE,
      code: updated.slice(0, -'params.'.length) + '\nta.sma(close, params.enabled)',
    })
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({ message: expect.stringContaining('boolean') }),
    ])
  })

  it('清空文件后仍可补全全局并恢复正常编辑', async () => {
    const worker = await createSession(smaSource)
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: '' })
    const result = await worker.getAutocompletion({
      path: SCRIPT_EDITOR_FILE,
      context: { pos: 0, explicit: true },
    })
    expect(result?.options.map((option) => option.label)).toContain('defineIndicator')
    worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: smaSource })
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
  })

  it('识别声明函数别名和 globalThis 调用，不将局部同名函数当成指标声明', async () => {
    const source = `const declare = defineIndicator;
      declare({ name: 'Alias', inputs: { length: input(10) }, onBar() {} });
      function scope() {
        function defineIndicator(value: unknown) {}
        defineIndicator({ inputs: { fake: input(true) } });
      }
      params.`
    expect(await completions(source)).toContain('length')
    expect(await completions(source)).not.toContain('fake')
    expect(
      await completions(source.replace('declare({', 'globalThis.defineIndicator({')),
    ).toContain('length')
  })

  it('拒绝浏览器全局并在不同编辑会话间隔离参数', async () => {
    const worker = await createSession('document.querySelector("div"); fetch("/api")')
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toHaveLength(
      2,
    )
    const other = await createSession(smaSource)
    expect(other.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
  })
})
