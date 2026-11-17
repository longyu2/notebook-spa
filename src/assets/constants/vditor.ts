/**
 * Vditor 运行时资源的地址。
 *
 * Vditor 不是装完就能离线用的库：Markdown 解析器（lute）、工具栏图标、
 * 代码高亮主题、KaTeX 这些是运行时按需从 `cdn` 这个地址拉的，默认值指向
 * https://unpkg.com/vditor@x —— 国内经常拉不到，症状是编辑器工具栏没图标、
 * 正文渲染退化成一段没排版的纯文本。
 *
 * 这里改成随包发布的同源目录：scripts/vendor-vditor.mjs 会把
 * node_modules/vditor/dist 拷到 public/vditor/dist，构建后就是 /vditor/dist/…
 * 版本跟着 package.json 里装的 vditor 走，不会出现预览和编辑器解析器版本不一致。
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export const VDITOR_CDN = `${base}/vditor`
