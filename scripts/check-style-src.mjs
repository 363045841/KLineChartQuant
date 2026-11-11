#!/usr/bin/env node
/**
 * 门禁：禁止 SFC 使用 `<style src>` 样式块。
 *
 * 共享 CSS 必须从 `<script setup>` 导入，由打包器只产出一份；`src` 样式块会让
 * 每个消费者各编译一份（带各自的 data-v），并且在 Vitest 5 的持久化 transform
 * 缓存下，父 SFC 命中缓存时不会登记 descriptor，改过 CSS 后加载会直接失败
 * （vitejs/vite-plugin-vue#877）。组件私有样式继续写在 `<style scoped>` 里。
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['packages/vue/src']
const STYLE_SRC = /<style\b[^>]*\bsrc\s*=/

/** 收集目录下所有 .vue 文件。 */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

const offenders = []
for (const target of TARGETS) {
  for (const file of collect(path.join(ROOT, target))) {
    const source = readFileSync(file, 'utf8')
    source.split('\n').forEach((line, index) => {
      if (STYLE_SRC.test(line)) offenders.push(`${path.relative(ROOT, file)}:${index + 1}`)
    })
  }
}

if (offenders.length > 0) {
  process.stderr.write(
    'style-src check failed: 共享 CSS 请从 <script setup> 导入，不要用 <style src>\n',
  )
  for (const offender of offenders) process.stderr.write(`  ${offender}\n`)
  process.exit(1)
}
process.stdout.write('style-src check: ok\n')
