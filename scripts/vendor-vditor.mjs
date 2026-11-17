/**
 * 把 Vditor 的运行时资源从 node_modules 拷到 public/vditor/dist。
 *
 * 为什么需要这步：Vditor 不是「装完就能离线用」的库。它的 Markdown 解析器（lute）、
 * 工具栏图标、代码高亮主题、KaTeX 这些是运行时按需从 `cdn` 这个地址拉的，
 * 默认值指向 unpkg.com —— 国内经常拉不到，症状就是编辑器工具栏没图标、
 * 正文渲染退化成没有排版的纯文本。
 *
 * 所以把 node_modules 里现成的 dist 目录拷进 public/，构建后就成了
 * /vditor/dist/…，和站点同源，不依赖任何国外域名。
 *
 * 由 package.json 的 dev / build-only 脚本自动执行，不用手动跑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', 'vditor', 'dist')
const dest = path.join(root, 'public', 'vditor', 'dist')

/* 这两个目录是 TypeScript 源码和类型声明，运行时用不到 */
const SKIP = new Set(['ts', 'types'])

function sizeOf(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    total += entry.isDirectory() ? sizeOf(p) : fs.statSync(p).size
  }
  return total
}

if (!fs.existsSync(src)) {
  console.error(`[vendor-vditor] 找不到 ${src}，先 pnpm install`)
  process.exit(1)
}

const version = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', 'vditor', 'package.json'), 'utf8')
).version

/* 版本对不上就整份重拷：换了 vditor 之后旧的资源不能留着 */
const stampFile = path.join(dest, '..', 'VERSION')
const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : ''

if (current === version && fs.existsSync(dest)) {
  console.log(`[vendor-vditor] 已是 v${version}，跳过`)
  process.exit(0)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.mkdirSync(dest, { recursive: true })

fs.cpSync(src, dest, {
  recursive: true,
  filter: (s) => {
    const rel = path.relative(src, s)
    if (!rel) return true
    return !SKIP.has(rel.split(path.sep)[0])
  }
})

fs.writeFileSync(stampFile, version, 'utf8')
console.log(
  `[vendor-vditor] 已拷到 public/vditor/dist（v${version}，${(sizeOf(dest) / 1024 / 1024).toFixed(1)} MB）`
)
