<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import Vditor from 'vditor'
import { ElMessage } from 'element-plus'

/* 本页要把 Markdown 正文渲染成 HTML，而 .vditor-reset 的基础样式原先只在
   ArticleContent.vue 里引入。那个组件属于 NoteBookView 的懒加载分包，
   直接刷新 /random（或从外部链接进来）时样式不会加载，正文会完全没有排版。
   这里补一次引入，让本页自给自足。 */
import 'vditor/src/assets/less/index.less'

const server_url = localStorage.getItem('server_url')

/* Vditor 的 lute 解析器是运行时按需从 cdn 拉的（编辑器本身也是这么跑的），
   显式写死版本，避免以后升级 vditor 时预览和编辑器用的解析器版本对不上。 */
const VDITOR_CDN = 'https://unpkg.com/vditor@4.0.0'

/* ===== 主题 =====
   本页是独立路由，ArticleContent.vue 的 setTheme 不会执行，data-theme 得自己挂，
   否则半透明主题下背景壁纸不会铺开（body[data-theme='semiTransparent'] 里那条规则）。 */
const theme = localStorage.getItem('theme') || 'light'
document.body.setAttribute('data-theme', theme)

const loading = ref(true)
const error = ref('')
const title = ref('')
const createtime = ref('')
const rawContent = ref('')
const total = ref(0)
const shown = ref(0)
const contentEl = ref<HTMLDivElement | null>(null)

const wordCount = computed(() => rawContent.value.length)

/* ===== 随机且不重复 =====
   用 localStorage 记住「已经看过的下标」，一轮看完自动重开。 */
let list: any[] = []
let seen: number[] = []

try {
  const saved = JSON.parse(localStorage.getItem('randomArr') || '[]')
  if (Array.isArray(saved)) seen = saved.filter((n: unknown) => typeof n === 'number')
} catch {
  seen = []
}

function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 挑一个没看过的下标；返回 -1 表示没有可挑的 */
function pickIndex(): number {
  const n = list.length
  if (n === 0) return -1

  // 文章可能被新增/删除，历史记录里的下标会越界，先清掉
  seen = seen.filter((i) => i >= 0 && i < n)

  if (seen.length >= n) {
    seen = []
    ElMessage.info('一轮已经看完，重新开始')
  }

  // 从「没看过的」里等概率挑一个 —— 比原来的 while 重试更稳，
  // 不会因为剩下最后一个而反复撞（原实现就是这么卡住的）
  const rest: number[] = []
  for (let k = 0; k < n; k++) {
    if (!seen.includes(k)) rest.push(k)
  }
  const idx = rest[Math.floor(Math.random() * rest.length)]

  seen.push(idx)
  localStorage.setItem('randomArr', JSON.stringify(seen))
  return idx
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
  } catch (e) {
    /* CDN 拉不到 lute 之类的情况：退化成保留换行的纯文本。
       虽然丢了标题/列表的样式，但「分段」仍然是对的，不会白屏。 */
    el.classList.add('md-fallback')
    el.textContent = md
  }
}

async function showRandom() {
  if (list.length === 0) return

  const idx = pickIndex()
  if (idx < 0) return

  loading.value = true
  error.value = ''

  try {
    const res = await axios.get(`${server_url}/article/${list[idx].Notebookid}`)
    const row = res.data?.[0]

    if (!row) {
      title.value = ''
      error.value = '这篇取不到了，再试一次'
      return
    }

    title.value = row.title || '无标题'
    createtime.value = row.createtime || ''
    rawContent.value = row.content || ''
    shown.value = seen.length

    await renderMarkdown(rawContent.value)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e: any) {
    title.value = ''
    error.value = '正文加载失败：' + (e?.message || e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  document.title = '随机推荐'

  try {
    /* folderid=-2 = 全部文章。注意接口读的是 req.query.folderid
       （ShowView 里写的 ?folder=-2 是拼错的，参数被忽略后走默认值 -2，
       结果碰巧一样，别照抄）。返回的 content 只截了前 16 个字，正文要单独取。 */
    const res = await axios.get(`${server_url}/articles?folderid=-2`)
    list = res.data?.data ?? []
    total.value = list.length

    if (list.length === 0) {
      loading.value = false
      return
    }

    await showRandom()
  } catch (e: any) {
    error.value = '文章列表加载失败：' + (e?.message || e)
    loading.value = false
  }
})
</script>

<template>
  <div class="random-box">
    <nav class="random-bar">
      <span class="random-stat">
        已看 <b>{{ shown }}</b> / {{ total }}
      </span>
      <el-button
        type="primary"
        size="large"
        :loading="loading"
        :disabled="total === 0"
        @click="showRandom"
      >
        {{ title ? '换一篇' : '随机推荐' }}
      </el-button>
    </nav>

    <el-card class="random-sheet" shadow="never">
      <template v-if="title">
        <h1 class="random-title">{{ title }}</h1>
        <div class="random-meta">
          <span v-if="createtime">{{ fmtDate(createtime) }}</span>
          <span v-if="createtime && wordCount" class="random-sep">·</span>
          <span v-if="wordCount">{{ wordCount }} 字</span>
        </div>
        <hr class="random-hr" />
      </template>

      <!-- v-show 而不是 v-if：元素要一直在，renderMarkdown 才能拿到 ref -->
      <div v-show="title" ref="contentEl" class="random-content"></div>

      <div v-if="!title" class="random-hint">
        <template v-if="loading">正在挑一篇…</template>
        <template v-else-if="error">{{ error }}</template>
        <template v-else-if="total === 0">还没有可推荐的文章</template>
      </div>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.random {
  &-box {
    /* 阅读区比原来的 50% 宽一些，min() 保证窄屏不溢出 */
    width: min(880px, 92vw);
    margin: 36px auto 64px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    /* 本页固定「白纸黑字」阅读版式。
       全局 main.scss 有 `.vditor-reset { color: var(--word-color) !important }`，
       而 --word-color 在从半透明主题的笔记页跳进来时是白色（body 上被设过），
       白字压白卡片会直接看不见 —— 所以在容器上把它钉成深色。 */
    --word-color: #1f1f1f;
    --muted: color-mix(in srgb, var(--word-color) 52%, transparent);
  }

  &-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
  }

  &-stat {
    font-size: 14px;
    color: var(--muted);

    b {
      color: var(--word-color);
      font-weight: 600;
    }
  }

  &-sheet {
    width: 100%;
    border: 1px solid rgba(0, 0, 0, 0.07);
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);

    :deep(.el-card__body) {
      padding: 32px 36px;
    }
  }

  &-title {
    margin: 0 0 8px;
    font-size: 26px;
    line-height: 1.45;
    font-weight: 700;
    color: var(--word-color);
    word-break: break-word;
  }

  &-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    color: var(--muted);
  }

  &-sep {
    opacity: 0.6;
  }

  &-hr {
    margin: 18px 0 22px;
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
  }

  &-hint {
    min-height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: var(--muted);
  }

  &-content {
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
}

/* 半透明主题下背景是壁纸，给白纸加一点悬浮感，避免糊在图上 */
body[data-theme='semiTransparent'] .random-sheet {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.38);
}
</style>
