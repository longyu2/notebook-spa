<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import MdArticle from '@/components/pc/MdArticle.vue'

/* 独立整页路由，跟公开页一样自己挂 data-theme，否则半透明主题的壁纸不会铺开 */
const theme = localStorage.getItem('theme') || 'light'
document.body.setAttribute('data-theme', theme)

/* 登录后才进得来（路由守卫拦着），所以 server_url 一定写好了。
   但按项目惯例还是现读 localStorage，不用模块顶层常量。 */
const server_url = localStorage.getItem('server_url')

const route = useRoute()
const router = useRouter()

const pageSize = ref(24)

/* ===== 排序 =====
   sortField：time = 创建时间，word = 正文字数；order：desc 倒序（默认）/ asc 正序。
   和 q/page/size 一样，真正的状态放在地址栏（?sort=&order=），刷新/前进后退都能还原。 */
const sortField = ref<'time' | 'word'>('time')
const order = ref<'asc' | 'desc'>('desc')

const keyword = ref('') // 输入框里的词
const activeQ = ref('') // 真正在搜的词（点回车/点搜索按钮后才更新）
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const inputRef = ref<any>(null)

/* ===== 详情态 =====
   点卡片不再跳回笔记主页，而是走 /search/:aid，用和随机推荐同一个
   MdArticle 组件原地渲染全文。列表和详情共用一个路由组件，靠 aid 切换。 */
const aid = computed(() => {
  const raw = route.params.aid
  const v = Array.isArray(raw) ? raw[0] : raw
  return v ? String(v) : ''
})

const detail = ref<any>(null)
const detailLoading = ref(false)
const detailError = ref('')

async function loadDetail(id: string) {
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    const res = await axios.get(`${server_url}/article/${id}`)
    const row = res.data?.[0]
    if (!row) {
      detailError.value = '这篇笔记取不到了'
      return
    }
    detail.value = row
    document.title = `${row.title || '无标题'} - 搜索`
  } catch (e: any) {
    detailError.value = '正文加载失败：' + (e?.message || e)
  } finally {
    detailLoading.value = false
  }
}

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
      params: {
        q,
        page: targetPage,
        size: pageSize.value,
        sort: sortField.value,
        order: order.value
      }
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
  /* 默认排序（时间 + 倒序）不写进地址栏，URL 保持干净；非默认才带上 */
  if (sortField.value !== 'time') qy.sort = sortField.value
  if (order.value !== 'desc') qy.order = order.value
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

/* 从搜索卡片点进文章：原地展开全文（走 /search/:aid），
   不再跳回笔记主页。带上原搜索条件，返回时能回到同一页结果。 */
function openArticle(row: any) {
  router.push({ path: `/search/${row.Notebookid}`, query: route.query })
}

/* 详情态「返回搜索结果」：回到列表并保留 q/page/size */
function backToList() {
  router.push({ path: '/search', query: route.query })
}

/* 排序切换：写地址栏 → watch(route) 统一拉数据。
   排序一变必须回第 1 页 —— 否则会停在一个「按新排序毫无意义」的页码上。 */
function applySort(nextSort: 'time' | 'word', nextOrder: 'asc' | 'desc') {
  if (nextSort === sortField.value && nextOrder === order.value) return

  sortField.value = nextSort
  order.value = nextOrder
  window.scrollTo({ top: 0 })
  router.replace({ path: '/search', query: buildQuery(activeQ.value, 1, pageSize.value) })
}

function setSortField(f: 'time' | 'word') {
  applySort(f, order.value)
}

/* 正序/倒序：方向对「时间」和「字数」是同一套含义，来回切即可 */
function toggleOrder() {
  applySort(sortField.value, order.value === 'desc' ? 'asc' : 'desc')
}

/* ===== 地址栏是唯一事实来源：?q=&page=&size=&sort=&order= 管列表，:aid 管详情 ===== */
/* 显式标注返回类型：对象字面量里的属性会被拓宽成 string，
   不写死的话赋值回 ref<'time'|'word'> 就会报 TS2322 */
function readQuery(): {
  q: string
  p: number
  s: number
  sort: 'time' | 'word'
  ord: 'asc' | 'desc'
} {
  const raw = route.query.q
  const q = (Array.isArray(raw) ? raw[0] : raw) || ''
  const p = Math.max(1, parseInt(route.query.page as string, 10) || 1)
  const s = Math.min(50, Math.max(1, parseInt(route.query.size as string, 10) || 24))
  // 非法/缺省值一律回落到默认排序，和后端的收敛规则保持一致
  const sort = route.query.sort === 'word' ? 'word' : 'time'
  const ord = route.query.order === 'asc' ? 'asc' : 'desc'
  return { q, p, s, sort, ord }
}

function syncFromRoute() {
  const { q, p, s, sort, ord } = readQuery()
  keyword.value = q
  activeQ.value = q
  pageSize.value = s
  page.value = p
  /* 先落排序，fetchPage 读的是这两个 ref */
  sortField.value = sort
  order.value = ord
  fetchPage(q, p)
}

/* 列表态 / 详情态共用一个组件，靠 :aid 是否存在切换 */
function sync() {
  const { q } = readQuery()
  // 详情态也要让搜索栏带词，正文才能按它高亮
  keyword.value = q
  activeQ.value = q

  if (aid.value) {
    loadDetail(aid.value)
    return
  }

  document.title = '搜索 - 暮观云笔记'
  syncFromRoute()
}

onMounted(async () => {
  sync()
  if (!aid.value) {
    await nextTick()
    inputRef.value?.focus?.()
  }
})

watch(() => route.fullPath, sync)
</script>

<template>
  <div class="search-box-page" :class="{ 'search-box-page--detail': aid }">
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

    <!-- ===== 详情态：原地用 MdArticle 渲染全文（和随机推荐同一套效果），
         搜索栏保留，正文按关键词高亮 ===== -->
    <template v-if="aid">
      <nav class="sp-bar">
        <button class="sp-back" @click="backToList">← 返回搜索结果</button>
        <span v-if="activeQ" class="sp-bar__tip">正文已高亮「{{ activeQ }}」</span>
      </nav>

      <MdArticle
        :title="detail ? detail.title || '无标题' : ''"
        :createtime="detail?.createtime || ''"
        :content="detail?.content || ''"
        :loading="detailLoading"
        :error="detailError"
        :highlight="activeQ"
      />
    </template>

    <!-- ===== 列表态 ===== -->
    <template v-else>
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
          <div class="sp-tools">
            <div class="sp-count">
              找到 <b>{{ total }}</b> 篇包含「{{ activeQ }}」的笔记
            </div>

            <!-- 排序：字段（时间/字数）× 方向（倒序/正序），和 q/page/size 一样写进地址栏 -->
            <div class="sp-sort">
              <span class="sp-sort__label">排序</span>
              <div class="sp-seg">
                <button
                  type="button"
                  :class="{ 'is-on': sortField === 'time' }"
                  @click="setSortField('time')"
                >
                  按时间
                </button>
                <button
                  type="button"
                  :class="{ 'is-on': sortField === 'word' }"
                  @click="setSortField('word')"
                >
                  按字数
                </button>
              </div>
              <button
                type="button"
                class="sp-dir"
                :title="order === 'desc' ? '当前倒序，点击切正序' : '当前正序，点击切倒序'"
                @click="toggleOrder"
              >
                {{ order === 'desc' ? '倒序 ↓' : '正序 ↑' }}
              </button>
            </div>
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

/* 详情态的返回条：跟公开页的返回按钮同一套观感 */
.sp-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sp-back {
  font-family: inherit;
  font-size: 14px;
  padding: 6px 14px;
  cursor: pointer;
  border-radius: 999px;
  color: color-mix(in srgb, var(--word-color) 88%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 20%, transparent);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:hover {
    background-color: color-mix(in srgb, var(--word-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--word-color) 32%, transparent);
  }
}

.sp-bar__tip {
  font-size: 13px;
  color: var(--muted);
}

.sp-count {
  font-size: 13.5px;
  color: var(--muted);

  b {
    color: var(--color-primary-text);
    font-weight: 700;
  }
}

/* 结果区顶部一行：左边命中数，右边排序控件 */
.sp-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.sp-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;

  &__label {
    color: var(--muted);
  }
}

/* 分段控件：按时间 / 按字数。手写而不是 el-radio-group ——
   和本页 .sp-back 同一套观感，也免得跟 element-plus 的版本差异较劲 */
.sp-seg {
  display: inline-flex;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--word-color) 20%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 5%, transparent);

  button {
    font-family: inherit;
    font-size: 13px;
    padding: 5px 14px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--word-color) 80%, transparent);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;

    & + button {
      border-left: 1px solid color-mix(in srgb, var(--word-color) 14%, transparent);
    }

    &:hover {
      background-color: color-mix(in srgb, var(--word-color) 10%, transparent);
    }

    &.is-on {
      color: #fff;
      background-color: var(--color-primary);
      font-weight: 600;
    }
  }
}

/* 方向开关：倒序 ↓ / 正序 ↑ */
.sp-dir {
  font-family: inherit;
  font-size: 13px;
  padding: 5px 14px;
  cursor: pointer;
  border-radius: 999px;
  color: color-mix(in srgb, var(--word-color) 88%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 20%, transparent);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:hover {
    background-color: color-mix(in srgb, var(--word-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
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

/* ===== 半透明主题：结果区也走「暗色半透 + 白字」 =====
   笔记页的面板靠 ArticleContent.setTheme 往 body 上写内联变量（--all-backcolor 等），
   搜索页是独立路由、直接刷新进来时那些内联变量并不存在，所以这里把结果区的令牌
   就地钉在元素上 —— 从笔记页点过来和直接打开 /search，观感都一致。

   底色用固定 rgba 而不是 var(--all-backcolor)：后者「从笔记页跳过来」时是
   rgba(0,0,0,0.1)，「直接刷新」时又回落到浅色的 0.96，同一页两条路径两种观感。
   0.35 + 背景模糊是为了压住壁纸上半部那片亮天空，白字才不会糊在亮色壁纸上。 */
body[data-theme='semiTransparent'] .sp-tools,
body[data-theme='semiTransparent'] .sp-card,
body[data-theme='semiTransparent'] .sp-pager {
  /* 卡片里的标题/摘要/元信息/标签全部由这两个令牌派生，改它们就整体跟着走 */
  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 72%, transparent);

  background-color: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

/* 结果卡片：浅色主题下的白卡在半透主题里像往壁纸上贴了张纸 */
body[data-theme='semiTransparent'] .sp-card {
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
  }
}

/* 搜索框：笔记页在半透主题下输入框也是半透的（见 articleList.scss 的 .search-box），
   这里对齐同一套观感。Element 的输入框底色/文字/占位符各有自己的变量，
   单改 wrapper 的 background 会出现白字压白底，所以整组令牌一起换。 */
body[data-theme='semiTransparent'] .sp-search {
  --el-input-bg-color: transparent;
  --el-input-text-color: #fff;
  --el-input-border-color: rgba(255, 255, 255, 0.2);
  --el-input-hover-border-color: rgba(255, 255, 255, 0.35);
  --el-input-focus-border-color: var(--color-primary);
  --el-text-color-placeholder: rgba(255, 255, 255, 0.55);
  --el-text-color-regular: #fff;
  /* 「搜索」按钮所在的 append 区用的是 --el-fill-color-light，默认是浅灰 */
  --el-fill-color-light: rgba(255, 255, 255, 0.16);

  :deep(.el-input__wrapper) {
    background-color: rgba(0, 0, 0, 0.35);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.2) inset,
      0 4px 18px rgba(0, 0, 0, 0.25);

    &.is-focus {
      box-shadow:
        0 0 0 1px var(--color-primary) inset,
        0 0 0 3px rgba(85, 144, 226, 0.25);
    }
  }

  :deep(.el-input__inner) {
    color: #fff;
    /* 光标和框选也要跟着变亮，否则暗底上找不着插入点 */
    caret-color: #fff;

    &::placeholder {
      color: rgba(255, 255, 255, 0.55);
    }
  }

  /* 清空图标：默认是深灰，压在暗底上几乎看不见 */
  :deep(.el-input__suffix .el-input__clear) {
    color: rgba(255, 255, 255, 0.6);

    &:hover {
      color: #fff;
    }
  }

  :deep(.el-input-group__append) {
    background-color: rgba(0, 0, 0, 0.35);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-left: none;
    box-shadow: none;
  }

  :deep(.el-button) {
    color: #fff;
    background-color: transparent;
    border-color: transparent;

    &:hover {
      color: #fff;
      background-color: rgba(255, 255, 255, 0.14);
      border-color: transparent;
    }
  }
}

/* 工具条（命中数 + 排序控件）：浅色主题下它直接浮在背景上，
   半透主题里得跟卡片一样给块暗底，否则白字压在亮天空上根本读不了 */
body[data-theme='semiTransparent'] .sp-tools {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 10px 14px;
}

/* 命中高亮：卡片变暗后原来那块淡黄底太扎眼，白字压浅黄也读不了，
   换成半透琥珀 —— 和卡片拉开亮度差，白字仍然清楚 */
body[data-theme='semiTransparent'] .sp-hit {
  background-color: rgba(239, 159, 39, 0.5);
  color: #fff;
}

/* 分页条：Element Plus 的默认令牌是白底深字，得整体换成暗底亮字 */
body[data-theme='semiTransparent'] .sp-pager {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  /* 亮蓝对齐 main.scss 里半透主题的 --color-primary-text（深蓝压暗底会发闷） */
  --el-color-primary: #8ab6f0;
  --el-bg-color: transparent;
  --el-bg-color-overlay: rgba(0, 0, 0, 0.8);
  --el-text-color-regular: #fff;
  --el-text-color-primary: #fff;
  --el-border-color: rgba(255, 255, 255, 0.2);
  --el-fill-color: rgba(255, 255, 255, 0.12);
  /* 每页条数下拉和跳页输入框用的是 --el-fill-color-blank（不是 --el-bg-color），
     不覆盖的话它俩还是白底，白字压白底等于看不见 */
  --el-fill-color-blank: rgba(255, 255, 255, 0.08);
  --el-fill-color-light: rgba(255, 255, 255, 0.16);
  /* 只有一页时左右翻页键是 disabled，走的是 --el-disabled-*，
     默认值 #f5f7fa 会在暗底上糊出两块白方块 */
  --el-disabled-bg-color: rgba(255, 255, 255, 0.06);
  --el-disabled-text-color: rgba(255, 255, 255, 0.35);
}

body[data-theme='semiTransparent'] .sp-head {
  border-bottom-color: rgba(255, 255, 255, 0.18);
}

/* 详情态收窄到和随机推荐一致的阅读宽度（880px），
   写在 .search-box-page 之后才盖得住它的 1040px。 */
.search-box-page--detail {
  width: min(880px, 92vw);
}
</style>
