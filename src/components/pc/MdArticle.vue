<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import Vditor from 'vditor'

/* 本组件要把 Markdown 正文渲染成 HTML，而 .vditor-reset 的基础样式原先只在
   ArticleContent.vue 里引入。那个组件属于 NoteBookView 的懒加载分包，
   直接刷新 /random、/public 这类独立路由时样式不会加载，正文会完全没有排版。
   这里补一次引入，让组件自给自足。 */
import 'vditor/src/assets/less/index.less'

/* Vditor 的 lute 解析器是运行时按需从 cdn 拉的（编辑器本身也是这么跑的），
   显式写死版本，避免以后升级 vditor 时预览和编辑器用的解析器版本对不上。 */
const VDITOR_CDN = 'https://unpkg.com/vditor@4.0.0'

const props = defineProps<{
  title?: string
  createtime?: string
  content?: string
  loading?: boolean
  error?: string
  /** 没有标题也没有错误时显示的占位文案 */
  emptyText?: string
  /** 需要高亮的关键词（搜索页用），空则不高亮 */
  highlight?: string
}>()

const contentEl = ref<HTMLDivElement | null>(null)

const wordCount = computed(() => (props.content || '').length)

function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 用 Vditor 的静态渲染把 Markdown 变成 HTML（和编辑器同一套解析器，所见即所得） */
async function renderMarkdown(md: string) {
  const el = contentEl.value
  if (!el) return

  el.classList.remove('md-fallback')
  el.innerHTML = ''

  if (!md.trim()) {
    el.textContent = '（这篇还没有正文）'
    return
  }

  try {
    await Vditor.preview(el, md, {
      mode: 'light',
      cdn: VDITOR_CDN,
      lang: 'zh_CN',
      anchor: 0,
      theme: { current: 'light', path: `${VDITOR_CDN}/dist/css/content-theme` },
      hljs: { style: 'github', lineNumber: false },
      math: { engine: 'KaTeX' },
      markdown: {
        autoSpace: true,
        footnotes: true,
        toc: true,
        mark: true,
        gfmAutoLink: true,
        codeBlockPreview: false,
        mathBlockPreview: false,
        fixTermTypo: true
      },
      render: { media: { enable: true } }
    })

    /* 正文里的图片是相对路径（上传接口存的是 upload/<userid>/<file>）。
       在 /random 这种单段路径下浏览器会解析成 /upload/...，碰巧是对的；
       但到了 /public/123 这种两段路径就会解析成 /public/upload/...，图片全挂。
       这里统一补成根绝对路径，两种路由下都对。 */
    el.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || ''
      if (!src) return
      if (/^(https?:)?\/\//.test(src) || src.startsWith('/') || src.startsWith('data:')) return
      img.setAttribute('src', '/' + src.replace(/^\.\//, ''))
    })

    /* 搜索页跳进来时按关键词把正文命中处高亮 */
    highlightIn(el, props.highlight || '')
  } catch {
    /* CDN 拉不到 lute 之类的情况：退化成保留换行的纯文本。
       虽然丢了标题/列表的样式，但「分段」仍然是对的，不会白屏。 */
    el.classList.add('md-fallback')
    el.textContent = md
  }
}

/* 在已渲染好的正文里按关键词高亮。
   只包文本节点，不动 HTML 结构，所以不会破坏 Vditor 生成的标签/代码高亮。
   代码块（pre/code）跳过，免得把语法高亮的 span 切碎。 */
function highlightIn(root: HTMLElement, q: string) {
  const ql = (q || '').toLowerCase()
  if (!ql) return

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement
      if (!p) return NodeFilter.FILTER_REJECT
      const tag = p.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'code') {
        return NodeFilter.FILTER_REJECT
      }
      const text = node.nodeValue || ''
      return text.toLowerCase().includes(ql) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  const targets: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) targets.push(n as Text)

  for (const t of targets) {
    const text = t.nodeValue || ''
    const lower = text.toLowerCase()
    const frag = document.createDocumentFragment()
    let i = 0
    while (i < text.length) {
      const idx = lower.indexOf(ql, i)
      if (idx === -1) {
        frag.appendChild(document.createTextNode(text.slice(i)))
        break
      }
      if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)))
      const mark = document.createElement('mark')
      mark.className = 'md-hit'
      mark.textContent = text.slice(idx, idx + q.length)
      frag.appendChild(mark)
      i = idx + q.length
    }
    t.parentNode?.replaceChild(frag, t)
  }
}

const rerender = () => renderMarkdown(props.content || '')

// 元素挂载后先渲染一次；之后正文或高亮词变了再渲染
onMounted(rerender)
watch(() => [props.content, props.highlight], rerender)
</script>

<template>
  <el-card class="md-sheet" shadow="never">
    <template v-if="title">
      <h1 class="md-title">{{ title }}</h1>
      <div class="md-meta">
        <span v-if="createtime">{{ fmtDate(createtime) }}</span>
        <span v-if="createtime && wordCount" class="md-sep">·</span>
        <span v-if="wordCount">{{ wordCount }} 字</span>
      </div>
      <hr class="md-hr" />
    </template>

    <!-- v-show 而不是 v-if：元素要一直在，renderMarkdown 才能拿到 ref -->
    <div v-show="title" ref="contentEl" class="md-content"></div>

    <div v-if="!title" class="md-hint">
      <template v-if="loading">加载中…</template>
      <template v-else-if="error">{{ error }}</template>
      <template v-else>{{ emptyText || '暂无内容' }}</template>
    </div>
  </el-card>
</template>

<style lang="scss" scoped>
.md-sheet {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);

  /* 正文版式跟随主题：
     浅色 → 「白纸黑字」，把 --word-color 钉成深色。
     （全局 main.scss 有 `.vditor-reset { color: var(--word-color) !important }`，
      而半透明主题下 body 上的 --word-color 是白色，不钉住就是白字压白卡片。）
     半透明 → 见下方 body[data-theme] 覆盖块，整张卡片换成暗色半透 + 白字。 */
  --word-color: #1f1f1f;
  --muted: color-mix(in srgb, var(--word-color) 52%, transparent);

  :deep(.el-card__body) {
    padding: 32px 36px;
  }
}

.md-title {
  margin: 0 0 8px;
  font-size: 26px;
  line-height: 1.45;
  font-weight: 700;
  color: var(--word-color);
  word-break: break-word;
}

.md-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--muted);
}

.md-sep {
  opacity: 0.6;
}

.md-hr {
  margin: 18px 0 22px;
  border: none;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.md-hint {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: var(--muted);
}

.md-content {
  font-size: 16px;
  line-height: 1.9;
  word-break: break-word;

  /* 正文里的图片不要撑破卡片 */
  :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }

  /* 宽表格自己滚，别把卡片顶宽。
     代码块不用管 —— vditor 的 `.vditor-reset pre > code` 本来就是
     display:block + overflow:auto，再在 pre 上套一层滚动容器反而会出双滚动条。 */
  :deep(table) {
    display: block;
    overflow-x: auto;
  }

  /* 兜底态：保留换行的纯文本 */
  &.md-fallback {
    white-space: pre-wrap;
    font-family: inherit;
  }
}

/* ===== 手机端 =====
   36px 的左右内边距在 390px 宽的屏上要吃掉近 1/5 的正文宽度，
   正文缩到 290px 左右读起来很挤；标题字号也收一档。 */
@media (max-width: 860px) {
  .md-sheet {
    border-radius: 10px;

    :deep(.el-card__body) {
      padding: 20px 18px;
    }
  }

  .md-title {
    font-size: 21px;
    line-height: 1.4;
  }

  .md-meta {
    font-size: 12.5px;
    flex-wrap: wrap;
  }

  .md-hr {
    margin: 14px 0 16px;
  }

  .md-content {
    font-size: 15.5px;
    line-height: 1.85;
  }

  .md-hint {
    min-height: 120px;
    font-size: 14px;
  }
}
</style>

<!-- 半透明主题下：整张卡片改成「暗色半透面板 + 白字」，跟随主题。
     这几条要作用在卡片根元素 / 其子元素上，scoped 里的 :deep 拿不到 el-card 的根，
     所以写成全局样式，并靠 body 上的 data-theme 属性切档。
     --word-color 翻成白色后，.md-title / .md-content 会自动变白（正文由 .vditor-reset 用
     var(--word-color) !important 上色），--muted 也由它派生。 -->
<style>
body[data-theme='semiTransparent'] .md-sheet {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.38);

  /* 暗色半透底（和阅览模式的卡片、搜索卡片同一套观感） */
  background-color: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);

  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 62%, transparent);
}

body[data-theme='semiTransparent'] .md-title {
  color: #fff;
}

body[data-theme='semiTransparent'] .md-hr {
  border-top-color: rgba(255, 255, 255, 0.16);
}

/* 正文里的链接：暗底上品牌蓝偏闷，用亮蓝版 */
body[data-theme='semiTransparent'] .md-content a {
  color: var(--color-primary-text, #8ab6f0);
}

/* 行内代码 / 引用块等浅色底元素：暗面板上要换成白色半透明，否则白底黑字变「白块」 */
body[data-theme='semiTransparent'] .md-content .vditor-reset code {
  background-color: rgba(255, 255, 255, 0.12);
  color: #fff;
}

body[data-theme='semiTransparent'] .md-content .vditor-reset blockquote {
  border-left-color: rgba(255, 255, 255, 0.28);
  background-color: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.86);
}

/* 搜索页在正文里高亮的关键词。动态插入的 mark 不在 scoped 作用域内，写成全局样式。 */
mark.md-hit {
  background-color: #ffe9a8;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

/* 半透主题下淡黄底太扎眼，换半透琥珀 + 白字 */
body[data-theme='semiTransparent'] mark.md-hit {
  background-color: rgba(239, 159, 39, 0.5);
  color: #fff;
}
</style>
