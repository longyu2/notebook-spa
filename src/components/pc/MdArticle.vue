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
  } catch {
    /* CDN 拉不到 lute 之类的情况：退化成保留换行的纯文本。
       虽然丢了标题/列表的样式，但「分段」仍然是对的，不会白屏。 */
    el.classList.add('md-fallback')
    el.textContent = md
  }
}

const rerender = () => renderMarkdown(props.content || '')

// 元素挂载后先渲染一次；之后正文变了（换文章）再渲染
onMounted(rerender)
watch(() => props.content, rerender)
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

  /* 本卡片固定「白纸黑字」阅读版式。
     全局 main.scss 有 `.vditor-reset { color: var(--word-color) !important }`，
     而 --word-color 从半透明主题的笔记页带过来时是白色，白字压白卡片会直接看不见 ——
     所以在容器上把它钉成深色，--muted 由它派生。 */
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
</style>

<!-- 半透明主题下背景是壁纸，给白纸加一点悬浮感，避免糊在图上。
     这条要作用在卡片根元素上，所以不能写在 scoped 里。 -->
<style>
body[data-theme='semiTransparent'] .md-sheet {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.38);
}
</style>
