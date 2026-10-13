<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import MdArticle from '@/components/pc/MdArticle.vue'

/* ===== 阅览模式：替代主页的只读整页 =====
   左边文件夹列表 + 文章列表，右边只读渲染全文。
   和搜索页的唯一区别是「不筛关键词」—— 卡片样式、排序、分页、详情渲染全部同一套，
   所以 /search 的观感在这里完全一致。

   注意：这一页要真正替代主页的「三栏编辑」，所以左侧栏不是复用的 FolderList
   （那个组件还挂着 ArticleList + ArticleContent，一进来就是编辑器）。
   这里自带一份轻量文件树 + 卡片列表，只读、不落任何编辑入口。 */

const theme = localStorage.getItem('theme') || 'light'
document.body.setAttribute('data-theme', theme)

const server_url = localStorage.getItem('server_url')

const route = useRoute()
const router = useRouter()

/* ===== 排序 =====
   和搜索页同一套白名单：createtime / updatetime / word，order = desc / asc。
   状态写进地址栏（?sort=&order=&folder=&page=&size=），刷新/前进后退都能还原。 */
type SortField = 'createtime' | 'updatetime' | 'word'
const sortField = ref<SortField>('createtime')
const order = ref<'asc' | 'desc'>('desc')

/* 卡片底部显示的日期跟随排序字段：按更新时间排就显示更新时间，
   否则显示创建时间，避免「按更新时间排却看着创建时间」的错位。 */
const dateField = computed(() => (sortField.value === 'updatetime' ? 'updatetime' : 'createtime'))

/* ===== 文件夹 =====
   folderid：-2 全部笔记（默认）/ -1 未分类 / 其他为具体文件夹 id，
   与后端 ListCards 的收敛规则一致。 */
const folders = ref<any[]>([])
const folderId = ref(-2)
const folderName = ref('全部笔记')

const pageSize = ref(24)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

/* ===== 搜索（本页内搜索，不跳 /search） =====
   scope：'all' 搜全站自己的所有文章 / 'folder' 只在当前选中的文件夹里搜。
   走同一个 /search 接口（后端新增 folderid 参数支持范围收敛），
   这样卡片、摘要、分页、排序全部复用同一套，不用维护第二条链路。
   有没有关键词决定「列表模式」还是「搜索结果模式」，同一个渲染分支。 */
const keyword = ref('') // 输入框里的词
const activeQ = ref('') // 真正生效的词
const scope = ref<'all' | 'folder'>('all')

/* 搜索生效后返回给接口的 folderid：全站搜索永远 -2（不筛文件夹），
   文件夹内搜索用当前选中的 folderId。 */
const searchFolderId = computed(() =>
  activeQ.value && scope.value === 'folder' ? folderId.value : -2
)

/* ===== 详情态 =====
   点卡片 → /reading/:aid，右侧用和随机推荐/搜索同一个 MdArticle 渲染全文。 */
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
    document.title = `${row.title || '无标题'} - 阅览`
  } catch (e: any) {
    detailError.value = '正文加载失败：' + (e?.message || e)
  } finally {
    detailLoading.value = false
  }
}

/* ===== 摘要：把 Markdown 压成纯文本预览（阅览模式不涉及高亮，不需要居中裁窗） ===== */
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

  /* 有搜索词时以命中位置为中心重新裁窗，和搜索页一致 ——
     否则前面的 Markdown 语法会把命中词挤出可见区。 */
  const q = activeQ.value
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i === -1) return text.length > max ? text.slice(0, max) + '…' : text

  const start = Math.max(0, i - Math.floor((max - q.length) / 2))
  const end = Math.min(text.length, start + max)
  return (
    (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  )
}

/* 关键词高亮：拆成 [{t, hit}] 交给模板渲染 span，绝不用 v-html
   （正文里可能有 HTML，拼进 v-html 就是 XSS）。 */
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

function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* ===== 拉文件夹（只读用，不需要新建/删除那套） ===== */
async function loadFolders() {
  try {
    folders.value = (await axios.get(`${server_url}/folders`)).data || []
  } catch {
    folders.value = []
  }
}

/* ===== 拉一页数据 =====
   有关键词 → 走 /search（可带 folderid 限定范围）；没有 → 走 /article/list（当前文件夹全量）。
   两个接口返回结构一致（{ list, total, page, size }），所以卡片/分页只写一套。 */
async function fetchPage(targetPage: number) {
  loading.value = true
  error.value = ''

  const q = activeQ.value
  const isSearch = !!q

  try {
    const res = await axios.get(isSearch ? `${server_url}/search` : `${server_url}/article/list`, {
      params: {
        ...(isSearch ? { q } : {}),
        folderid: isSearch ? searchFolderId.value : folderId.value,
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
    error.value = (isSearch ? '搜索失败：' : '加载失败：') + (e?.message || e)
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/* ===== 地址栏是唯一事实来源 ===== */
function buildQuery(fid: number, p: number, s?: number) {
  const qy: Record<string, string> = {}
  /* 默认（全部笔记 + 创建时间 + 倒序 + 第 1 页 + 24 条）不写进 URL，保持干净 */
  if (fid !== -2) qy.folder = String(fid)
  if (activeQ.value) qy.q = activeQ.value
  /* 只有「文件夹内搜索」才带 scope：全站搜索是默认，不用写 */
  if (activeQ.value && scope.value === 'folder') qy.scope = 'folder'
  if (p > 1) qy.page = String(p)
  if (s && s !== 24) qy.size = String(s)
  if (sortField.value !== 'createtime') qy.sort = sortField.value
  if (order.value !== 'desc') qy.order = order.value
  return qy
}

function readQuery(): {
  fid: number
  p: number
  s: number
  sort: SortField
  ord: 'asc' | 'desc'
  q: string
  sc: 'all' | 'folder'
} {
  const fidRaw = parseInt(route.query.folder as string, 10)
  const fid = Number.isNaN(fidRaw) ? -2 : fidRaw
  const p = Math.max(1, parseInt(route.query.page as string, 10) || 1)
  const s = Math.min(50, Math.max(1, parseInt(route.query.size as string, 10) || 24))
  const rawSort = route.query.sort
  const sort: SortField =
    rawSort === 'word' ? 'word' : rawSort === 'updatetime' ? 'updatetime' : 'createtime'
  const ord = route.query.order === 'asc' ? 'asc' : 'desc'
  const rawQ = route.query.q
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ) || ''
  const sc: 'all' | 'folder' = route.query.scope === 'folder' ? 'folder' : 'all'
  return { fid, p, s, sort, ord, q, sc }
}

/* 选中的文件夹名：先从已知列表里找，找不到（深链直接带 folder 进来、folders 还没回来）
   就退回「笔记」，等 folders 到了再纠正。 */
function resolveFolderName(fid: number) {
  if (fid === -2) return '全部笔记'
  if (fid === -1) return '未分类'
  const hit = folders.value.find((f: any) => f.folder_id === fid)
  return hit ? hit.folder_name : '笔记'
}

function syncListFromRoute() {
  const { fid, p, s, sort, ord, q, sc } = readQuery()
  folderId.value = fid
  folderName.value = resolveFolderName(fid)
  pageSize.value = s
  page.value = p
  /* 先落排序/关键词/范围，fetchPage 读的就是这几个 ref */
  sortField.value = sort
  order.value = ord
  keyword.value = q
  activeQ.value = q
  scope.value = sc
  fetchPage(p)
}

/* 列表态 / 详情态共用一个组件，靠 :aid 是否存在切换 */
function sync() {
  if (aid.value) {
    /* 详情态左侧栏也要有正确的文件夹/列表状态，否则返回列表会错位 ——
       这里把查询参数落一遍，但不重新拉列表（右侧正在渲染全文）。 */
    const { fid, s, sort, ord, q, sc } = readQuery()
    folderId.value = fid
    folderName.value = resolveFolderName(fid)
    pageSize.value = s
    sortField.value = sort
    order.value = ord
    keyword.value = q
    activeQ.value = q
    scope.value = sc
    loadDetail(aid.value)
    return
  }

  document.title = '阅览模式 - 暮观云笔记'
  syncListFromRoute()
}

/* ===== 交互 ===== */
function selectFolder(fid: number, name: string) {
  if (folderId.value === fid) return
  folderName.value = name
  /* 切文件夹时丢掉「文件夹内搜索」的范围勾选 —— 原来的搜索范围已经没意义了，
     但保留关键词继续搜（全站），比直接清空更符合预期 */
  if (scope.value === 'folder') scope.value = 'all'
  router.replace({ path: '/reading', query: buildQuery(fid, 1, pageSize.value) })
}

/* 回车 / 点搜索：把关键词和范围写进地址栏，由 watch(route) 统一拉数据。
   注意 activeQ 必须先落 —— buildQuery 读的就是它（地址栏是唯一事实来源，
   但构造 query 时得先把「这次要搜什么」定下来，否则会拿旧值拼 URL）。 */
function submitSearch() {
  const q = keyword.value.trim()
  const curScope: 'all' | 'folder' = route.query.scope === 'folder' ? 'folder' : 'all'
  if (q === activeQ.value && scope.value === curScope) return

  activeQ.value = q
  router.replace({ path: '/reading', query: buildQuery(folderId.value, 1, pageSize.value) })
}

/* 清空输入框后回车 = 取消搜索，回到当前文件夹的完整列表 */
function clearSearch() {
  keyword.value = ''
  activeQ.value = ''
  router.replace({ path: '/reading', query: buildQuery(folderId.value, 1, pageSize.value) })
}

/* 范围切换：全站 / 当前文件夹。切了范围要重新搜一遍 */
function setScope(next: 'all' | 'folder') {
  if (scope.value === next) return
  /* 范围只对「已有关键词」的搜索生效；没有关键词时列表本来就走当前文件夹 */
  scope.value = next
  if (activeQ.value) {
    router.replace({ path: '/reading', query: buildQuery(folderId.value, 1, pageSize.value) })
  }
}

function openArticle(row: any) {
  router.push({ path: `/reading/${row.Notebookid}`, query: route.query })
}

function backToList() {
  router.push({ path: '/reading', query: route.query })
}

function applySort(nextSort: SortField, nextOrder: 'asc' | 'desc') {
  if (nextSort === sortField.value && nextOrder === order.value) return
  sortField.value = nextSort
  order.value = nextOrder
  window.scrollTo({ top: 0 })
  router.replace({ path: '/reading', query: buildQuery(folderId.value, 1, pageSize.value) })
}

function setSortField(f: SortField) {
  applySort(f, order.value)
}

function toggleOrder() {
  applySort(sortField.value, order.value === 'desc' ? 'asc' : 'desc')
}

function onPageChange(p: number) {
  window.scrollTo({ top: 0 })
  router.replace({ path: '/reading', query: buildQuery(folderId.value, p, pageSize.value) })
}

function onSizeChange(s: number) {
  pageSize.value = s
  router.replace({ path: '/reading', query: buildQuery(folderId.value, 1, s) })
}

onMounted(async () => {
  await loadFolders()
  /* folders 到了之后把名字纠正一次（深链直接带 folder= 进来时上面拿到的是占位名） */
  if (folderId.value !== -2 && folderId.value !== -1) {
    folderName.value = resolveFolderName(folderId.value)
  }
  sync()
  await nextTick()
})

watch(() => route.fullPath, sync)
</script>

<template>
  <div class="reading-page" :class="{ 'reading-page--detail': aid }">
    <header class="rd-head">
      <div class="rd-brand">
        <span class="rd-brand__name">暮观云笔记</span>
        <span class="rd-brand__sub">阅览模式</span>
      </div>
      <nav class="rd-head__nav">
        <router-link to="/notebook" class="rd-head__link">编辑模式 →</router-link>
        <router-link to="/search" class="rd-head__link">搜索</router-link>
        <router-link to="/public" class="rd-head__link">公开页</router-link>
      </nav>
    </header>

    <div class="rd-body">
      <!-- ===== 左栏：文件夹卡片（不沿用主页那套朴素 li 列表，改成和卡片同一套语言） ===== -->
      <aside class="rd-side">
        <div class="rd-side__head">文件夹</div>
        <div class="rd-folders">
          <button
            type="button"
            class="rd-folder"
            :class="{ 'is-on': folderId === -2 }"
            @click="selectFolder(-2, '全部笔记')"
          >
            <el-icon class="rd-folder__icon"><Files /></el-icon>
            <span class="rd-folder__name">全部笔记</span>
          </button>
          <button
            type="button"
            class="rd-folder"
            :class="{ 'is-on': folderId === -1 }"
            @click="selectFolder(-1, '未分类')"
          >
            <el-icon class="rd-folder__icon"><FolderOpened /></el-icon>
            <span class="rd-folder__name">未分类</span>
          </button>

          <button
            v-for="f in folders"
            :key="f.folder_id"
            type="button"
            class="rd-folder"
            :class="{ 'is-on': folderId === f.folder_id }"
            :title="f.folder_name"
            @click="selectFolder(f.folder_id, f.folder_name)"
          >
            <el-icon class="rd-folder__icon"><Folder /></el-icon>
            <span class="rd-folder__name">{{ f.folder_name }}</span>
          </button>
        </div>
      </aside>

      <!-- ===== 右栏 ===== -->
      <main class="rd-main">
        <!-- 详情态：只读全文（和随机推荐/公开页/搜索详情同一套 MdArticle） -->
        <template v-if="aid">
          <nav class="rd-bar">
            <button class="rd-back" @click="backToList">← 返回列表</button>
            <span class="rd-bar__tip">只读阅览 · 与编辑模式同一份内容</span>
          </nav>

          <MdArticle
            :title="detail ? detail.title || '无标题' : ''"
            :createtime="detail?.createtime || ''"
            :content="detail?.content || ''"
            :loading="detailLoading"
            :error="detailError"
          />
        </template>

        <!-- 列表态 -->
        <template v-else>
          <!-- 搜索栏：范围可选「全站 / 当前文件夹」，回车即搜，不跳转 -->
          <div class="rd-searchrow">
            <el-input
              v-model="keyword"
              class="rd-search"
              size="large"
              clearable
              :placeholder="
                scope === 'all' ? '搜索全部笔记…' : `在「${folderName}」内搜索…`
              "
              @keyup.enter="submitSearch"
              @clear="clearSearch"
            >
              <template #prepend>
                <el-select v-model="scope" class="rd-scope" @change="setScope(scope)">
                  <el-option label="全站" value="all" />
                  <el-option label="当前文件夹" value="folder" />
                </el-select>
              </template>
              <template #append>
                <el-button @click="submitSearch">搜索</el-button>
              </template>
            </el-input>
          </div>

          <div class="rd-tools">
            <div class="rd-count">
              <template v-if="activeQ">
                找到 <b>{{ total }}</b> 篇含「{{ activeQ }}」的笔记
                <span v-if="scope === 'folder'" class="rd-count__scope">
                  · 限「{{ folderName }}」
                </span>
              </template>
              <template v-else>
                <b>{{ folderName }}</b>
                <span class="rd-count__n">共 {{ total }} 篇</span>
              </template>
            </div>

            <div class="rd-sortbar">
              <button
                type="button"
                class="rd-sortbar__item"
                :class="{ 'is-on': sortField === 'createtime' }"
                @click="setSortField('createtime')"
              >
                创建时间
              </button>
              <span class="rd-sortbar__sep">/</span>
              <button
                type="button"
                class="rd-sortbar__item"
                :class="{ 'is-on': sortField === 'updatetime' }"
                @click="setSortField('updatetime')"
              >
                更新时间
              </button>
              <span class="rd-sortbar__sep">/</span>
              <button
                type="button"
                class="rd-sortbar__item"
                :class="{ 'is-on': sortField === 'word' }"
                @click="setSortField('word')"
              >
                字数
              </button>
              <button
                type="button"
                class="rd-sortbar__dir"
                :title="order === 'desc' ? '当前倒序，点击切正序' : '当前正序，点击切倒序'"
                @click="toggleOrder"
              >
                {{ order === 'desc' ? '↓' : '↑' }}
              </button>
            </div>
          </div>

          <div v-if="loading" class="rd-hint">
            {{ activeQ ? '正在搜索…' : '正在加载…' }}
          </div>
          <div v-else-if="error" class="rd-hint rd-hint--err">{{ error }}</div>
          <div v-else-if="list.length === 0" class="rd-hint">
            <template v-if="activeQ">
              没有找到包含「{{ activeQ }}」的笔记<span v-if="scope === 'folder'"
                >（范围：{{ folderName }}）</span
              >。试试切到「全站」。
            </template>
            <template v-else>「{{ folderName }}」里还没有笔记。</template>
          </div>

          <template v-else>
            <div class="rd-grid">
              <article
                v-for="row in list"
                :key="row.Notebookid"
                class="rd-card"
                @click="openArticle(row)"
              >
                <h2 class="rd-card__title">
                  <span
                    v-for="(p, i) in highlight(row.title || '无标题', activeQ)"
                    :key="i"
                    :class="{ 'rd-hit': p.hit }"
                    >{{ p.t }}</span
                  >
                </h2>

                <p class="rd-card__excerpt">
                  <template v-if="excerpt(row)">
                    <span
                      v-for="(p, i) in highlight(excerpt(row), activeQ)"
                      :key="i"
                      :class="{ 'rd-hit': p.hit }"
                      >{{ p.t }}</span
                    >
                  </template>
                  <template v-else>（这篇还没有正文）</template>
                </p>

                <div class="rd-card__meta">
                  <span>{{ fmtDate(row[dateField]) }}</span>
                  <span v-if="row.length" class="rd-card__dot">·</span>
                  <span v-if="row.length">{{ row.length }} 字</span>
                  <span v-if="row.is_public" class="rd-tag rd-tag--pub">已公开</span>
                  <span v-if="row.is_ai_generated" class="rd-tag">AI 生成</span>
                </div>
              </article>
            </div>

            <el-pagination
              v-if="total > 0"
              class="rd-pager"
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
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 本页是独立整页路由（meta.pageScroll），走文档级滚动，
   所以不复用笔记页那套固定视口三栏的 99vh —— 让它随内容自然长。 */
.reading-page {
  width: min(1240px, 94vw);
  margin: 32px auto 72px;
  display: flex;
  flex-direction: column;
  gap: 18px;

  /* 独立页从半透明主题跳进来时，不钉住就会出现白字压白卡片 */
  --word-color: #1f1f1f;
  --muted: color-mix(in srgb, var(--word-color) 55%, transparent);
}

.rd-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.rd-brand {
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

.rd-head__nav {
  display: flex;
  align-items: baseline;
  gap: 16px;
}

.rd-head__link {
  font-size: 14px;
  color: var(--color-primary-text);
  text-decoration: none;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

/* 左文件夹 + 右内容：窄屏自动堆成上下 */
.rd-body {
  display: grid;
  grid-template-columns: 212px minmax(0, 1fr);
  gap: 22px;
  align-items: start;

  @media (max-width: 860px) {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 左栏：文件夹卡片。窄栏单列排布，做成和右侧文章卡片同一套语言
   （圆角 + 柔和阴影 + 白底 / 半透主题暗底），但更紧凑。 */
.rd-side {
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  &__head {
    font-size: 12.5px;
    letter-spacing: 0.5px;
    padding-left: 4px;
    color: var(--muted);
  }
}

.rd-folders {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rd-folder {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 10px;
  color: color-mix(in srgb, var(--word-color) 84%, transparent);
  background-color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    background-color 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.09);
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  }

  /* 选中态走蓝色系（项目约定：不要琥珀暖黄） */
  &.is-on {
    color: var(--color-primary-text);
    font-weight: 700;
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
    background-color: color-mix(in srgb, var(--color-primary) 10%, #fff);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--color-primary) 20%, transparent);
  }

  &__icon {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--color-primary-text);
  }

  /* 中文文件夹名偏长：单行省略而不是折行，保证每张卡片高度一致 */
  &__name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.rd-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 搜索栏：范围下拉在左（prepend），输入框居中，搜索按钮在右（append） */
.rd-searchrow {
  display: flex;
  align-items: center;
}

.rd-search {
  max-width: 620px;
  width: 100%;

  /* 范围下拉嵌在 prepend 里：去掉自己的边框和阴影，融进输入组 */
  :deep(.el-input-group__prepend) {
    padding: 0;
    background-color: transparent;
    box-shadow: none;
    border: none;
  }
}

/* 范围下拉：宽度够放「当前文件夹」四个字，样式跟输入框协调 */
.rd-scope {
  width: 116px;

  :deep(.el-input__wrapper) {
    background-color: color-mix(in srgb, var(--word-color) 6%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--word-color) 16%, transparent) inset;
  }

  :deep(.el-input__inner) {
    color: var(--word-color);
  }
}

.rd-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.rd-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13.5px;
  color: var(--muted);

  b {
    color: var(--color-primary-text);
    font-weight: 700;
  }

  &__n {
    font-size: 13px;
  }

  &__n::before {
    content: '·';
    margin-right: 8px;
    opacity: 0.6;
  }

  &__scope {
    color: var(--muted);
    font-weight: 400;
  }
}

.rd-sortbar {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--muted);
  white-space: nowrap;

  &__item {
    font-family: inherit;
    font-size: 12.5px;
    padding: 2px 2px;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--muted);
    transition: color 0.18s ease;

    &:hover {
      color: color-mix(in srgb, var(--word-color) 85%, transparent);
    }

    &.is-on {
      color: var(--color-primary-text);
      font-weight: 700;
    }
  }

  &__sep {
    opacity: 0.4;
  }

  &__dir {
    font-family: inherit;
    font-size: 12.5px;
    margin-left: 4px;
    padding: 2px 8px;
    cursor: pointer;
    border-radius: 999px;
    color: color-mix(in srgb, var(--word-color) 85%, transparent);
    background-color: color-mix(in srgb, var(--word-color) 7%, transparent);
    border: 1px solid color-mix(in srgb, var(--word-color) 18%, transparent);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease;

    &:hover {
      background-color: color-mix(in srgb, var(--word-color) 12%, transparent);
      border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    }
  }
}

.rd-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rd-back {
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

.rd-bar__tip {
  font-size: 13px;
  color: var(--muted);
}

.rd-hint {
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

/* 卡片网格和搜索页同款：minmax(280px, 1fr) 自适应列数 */
.rd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.rd-card {
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

.rd-tag {
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

/* 命中词高亮：和搜索页的 .sp-hit 同一套观感（淡黄底 + 正常字色） */
.rd-hit {
  background-color: #ffe9a8;
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}

.rd-pager {
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
  --el-color-primary: #5590e2;
  --el-bg-color: #fff;
  --el-bg-color-overlay: #fff;
  --el-text-color-regular: #1f1f1f;
  --el-border-color: rgba(0, 0, 0, 0.15);
  --el-fill-color: rgba(0, 0, 0, 0.04);
}

/* 详情态收窄到和随机推荐/搜索详情一致的阅读宽度（880px） */
.rd-body:has(.rd-main .rd-bar) {
  grid-template-columns: 212px minmax(0, 1fr);
}

/* ===== 半透明主题：和搜索页同一套「暗色半透 + 白字」 =====
   注意 --word-color 必须钉成 #fff —— 卡片底色变暗后，标题/摘要/元信息
   全都由它派生，不钉住就是黑字压暗底，直接读不了。 */
body[data-theme='semiTransparent'] .rd-card,
body[data-theme='semiTransparent'] .rd-pager,
body[data-theme='semiTransparent'] .rd-tools {
  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 72%, transparent);

  color: #fff;
  background-color: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

body[data-theme='semiTransparent'] .rd-card {
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
  }

  .rd-card__title {
    color: #fff;
  }

  .rd-card__excerpt {
    color: rgba(255, 255, 255, 0.78);
  }

  .rd-card__meta {
    color: rgba(255, 255, 255, 0.72);
  }
}

body[data-theme='semiTransparent'] .rd-tag {
  color: rgba(255, 255, 255, 0.8);
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);

  &--pub {
    color: #8ab6f0;
    background-color: rgba(138, 182, 240, 0.18);
    border-color: rgba(138, 182, 240, 0.45);
  }
}

body[data-theme='semiTransparent'] .rd-count {
  color: rgba(255, 255, 255, 0.75);

  b {
    color: #8ab6f0;
  }

  &__scope {
    color: rgba(255, 255, 255, 0.6);
  }
}

body[data-theme='semiTransparent'] .rd-hint {
  color: rgba(255, 255, 255, 0.75);
}

body[data-theme='semiTransparent'] .rd-tools {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 10px 14px;
}

body[data-theme='semiTransparent'] .rd-pager {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  --el-color-primary: #8ab6f0;
  --el-bg-color: transparent;
  --el-bg-color-overlay: rgba(0, 0, 0, 0.8);
  --el-text-color-regular: #fff;
  --el-text-color-primary: #fff;
  --el-border-color: rgba(255, 255, 255, 0.2);
  --el-fill-color: rgba(255, 255, 255, 0.12);
  --el-fill-color-blank: rgba(255, 255, 255, 0.08);
  --el-fill-color-light: rgba(255, 255, 255, 0.16);
  --el-disabled-bg-color: rgba(255, 255, 255, 0.06);
  --el-disabled-text-color: rgba(255, 255, 255, 0.35);
}

body[data-theme='semiTransparent'] .rd-head {
  border-bottom-color: rgba(255, 255, 255, 0.18);
}

body[data-theme='semiTransparent'] .rd-folder {
  --word-color: #fff;

  color: rgba(255, 255, 255, 0.86);
  background-color: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);

  &:hover {
    border-color: rgba(255, 255, 255, 0.34);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  }

  /* 暗底上用亮蓝，深蓝会发闷 */
  &.is-on {
    color: #8ab6f0;
    background-color: rgba(255, 255, 255, 0.14);
    border-color: rgba(138, 182, 240, 0.6);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .rd-folder__icon {
    color: #8ab6f0;
  }
}

body[data-theme='semiTransparent'] .rd-side__head {
  color: rgba(255, 255, 255, 0.7);
}

/* 搜索框：对齐搜索页在半透主题下的整套输入框令牌，避免白字压白底 */
body[data-theme='semiTransparent'] .rd-search {
  --el-input-bg-color: transparent;
  --el-input-text-color: #fff;
  --el-input-border-color: rgba(255, 255, 255, 0.2);
  --el-input-hover-border-color: rgba(255, 255, 255, 0.35);
  --el-input-focus-border-color: var(--color-primary);
  --el-text-color-placeholder: rgba(255, 255, 255, 0.55);
  --el-text-color-regular: #fff;
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
    caret-color: #fff;

    &::placeholder {
      color: rgba(255, 255, 255, 0.55);
    }
  }

  :deep(.el-input__suffix .el-input__clear) {
    color: rgba(255, 255, 255, 0.6);

    &:hover {
      color: #fff;
    }
  }

  /* 范围下拉自己也铺一层暗底（它嵌在 prepend 里，prepend 已被清空） */
  :deep(.el-input-group__prepend) {
    background-color: transparent;
    box-shadow: none;
    border: none;
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

body[data-theme='semiTransparent'] .rd-scope {
  --el-input-text-color: #fff;
  --el-text-color-regular: #fff;

  :deep(.el-input__wrapper) {
    background-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
  }

  :deep(.el-input__inner) {
    color: #fff;
  }
}

/* 命中高亮：卡片变暗后淡黄底太扎眼，换成半透琥珀 */
body[data-theme='semiTransparent'] .rd-hit {
  background-color: rgba(239, 159, 39, 0.5);
  color: #fff;
}

body[data-theme='semiTransparent'] .rd-sortbar {
  color: rgba(255, 255, 255, 0.7);

  .rd-sortbar__item {
    color: rgba(255, 255, 255, 0.7);

    &:hover {
      color: #fff;
    }

    &.is-on {
      color: #8ab6f0;
    }
  }

  .rd-sortbar__sep {
    color: rgba(255, 255, 255, 0.4);
  }

  .rd-sortbar__dir {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.24);
  }
}

body[data-theme='semiTransparent'] .rd-back {
  color: rgba(255, 255, 255, 0.88);
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.24);

  &:hover {
    background-color: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.36);
  }
}

body[data-theme='semiTransparent'] .rd-bar__tip {
  color: rgba(255, 255, 255, 0.72);
}
</style>
