import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))

const corePkg = JSON.parse(readFileSync(new URL('../core/package.json', import.meta.url), 'utf-8'))
const coreAliases: Array<{ find: string | RegExp; replacement: string }> = []
for (const [key, value] of Object.entries(corePkg.exports)) {
  const importPath = (value as any).import as string
  const sourcePath = importPath.replace('./dist/', '').replace(/\.js$/, '.ts')
  if (key === '.') {
    coreAliases.push({
      find: /^@363045841yyt\/klinechart-core$/,
      replacement: `${coreSrc}/${sourcePath}`,
    })
    continue
  }
  const subpath = `@363045841yyt/klinechart-core${key.slice(1)}`
  coreAliases.push({ find: subpath, replacement: `${coreSrc}/${sourcePath}` })
}

export default defineConfig({
  plugins: [
    babel({
      include: [/\/core\/src\/.*\.tsx?$/, /\/packages\/core\/src\/.*\.tsx?$/],
      exclude: [/node_modules/],
      babelConfig: {
        babelrc: false,
        configFile: false,
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
          ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: coreAliases,
  },
})
