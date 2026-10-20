/** 从代码提示框共用的契约与 JSDoc 生成 Script API Markdown，不维护第二份 API 目录。 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs'
import ts from 'typescript'
import { collectEditorResources } from './generate-editor-resources.mjs'
import { generateScriptEnums } from './generate-script-enums.mjs'
import { writeGeneratedFile } from './lib/generated-file.mjs'

const outputFile = fileURLToPath(new URL('../../../docs/script/api.md', import.meta.url))

/** 将 TypeScript 文档分段还原为 Markdown，保留 JSDoc 中的链接。 */
function display(parts) {
  return ts.displayPartsToString(parts)
}

/** 从当前编辑器资源生成文档；类型依赖只追踪脚本可达声明，不收录宿主 API。 */
export function renderScriptApi({ files, libraries, entry }) {
  const environment = createVirtualTypeScriptEnvironment(
    createSystem(new Map(Object.entries({ ...files, ...libraries }))),
    [entry],
    ts,
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
  )
  const program = environment.languageService.getProgram()
  if (!program) throw new Error('无法创建 Script API 类型程序')
  const checker = program.getTypeChecker()
  const printer = ts.createPrinter({ removeComments: true })
  const sections = []
  const referencedTypes = new Set()
  const renderedTypes = new Set()
  const documentedSymbols = new Set()
  const format =
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

  /** 跟随类型引用与继承声明，保留泛型、条件类型和映射类型依赖。 */
  function collectReferences(node) {
    if (
      ts.isTypeReferenceNode(node) ||
      ts.isExpressionWithTypeArguments(node) ||
      ts.isTypeQueryNode(node)
    ) {
      const name = ts.isTypeReferenceNode(node)
        ? node.typeName
        : ts.isTypeQueryNode(node)
          ? node.exprName
          : node.expression
      let symbol = checker.getSymbolAtLocation(name)
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      for (const declaration of symbol?.declarations ?? []) {
        if (
          declaration.getSourceFile().fileName in files &&
          (ts.isInterfaceDeclaration(declaration) ||
            ts.isTypeAliasDeclaration(declaration) ||
            ts.isEnumDeclaration(declaration))
        ) {
          referencedTypes.add(declaration)
        }
      }
    }
    ts.forEachChild(node, collectReferences)
  }

  /** 正文与所有标签直接来自语言服务，与 hover 使用相同的注释语义。 */
  function documentation(symbol) {
    const blocks = []
    const body = display(symbol.getDocumentationComment(checker))
    if (body) blocks.push(body)
    for (const tag of symbol.getJsDocTags(checker)) {
      const text = display(tag.text)
      blocks.push(`**@${tag.name}**${text ? ` ${text}` : ''}`)
    }
    return blocks.join('\n\n')
  }

  /** 记录标题、签名与原始 Markdown 注释，生成稳定的目录锚点。 */
  function section(name, signature, symbol) {
    documentedSymbols.add(symbol)
    sections.push({
      name,
      content:
        `### ${name}\n\n\`\`\`ts\n${signature}\n\`\`\`\n\n${documentation(symbol)}`.trimEnd(),
    })
  }

  /** 展开脚本命名空间与嵌套对象，Series 等实例类型留在相关类型中说明。 */
  function api(symbol, name, ancestors = new Set()) {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!declaration) return
    for (const node of symbol.declarations ?? []) collectReferences(node)
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    const signatures = type.getCallSignatures()
    const signature = ts.isEnumMember(declaration)
      ? `${name} = ${JSON.stringify(checker.getConstantValue(declaration))}`
      : signatures.length
        ? signatures
            .map((item) => `${name}${checker.signatureToString(item, declaration, format)}`)
            .join('\n')
        : `${name}: ${checker.typeToString(type, declaration, format)}`
    section(name, signature, symbol)
    if (signatures.length || ancestors.has(type)) return
    // 只展开根全局对象及其匿名子对象，避免把行情序列的实例成员重复到每个行情变量下。
    const objectNamespace =
      ts.isVariableDeclaration(declaration) &&
      (!declaration.type ||
        !ts.isTypeReferenceNode(declaration.type) ||
        !checker.getTypeFromTypeNode(declaration.type).getNumberIndexType())
    const anonymousObject =
      ts.isPropertySignature(declaration) &&
      declaration.type &&
      ts.isTypeLiteralNode(declaration.type)
    if (!objectNamespace && !anonymousObject) return
    const next = new Set([...ancestors, type])
    for (const member of type.getProperties()) api(member, `${name}.${member.getName()}`, next)
  }

  // 入口的 declare global 与全局枚举就是脚本作者可用的 API 范围。
  const globals = program.getSourceFile(entry)
  if (!globals) throw new Error('缺少 Script 全局声明')
  for (const file of program.getSourceFiles()) {
    if (!(file.fileName in files)) continue
    for (const statement of file.statements) {
      if (ts.isEnumDeclaration(statement) && !ts.isExternalModule(file)) {
        const symbol = checker.getSymbolAtLocation(statement.name)
        if (symbol) api(symbol, symbol.getName())
        for (const member of statement.members) {
          const memberSymbol = checker.getSymbolAtLocation(member.name)
          if (memberSymbol) api(memberSymbol, `${statement.name.text}.${memberSymbol.getName()}`)
        }
      }
      if (
        file !== globals ||
        !ts.isModuleDeclaration(statement) ||
        !statement.body ||
        !ts.isModuleBlock(statement.body)
      )
        continue
      for (const declaration of statement.body.statements) {
        if (ts.isVariableStatement(declaration)) {
          for (const variable of declaration.declarationList.declarations) {
            const symbol = checker.getSymbolAtLocation(variable.name)
            if (symbol) api(symbol, symbol.getName())
          }
        } else if (declaration.name) {
          const symbol = checker.getSymbolAtLocation(declaration.name)
          if (!symbol) continue
          if (ts.isFunctionDeclaration(declaration)) api(symbol, symbol.getName())
          else if (ts.isTypeAliasDeclaration(declaration)) collectReferences(declaration)
          else referencedTypes.add(declaration)
        }
      }
    }
  }

  const apiCount = sections.length
  // Set 迭代会继续访问新增依赖；按声明身份去重，同时阻断递归类型循环。
  for (const declaration of referencedTypes) {
    if (renderedTypes.has(declaration)) continue
    renderedTypes.add(declaration)
    collectReferences(declaration)
    // 全局类型别名只是导入桥接；展示其原始契约，避免重复标题和未公开的导入别名。
    if (declaration.getSourceFile().fileName === entry && ts.isTypeAliasDeclaration(declaration))
      continue
    const symbol = checker.getSymbolAtLocation(declaration.name)
    if (!symbol) continue
    const code = printer.printNode(
      ts.EmitHint.Unspecified,
      declaration,
      declaration.getSourceFile(),
    )
    section(declaration.name.text, code, symbol)
    const type = checker.getDeclaredTypeOfSymbol(symbol)
    for (const member of type.getProperties()) {
      if (documentedSymbols.has(member)) continue
      // 字段注释单独输出，继承字段同样通过 checker 收集。
      if (!member.declarations?.some((node) => node.getSourceFile().fileName in files)) continue
      const node = member.valueDeclaration ?? member.declarations[0]
      const memberType = checker.getTypeOfSymbolAtLocation(member, node)
      const signatures = memberType.getCallSignatures()
      const name = `${declaration.name.text}.${member.getName()}`
      const signature = signatures.length
        ? signatures
            .map((item) => `${name}${checker.signatureToString(item, node, format)}`)
            .join('\n')
        : `${name}${member.flags & ts.SymbolFlags.Optional ? '?' : ''}: ${checker.typeToString(memberType, node, format)}`
      section(name, signature, member)
    }
  }

  /** 使用显式锚点，让名称大小写、点号和 Markdown 渲染器差异不影响导航。 */
  function renderSections(items, prefix) {
    return items
      .map((item, index) => `<a id="${prefix}-${index}"></a>\n\n${item.content}`)
      .join('\n\n')
  }
  const apis = sections.slice(0, apiCount)
  const types = sections.slice(apiCount)
  return [
    '<!-- 此文件由 pnpm docs:script:generate 从 Script 编辑器契约的 JSDoc 自动生成，请勿手工编辑。 -->',
    '# Script API',
    '本文与代码提示框使用同一份类型契约和注释。修改源码注释后运行 `pnpm docs:script:generate`，使用 `pnpm docs:script:check` 校验同步状态。',
    '## 目录',
    apis.map((item, index) => `- [${item.name}](#api-${index})`).join('\n'),
    '## 全局 API',
    renderSections(apis, 'api'),
    '## 相关类型',
    types.map((item, index) => `- [${item.name}](#type-${index})`).join('\n'),
    renderSections(types, 'type'),
    '',
  ].join('\n\n')
}

/** 先刷新共享枚举，再从源码生成文档；check 模式不修改任何文件。 */
export async function generateScriptApiDocs({ check = false } = {}) {
  await generateScriptEnums({ check })
  const resources = await collectEditorResources()
  const content = renderScriptApi(resources)
  return { changed: writeGeneratedFile(outputFile, content, { check }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateScriptApiDocs({ check: process.argv.includes('--check') })
}
