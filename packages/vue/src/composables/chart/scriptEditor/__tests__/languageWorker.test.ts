/** 使用真实 TypeScript 语言服务验证脚本契约、补全和草稿变化，不替换语言服务实现。 */
import { describe, expect, it } from 'vitest'
import averageSource from '../../../../../../script/scripts/open-close-average.js?raw'
import smaSource from '../../../../../../script/scripts/sma.js?raw'
import { createScriptLanguageWorker } from '../impl/languageWorker.js'
import { SCRIPT_EDITOR_FILE } from '../types.js'

/** 创建已初始化的语言会话，并把真实源码装入其中。 */
async function createSession(source: string) {
  const worker = createScriptLanguageWorker()
  await worker.initialize()
  worker.updateFile({ path: SCRIPT_EDITOR_FILE, code: source })
  return worker
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
  it.each([smaSource, averageSource])(
    '接受现有内置脚本，行情全局不会与 DOM 冲突',
    async (source) => {
      const worker = await createSession(source)
      expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([])
      const program = worker.getEnv().languageService.getProgram()
      expect(program?.getSourceFiles().some((file) => file.fileName.includes('lib.dom.'))).toBe(
        false,
      )
      expect(program?.getOptionsDiagnostics()).toEqual([])
    },
  )

  it('从类型声明补全 ta、标准 JS 成员和用户局部变量', async () => {
    expect(await completions('ta.')).toEqual(expect.arrayContaining(['sma', 'wma', 'vwma']))
    expect(await completions('Math.')).toContain('abs')
    expect(await completions('con')).toContain('const')
    expect(await completions('const settings = { length: 20 }; settings.')).toContain('length')
  })

  it('补全全局绘图枚举，并检查第一个参数的枚举类型', async () => {
    expect(await completions('PlotKind.')).toEqual(
      expect.arrayContaining(['Line', 'Histogram', 'Points']),
    )
    expect(await completions('globalThis.PlotKind.')).toEqual(
      expect.arrayContaining(['Line', 'Histogram', 'Points']),
    )
    const worker = await createSession(`plot(globalThis.PlotKind.Histogram, 1, { id: 'volume' })`)
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

  it('显示 ta 函数的参数签名与类型诊断', async () => {
    const source = 'ta.sma(close, "bad")'
    const worker = await createSession(source)
    expect(worker.getSignatureHelp(SCRIPT_EDITOR_FILE, source.indexOf('"bad"'))).toContain(
      'length: number',
    )
    expect(worker.getLints({ path: SCRIPT_EDITOR_FILE, diagnosticCodesToIgnore: [] })).toEqual([
      expect.objectContaining({ message: expect.stringContaining('number') }),
    ])
    const hover = worker.getHover({ path: SCRIPT_EDITOR_FILE, pos: source.indexOf('sma') })
    expect(hover).toBeTruthy()
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
      onBar() { plot(PlotKind.Line, params.enabled ? close[0] : NaN, { id: 'value' }) }
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
        function defineIndicator(value) {}
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
