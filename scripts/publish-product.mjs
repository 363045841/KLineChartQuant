/** 只上传通过隔离消费验收且摘要未变的产品 tarball，不触发重构建。 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const output = fileURLToPath(new URL('../artifacts/product/', import.meta.url))
const verified = JSON.parse(readFileSync(path.join(output, 'verified.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'))
if (verified.sha256 !== manifest.sha256 || verified.name !== manifest.name || verified.version !== manifest.version) throw new Error('Product verification does not match the release manifest')
const tarball = path.join(output, verified.tarball)
if (createHash('sha256').update(readFileSync(tarball)).digest('hex') !== verified.sha256) throw new Error('Verified product tarball changed')
const prerelease = verified.version.match(/-([a-zA-Z][a-zA-Z0-9-]*)\./)
const tag = prerelease ? prerelease[1] : 'latest'
// npm CLI 负责 OIDC 交换；pnpm 原生 publish 尚不能替代现有可信发布链路。
const result = spawnSync('pnpm', ['exec', 'npm', 'publish', tarball, '--ignore-scripts', '--access', 'public', '--tag', tag, '--registry', process.env.PRODUCT_REGISTRY ?? 'https://registry.npmjs.org'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (result.status !== 0) process.exit(result.status ?? 1)
