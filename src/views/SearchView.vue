<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

/* 独立整页路由，跟公开页一样自己挂 data-theme，否则半透明主题的壁纸不会铺开 */
const theme = localStorage.getItem('theme') || 'light'
document.body.setAttribute('data-theme', theme)

/* 登录后才进得来（路由守卫拦着），所以 server_url 一定写好了。
   但按项目惯例还是现读 localStorage，不用模块顶层常量。 */
const server_url = localStorage.getItem('server_url')

const route = useRoute()
const router = useRouter()

const pageSize = ref(24)

const keyword = ref('') // 输入框里的词
const activeQ = ref('') // 真正在搜的词（点回车/点搜索按钮后才更新）
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const inputRef = ref<any>(null)

/* ===== 关键词高亮 =====
   拆成 [{t, hit}] 交给模板渲染，不用 v-html —— 用户正文里可能有 HTML，
   拼字符串再塞进 v-html 就是自找 XSS。 */
function highlight(text: string, q: string) {
  const src = text == null ? '' : String(text)
  const parts: { t: string; hit: boolean }[] = []
  const ql = (q || '').toLowerCase()

  if (!ql) return [{ t: src, hit: false }]

  const lower = src.toLowerCase()
  let i = 0
  while (i < src.length) {
    const idx = lower.indexOf(ql, i)
    if (idx === -1) {
      parts.push({ t: src.slice(i), hit: false })
      break
    }
    if (idx > i) parts.push({ t: src.slice(i, idx), hit: false })
    parts.push({ t: src.slice(idx, idx + q.length), hit: true })
    i = idx + q.length
  }
  return parts
}

/* ===== 摘要处理 =====
   后端给的 snippet 是原始 Markdown（以命中位置为锚切的一段），
   这里先压成纯文本，再以命中位置为中心重新裁一次窗口 —— 这样无论
   前面的 Markdown 语法占了多少字符，命中词都稳稳落在卡片可见区域里。 */
function toPlainText(md: string) {
  return (md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)?/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)?/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerpt(row: any, max = 150) {
  const text = toPlainText(row?.snippet || '')
  if (!text) return ''

  const q = activeQ.value
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1

  // 没命中（比如只在标题里命中）就从头显示
  if (i === -1) return text.length > max ? text.slice(0, max) + '…' : text

  const start = Math.max(0, i - Math.floor((max - q.length) / 2))
  const end = Math.min(text.length, start + max)

  return (
    (start > 0 ? '…' : '') +
    text.slice(start, end) +
    (end < text.length ? '…' : '')
  )
}

function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* ===== 请求 ===== */
async function fetchPage(q: string, targetPage: number) {
  if (!q) {
    list.value = []
    total.value = 0
    return
  }

  loading.value = true
  error.value = ''

  try {
    const res = await axios.get(`${server_url}/search`, {
      params: { q, page: targetPage, size: pageSize.value }
    })
    const data = res.data?.data ?? {}
    list.value = data.list ?? []
    total.value = data.total ?? (data.list ?? []).length
    page.value = targetPage
  } catch (e: any) {
    error.value = '搜索失败：' + (e?.message || e)
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function runSearch(q: string) {
  activeQ.value = q
  fetchPage(q, 1)
}

/* 传统分页：页码/页大小变化 → 改写地址栏，由 watch(route) 统一拉数据
   （地址栏 ?q=&page=&size= 是唯一事实来源，刷新/前进后退都能还原） */
function buildQuery(q: string, p: number, s?: number) {
  const qy: Record<string, string> = {}
  if (q) qy.q = q
  if (p > 1) qy.page = String(p)
  if (s && s !== 24) qy.size = String(s)
  return qy
}

function onPageChange(p: number) {
  window.scrollTo({ top: 0 })
  router.replace({ path: '/search', query: buildQuery(activeQ.value, p, pageSize.value) })
}

function onSizeChange(s: number) {
  pageSize.value = s
  router.replace({ path: '/search', query: buildQuery(activeQ.value, 1, s) })
}

/* 输入框回车 / 点放大镜：把词写进地址栏（replace 不留历史），
   真正的请求交给 watch(activeQ) 处理，避免「地址变了但没搜」的两套状态 */
function submit() {
  const q = keyword.value.trim()
  if (q === activeQ.value) return

  router.replace({ path: '/search', query: q ? buildQuery(q, 1, pageSize.value) : {} })
}

/* 从搜索卡片点进文章：写一个一次性的 openArticleId，
   ArticleList 加载时会读它并把这篇选中，编辑器随即按 id 拉正文。
   这样不用把 id 一层层透传过 FolderList → ArticleList。 */
function openArticle(row: any) {
  localStorage.setItem('openArticleId', String(row.Notebookid))
  router.push('/notebook')
}

/* ===== 地址栏 ?q=&page=&size= 是唯一事实来源 ===== */
function syncFromRoute() {
  const raw = route.query.q
  const q = (Array.isArray(raw) ? raw[0] : raw) || ''
  const p = Math.max(1, parseInt(route.query.page as string, 10) || 1)
  const s = Math.min(50, Math.max(1, parseInt(route.query.size as string, 10) || 24))
  keyword.value = q
  activeQ.value = q
  pageSize.value = s
  page.value = p
  fetchPage(q, p)
}

onMounted(async () => {
  document.title = '搜索 - 暮观云笔记'
  syncFromRoute()
  await nextTick()
  inputRef.value?.focus?.()
})

watch(() => route.fullPath, syncFromRoute)
</script>

<template>
  <div class="search-box-page">
    <header class="sp-head">
      <div class="sp-brand">
        <span class="sp-brand__name">暮观云笔记</span>
        <span class="sp-brand__sub">搜索</span>
      </div>
      <router-link to="/notebook" class="sp-head__link">← 回到笔记</router-link>
    </header>

    <div class="sp-search">
      <el-input
        ref="inputRef"
        v-model="keyword"
        size="large"
        clearable
        placeholder="搜索全部笔记的标题和正文…"
        @keyup.enter="submit"
      >
        <template #append>
          <el-button @click="submit">搜索</el-button>
        </template>
      </el-input>
    </div>

    <!-- 有词才有结果区，没词时给一句引导 -->
    <div v-if="!activeQ" class="sp-hint">
      输入关键词后回车，会在你全部笔记的标题和正文里查找。
    </div>

    <template v-else>
      <div v-if="loading" class="sp-hint">正在搜索…</div>
      <div v-else-if="error" class="sp-hint sp-hint--err">{{ error }}</div>
      <div v-else-if="list.length === 0" class="sp-hint">
        没有找到包含「{{ activeQ }}」的笔记。
      </div>

      <template v-else>
        <div class="sp-count">
          找到 <b>{{ total }}</b> 篇包含「{{ activeQ }}」的笔记
        </div>

        <div class="sp-grid">
          <article
            v-for="row in list"
            :key="row.Notebookid"
            class="sp-card"
            @click="openArticle(row)"
          >
            <h2 class="sp-card__title">
              <span
                v-for="(p, i) in highlight(row.title || '无标题', activeQ)"
                :key="i"
                :class="{ 'sp-hit': p.hit }"
                >{{ p.t }}</span
              >
            </h2>

            <p class="sp-card__excerpt">
              <template v-if="excerpt(row)">
                <span
                  v-for="(p, i) in highlight(excerpt(row), activeQ)"
                  :key="i"
                  :class="{ 'sp-hit': p.hit }"
                  >{{ p.t }}</span
                >
              </template>
              <template v-else>（这篇还没有正文）</template>
            </p>

            <div class="sp-card__meta">
              <span>{{ fmtDate(row.createtime) }}</span>
              <span v-if="row.length" class="sp-card__dot">·</span>
              <span v-if="row.length">{{ row.length }} 字</span>
              <span v-if="row.is_public" class="sp-tag sp-tag--pub">已公开</span>
              <span v-if="row.is_ai_generated" class="sp-tag">AI 生成</span>
            </div>
          </article>
        </div>

        <el-pagination
          v-if="total > 0"
          class="sp-pager"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :page-sizes="[12, 24, 48]"
          :current-page="page"
          @current-change="onPageChange"
          @size-change="onSizeChange"
          background
        />
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.search-box-page {
  width: min(1040px, 92vw);
  margin: 32px auto 72px;
  display: flex;
  flex-direction: column;
  gap: 18px;

  /* 独立页从半透明主题跳进来时，不钉住就会出现白字压白卡片 */
  --word-color: #1f1f1f;
  --muted: color-mix(in srgb, var(--word-color) 55%, transparent);
}

.sp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.sp-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;

  &__name {
    font-size: 22px;
    font-weight: 700;
    color: var(--word-color);
  }

  &__sub {
    font-size: 13px;
    color: var(--muted);
  }
}

.sp-head__link {
  font-size: 14px;
  color: var(--color-primary-text);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.sp-search {
  max-width: 620px;
  width: 100%;
}

.sp-count {
  font-size: 13.5px;
  color: var(--muted);

  b {
    color: var(--color-primary-text);
    font-weight: 700;
  }
}

.sp-hint {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--muted);

  &--err {
    color: #c0392b;
  }
}

.sp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.sp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 22px;
  cursor: pointer;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  background-color: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
  }

  &__title {
    margin: 0;
    font-size: 17px;
    line-height: 1.5;
    font-weight: 700;
    color: var(--word-color);
    word-break: break-word;
  }

  &__excerpt {
    margin: 0;
    flex: 1;
    font-size: 14px;
    line-height: 1.75;
    color: color-mix(in srgb, var(--word-color) 72%, transparent);
    word-break: break-word;

    /* 摘要最多 4 行 */
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  &__dot {
    opacity: 0.6;
  }
}

/* 命中词高亮：淡黄底 + 正常字色，在浅色卡片上够明显又不刺眼 */
.sp-hit {
  background-color: #ffe9a8;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

.sp-tag {
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--word-color) 70%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);

  &--pub {
    color: var(--color-primary-text);
    background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
}

.sp-pager {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  width: fit-content;
  margin: 6px auto 0;
  padding: 10px 16px;
  border-radius: 10px;
  background-color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
  /* 主题色对齐品牌蓝；分页条浮在壁纸上也能看清 */
  --el-color-primary: #5590e2;
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-regular: #1f1f1f;
  --el-border-color: rgba(0, 0, 0, 0.15);
  --el-fill-color: rgba(0, 0, 0, 0.04);
}

/* 半透明主题下卡片浮在壁纸上，白底要压得更实一点才看得清 */
body[data-theme='semiTransparent'] .sp-card {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

body[data-theme='semiTransparent'] .sp-head {
  border-bottom-color: rgba(255, 255, 255, 0.18);
}
</style>
