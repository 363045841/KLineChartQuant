/**
 * generate-readmes.mjs
 *
 * Generates README.md files from templates + fragments.
 * Usage:
 *   node scripts/generate-readmes.mjs          # generate all
 *   node scripts/generate-readmes.mjs --check   # diff check (exit 1 if stale)
 *   node scripts/generate-readmes.mjs vue        # generate only vue-related
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOCS = path.join(ROOT, 'docs')
const TEMPLATES = path.join(DOCS, 'templates')
const FRAGMENTS = path.join(DOCS, 'fragments')

// ── Config ──────────────────────────────────────────────────────────
// Each entry: output path → { template, root (relative path prefix) }
const CONFIG = {
  'README.md':                      { template: 'root.md',        root: '' },
  'README_CN.md':                   { template: 'root.zh-CN.md',  root: '' },
  'packages/vue/README.md':         { template: 'vue.md',         root: '../../' },
  'packages/vue/README_CN.md':      { template: 'vue.zh-CN.md',   root: '../../' },
  'packages/core/README.md':        { template: 'core.md',        root: '../../' },
  'packages/core/README.zh-CN.md':  { template: 'core.zh-CN.md',  root: '../../' },
  'packages/ai-runtime/README.md':  { template: 'ai-runtime.md',  root: '../../' },
  'packages/react/README.md':       { template: 'react.md',       root: '../../' },
  'packages/angular/README.md':     { template: 'angular.md',     root: '../../' },
}

// ── Helpers ─────────────────────────────────────────────────────────

function readFragment(name) {
  const filePath = path.join(FRAGMENTS, name)
  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ Fragment not found: ${name}`)
    process.exit(1)
  }
  return fs.readFileSync(filePath, 'utf-8')
}

function resolveIncludes(content) {
  return content.replace(/{{include:([^}]+)}}/g, (_, fragmentPath) => {
    return resolveIncludes(readFragment(fragmentPath))
  })
}

function resolveVars(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key in vars) return vars[key]
    // Keep unmatched placeholders as-is (e.g. npm template syntax)
    return `{{${key}}}`
  })
}

function generateOne(templateName, vars) {
  const templatePath = path.join(TEMPLATES, templateName)
  if (!fs.existsSync(templatePath)) {
    console.error(`  ✗ Template not found: ${templateName}`)
    process.exit(1)
  }

  let content = fs.readFileSync(templatePath, 'utf-8')
  content = resolveIncludes(content)
  content = resolveVars(content, vars)
  return content
}

// ── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isCheck = args.includes('--check')
const filter = args.filter(a => !a.startsWith('--'))

let entries = Object.entries(CONFIG)
if (filter.length > 0) {
  entries = entries.filter(([output]) =>
    filter.some(f => output.includes(f))
  )
}

const generated = {}

for (const [output, cfg] of entries) {
  const outputPath = path.join(ROOT, output)
  const content = generateOne(cfg.template, { root: cfg.root })
  generated[output] = content

  if (isCheck) {
    const existing = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf-8')
      : ''
    if (existing !== content) {
      console.error(`  ✗ STALE: ${output} — run "node scripts/generate-readmes.mjs" to regenerate`)
      process.exitCode = 1
    } else {
      console.log(`  ✓ ${output}`)
    }
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, content, 'utf-8')
    console.log(`  ✓ ${output}`)
  }
}

if (isCheck && process.exitCode === undefined) {
  console.log('\nAll READMEs are up to date.')
}
