# Third-Party Notices

This package is licensed under AGPL-3.0-or-later (see [LICENSE](LICENSE)). It embeds or
depends on the following third-party software; their notices are retained here and, where
the source is embedded, inside the generated sources.

| Dependency | License | Where |
| --- | --- | --- |
| `typescript` | Apache-2.0 | runtime dependency; ES2022 `lib.*.d.ts` embedded by `scripts/generate-editor-resources.mjs` into `src/language/standardLibraries.ts` |
| `@363045841yyt/klinechart-plot-contracts` | Apache-2.0 | runtime dependency; contract sources embedded into `src/editor/resources.ts` |
| `quickjs-emscripten` | MIT | runtime dependency (sandboxed script execution) |
| `@typescript/vfs` | MIT | runtime dependency (in-memory TypeScript program) |

The embedded TypeScript declarations keep their original Apache-2.0 copyright headers, and
the embedded plot-contracts sources are covered by the Apache-2.0 license of that package.
