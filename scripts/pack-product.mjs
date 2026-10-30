/** 只打包已构建的 Vue 产品；发布阶段必须使用这份经过消费验收的 tarball。 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = path.join(root, 'artifacts/product')
const product = JSON.parse(readFileSync(path.join(root, 'packages/vue/package.json'), 'utf8'))
if (process.env.PRODUCT_PACKAGE_NAME) product.name = process.env.PRODUCT_PACKAGE_NAME
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${product.version}`) {
  throw new Error('Release tag must match the Vue product version')
}
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  if (Object.keys(product[field] ?? {}).some((name) => name.startsWith('@363045841yyt/klinechart'))) {
    throw new Error(`Product ${field} must not depend on unpublished workspace packages`)
  }
}
rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })
// 发布清单不携带工作区开发依赖或仓库脚本，也不就地改写源码清单。
delete product.devDependencies
delete product.scripts
const staging = mkdtempSync(path.join(tmpdir(), 'klinechart-pack-'))
writeFileSync(path.join(staging, 'package.json'), JSON.stringify(product, null, 2) + '\n')
for (const name of ['dist', 'README.md', 'README_CN.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md']) {
  const source = path.join(root, 'packages/vue', name)
  if (existsSync(source)) cpSync(source, path.join(staging, name), { recursive: true })
}
const packed = spawnSync('pnpm', ['--dir', staging, 'pack', '--ignore-scripts', '--pack-destination', output], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
rmSync(staging, { recursive: true, force: true })
if (packed.status !== 0) {
  console.error(packed.stdout, packed.stderr)
  process.exit(packed.status ?? 1)
}
const tarball = `${product.name.replace('@', '').replace('/', '-')}-${product.version}.tgz`
const bytes = readFileSync(path.join(output, tarball))
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ name: product.name, version: product.version, tarball, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }, null, 2) + '\n')
console.log(`Product tarball: ${(bytes.length / 1024 / 1024).toFixed(2)} MiB`)
