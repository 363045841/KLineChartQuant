# @363045841yyt/klinechart-script-server

AGPL-licensed TypeScript language service behind the KLineChartQuant script editor:
completions, hover documentation, lint diagnostics, signature help and document
formatting. The chart package (`@363045841yyt/klinechart`) loads it lazily, so a chart
that never opens the script editor never downloads it.

```ts
import { createScriptLanguageSupport } from '@363045841yyt/klinechart-script-server'

const support = createScriptLanguageSupport((error) => console.error(error))
const extensions = await support.initialize(() => currentSource)
// ...reconfigure the CodeMirror compartment with `extensions`
support.dispose()
```

The language service builds on the sandbox-free TypeScript language service, not on the
QuickJS execution engine, so it never executes user script code.

## Install

```bash
pnpm add @363045841yyt/klinechart-script-server @363045841yyt/klinechart-script
```

The package is optional: without it, `@363045841yyt/klinechart` still renders the editor
with syntax highlighting but without completions, hover or diagnostics.

## Commands

| Command | What |
| --- | --- |
| `pnpm build` | Vite library build + declaration emit to `dist/` |
| `pnpm test` | Vitest, happy-dom environment |
| `pnpm lint:publish` | `publint --strict` package check |

## License

[AGPL-3.0-or-later](LICENSE)

This package is part of the AGPL island of the monorepo. It may depend on the
Apache-2.0 packages, but no Apache-2.0 package may import or bundle it.
