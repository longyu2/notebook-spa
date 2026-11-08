<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { toBlob } from 'html-to-image'
import MdArticle from '@/components/pc/MdArticle.vue'
import ThemeToggle from '@/components/pc/ThemeToggle.vue'
import { initTheme } from '@/assets/js/theme'

/* ===== 阅览模式：替代主页的只读整页 =====
   左边文件夹列表 + 文章列表，右边只读渲染全文。
   和搜索页的唯一区别是「不筛关键词」—— 卡片样式、排序、分页、详情渲染全部同一套，
   所以 /search 的观感在这里完全一致。

   注意：这一页要真正替代主页的「三栏编辑」，所以左侧栏不是复用的 FolderList
   （那个组件还挂着 ArticleList + ArticleContent，一进来就是编辑器）。
   这里自带一份轻量文件树 + 卡片列表，只读、不落任何编辑入口。 */

/* 主题（整页独立路由，得自己把当前主题挂到 body 上） */
initTheme()

const server_url = localStorage.getItem('server_url')

const route = useRoute()
const router = useRouter()

/* ===== 排序 =====
   和搜索页同一套白名单：createtime / updatetime / word，order = desc / asc。
   状态写进地址栏（?sort=&order=&folder=&page=&size=），刷新/前进后退都能还原。 */
type SortField = 'createtime' | 'updatetime' | 'word'
const sortField = ref<SortField>('createtime')
const order = ref<'asc' | 'desc'>('desc')

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

/* ===== 列表缓存 + 回退滚动还原 =====
   从卡片进详情再回来，不能重新拉一遍列表：请求期间只剩 180px 的「加载中」，
   页面高度先塌再长，滚动条滑块会跟着跳。
   这里记住「当前列表数据对应的查询」和「点卡片时的滚动位置」，
   回退时查询没变就直接复用内存里的列表，并原地滚回去。 */
let loadedListKey = ''
let savedListState: { key: string; y: number } | null = null

const listKeyOf = (
  fid: number,
  p: number,
  s: number,
  sort: string,
  ord: string,
  q: string,
  sc: string
) => [fid, p, s, sort, ord, q, sc].join('|')

/* ===== 详情页的上一篇 / 下一篇 =====
   由后端按「当前文件夹 + 当前排序」计算，和列表顺序一致；
   folderid 不带时后端按「全部笔记」处理。 */
const neighbors = ref<{ prev: any; next: any }>({ prev: null, next: null })

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

async function loadNeighbors() {
  const id = aid.value
  /* 先清空：切文章时按钮短暂置灰，避免拿着上一篇的邻居去跳转 */
  neighbors.value = { prev: null, next: null }
  try {
    const res = await axios.get(`${server_url}/article/neighbors/${id}`, {
      params: {
        folderid: folderId.value,
        sort: sortField.value,
        order: order.value
      }
    })
    /* 连点「下一篇」时响应可能乱序回来，只认当前这篇的结果 */
    if (id !== aid.value) return
    neighbors.value = res.data?.data ?? { prev: null, next: null }
  } catch {
    neighbors.value = { prev: null, next: null }
  }
}

function goNeighbor(dir: 'prev' | 'next') {
  const target = neighbors.value[dir]
  if (!target) return
  /* 查询参数原样带走：返回列表时还是同一文件夹 / 排序 / 页码 */
  router.push({ path: `/reading/${target.id}`, query: route.query })
}

/* ===== 生成手机长图 =====
   不截当前页面，而是把正文按 420px 宽度离屏重排后再导出 ——
   桌面版式的行宽放到手机上看字号会又小又挤。
   普通文章按 2 倍像素密度出图（840px 宽）；特别长的文章按画布上限自动降倍率。 */
const SHOT_WIDTH = 420
const shotLoading = ref(false)
const shotOpen = ref(false)
const shotUrl = ref('')
const shotMeta = ref('')
const shotName = ref('文章.png')

function shotFilename(title: string) {
  const safe = (title || '无标题')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return `${safe || '无标题'}.png`
}

function releaseShot() {
  if (shotUrl.value) URL.revokeObjectURL(shotUrl.value)
  shotUrl.value = ''
  shotMeta.value = ''
}

async function waitImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve()
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
    )
  )
  await Promise.all(
    imgs.map(async (img) => {
      try {
        await img.decode()
      } catch {
        /* 解不出来的图片留着占位，不阻断整张图 */
      }
    })
  )
}

function buildShotSheet(contentHTML: string, row: any) {
  const sheet = document.createElement('div')
  sheet.className = 'rd-shot__sheet'

  const h1 = document.createElement('h1')
  h1.className = 'rd-shot__title'
  h1.textContent = row.title || '无标题'
  sheet.appendChild(h1)

  const metaText = [fmtDateTime(row.createtime), `${(row.content || '').length} 字`]
    .filter(Boolean)
    .join(' · ')
  if (metaText) {
    const meta = document.createElement('div')
    meta.className = 'rd-shot__meta'
    meta.textContent = metaText
    sheet.appendChild(meta)
  }

  const hr = document.createElement('div')
  hr.className = 'rd-shot__hr'
  sheet.appendChild(hr)

  const body = document.createElement('div')
  body.className = 'rd-shot__body vditor-reset'
  body.innerHTML = contentHTML
  sheet.appendChild(body)

  const foot = document.createElement('div')
  foot.className = 'rd-shot__foot'
  foot.textContent = '暮观云笔记'
  sheet.appendChild(foot)

  return sheet
}

async function generateImage() {
  if (shotLoading.value || detailLoading.value || !detail.value) return
  /* Vditor 是异步渲染的：正文还没落进 DOM 时按钮点了也白点 */
  const source = document.querySelector<HTMLElement>('.rd-detail .md-content')
  if (!source || !source.innerHTML.trim()) {
    ElMessage.warning('正文还在渲染，稍等一下再试')
    return
  }

  shotLoading.value = true
  let host: HTMLDivElement | null = null
  try {
    host = document.createElement('div')
    host.className = 'rd-shot'
    host.style.width = `${SHOT_WIDTH}px`
    const sheet = buildShotSheet(source.innerHTML, detail.value)
    host.appendChild(sheet)
    document.body.appendChild(host)

    await waitImages(sheet)
    /* 等一帧把图片尺寸/字体排版稳定下来再截 */
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const height = Math.ceil(sheet.getBoundingClientRect().height)
    /* 画布高度上限 16384px：超高文章自动降倍率，先把 2 倍压低到不触顶，
       比让截图库自己按比例缩更可控（普通文章仍然保持 840px 宽）。 */
    const pixelRatio = Math.min(2, Math.max(1, 16000 / height))
    const blob = await toBlob(sheet, {
      width: SHOT_WIDTH,
      height,
      pixelRatio,
      backgroundColor: '#ffffff',
      cacheBust: false,
      /* 正文用的都是系统字体，不需要把全站 webfont 内联进 SVG；
         跳过还能避开跨域样式表读 cssRules 的报错，出图更快。 */
      skipFonts: true
    })
    if (!blob) throw new Error('导出失败')

    releaseShot()
    shotUrl.value = URL.createObjectURL(blob)
    shotName.value = shotFilename(detail.value.title)
    /* 尺寸以真实产物为准：超长文章的画布可能被库再缩小一点 */
    let outW = Math.round(SHOT_WIDTH * pixelRatio)
    let outH = Math.round(height * pixelRatio)
    try {
      const bmp = await createImageBitmap(blob)
      outW = bmp.width
      outH = bmp.height
      bmp.close()
    } catch {
      /* 拿不到位图信息就用理论值兜底 */
    }
    shotMeta.value = `${outW} × ${outH} px`
    shotOpen.value = true
  } catch (e: any) {
    ElMessage.error('生成图片失败：' + (e?.message || e))
  } finally {
    host?.remove()
    shotLoading.value = false
  }
}

function downloadShot() {
  if (!shotUrl.value) return
  const a = document.createElement('a')
  a.href = shotUrl.value
  a.download = shotName.value
  document.body.appendChild(a)
  a.click()
  /* 点完立刻 remove 会让 Chrome 把 blob 下载判成「取消」，延后再摘 */
  setTimeout(() => a.remove(), 1000)
}

/* 方向键翻篇：←/↑ 上一篇，→/↓ 下一篇。
   只在详情态接管，输入框 / 可编辑区域、带修饰键、长按连发都不拦；
   已经在第一篇 / 最后一篇时也不拦 —— 方向键退回正常滚动。
   生成图片的过程中也不拦：翻篇会把正在截的文章换掉。 */
function onKeydown(e: KeyboardEvent) {
  if (!aid.value || shotOpen.value || shotLoading.value) return
  if (e.defaultPrevented || e.repeat) return
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return

  const dir =
    e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      ? 'prev'
      : e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 'next'
        : null
  if (!dir || !neighbors.value[dir]) return

  e.preventDefault()
  goNeighbor(dir)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

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

/* 卡片同时展示「创建 / 更新」两个时间：只到天，日期后带时分 */
function fmtDateTime(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 16)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(s)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* 创建时间和更新时间是同一天时，更新时间只补时分，避免卡片过长 */
function fmtUpdated(row: any) {
  const c = fmtDate(row?.createtime)
  const u = fmtDateTime(row?.updatetime)
  if (!u) return ''
  if (c && u.startsWith(c)) return u.slice(c.length).trim()
  return u
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
  const key = listKeyOf(
    folderId.value,
    targetPage,
    pageSize.value,
    sortField.value,
    order.value,
    q,
    scope.value
  )

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
    /* 只有响应回来时查询没再变，才算「这份列表就是当前查询的数据」 */
    if (
      key ===
      listKeyOf(
        folderId.value,
        targetPage,
        pageSize.value,
        sortField.value,
        order.value,
        activeQ.value,
        scope.value
      )
    ) {
      loadedListKey = key
    }
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

/* 回到同一份列表时，把点卡片前的滚动位置还原。
   只认「查询也一致」的那次记录：从详情里换了文件夹再回来，就不该弹回旧位置。 */
function restoreListScroll(key: string) {
  const saved = savedListState
  savedListState = null
  if (!saved || saved.key !== key) return
  /* 等列表这一帧真正显示出来再滚，否则会被详情页的矮页面夹成 0 */
  nextTick(() => window.scrollTo(0, saved.y))
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

  const key = listKeyOf(fid, p, s, sort, ord, q, sc)
  if (key === loadedListKey) {
    /* 从详情返回：内存里的列表就是这份查询的数据，直接复用。
       重新请求会先渲染「加载中」的矮提示，页面高度塌一下，滚动条跟着跳。 */
    loading.value = false
    error.value = ''
    restoreListScroll(key)
  } else {
    /* 换了文件夹 / 页码 / 排序 / 关键词：旧位置没有意义，重新拉 */
    savedListState = null
    fetchPage(p)
  }
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
    /* 从列表点进来 / 翻上一篇下一篇，正文都从顶部开始读；
       原列表的滚动位置存在 savedListState 里，回退时再还原。 */
    window.scrollTo({ top: 0 })
    loadDetail(aid.value)
    loadNeighbors()
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
  /* 记下「哪份列表 + 滚到哪」：回退时查询一致就直接复用列表并原地滚回去 */
  savedListState = { key: loadedListKey, y: window.scrollY }
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
        <ThemeToggle class="rd-head__theme" />
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
        <!-- 详情态：只读全文（和随机推荐/公开页/搜索详情同一套 MdArticle）
             用 v-show 而不是 v-if：回列表时列表 DOM 原样还在，
             不会因为重新挂载/重新请求让页面高度抖一下、滚动条跳一下。 -->
        <div v-show="aid" class="rd-detail">
          <nav class="rd-bar">
            <button class="rd-back" @click="backToList">← 返回列表</button>
            <span class="rd-bar__tip">只读阅览 · 与编辑模式同一份内容</span>

            <div class="rd-nav">
              <button
                type="button"
                class="rd-navbtn"
                :disabled="shotLoading || detailLoading || !detail?.content"
                title="按手机宽度生成竖长图（420px 宽）"
                @click="generateImage"
              >
                {{ shotLoading ? '生成中…' : '生成图片' }}
              </button>
              <button
                type="button"
                class="rd-navbtn"
                :disabled="!neighbors.prev"
                :title="
                  neighbors.prev
                    ? `上一篇：${neighbors.prev.title || '无标题'}（← / ↑）`
                    : '已经是第一篇'
                "
                @click="goNeighbor('prev')"
              >
                ← 上一篇
              </button>
              <button
                type="button"
                class="rd-navbtn"
                :disabled="!neighbors.next"
                :title="
                  neighbors.next
                    ? `下一篇：${neighbors.next.title || '无标题'}（→ / ↓）`
                    : '已经是最后一篇'
                "
                @click="goNeighbor('next')"
              >
                下一篇 →
              </button>
            </div>
          </nav>

          <MdArticle
            :title="detail ? detail.title || '无标题' : ''"
            :createtime="detail?.createtime || ''"
            :content="detail?.content || ''"
            :loading="detailLoading"
            :error="detailError"
          />
        </div>

        <!-- 列表态 -->
        <div v-show="!aid" class="rd-list">
          <!-- 搜索栏：范围可选「全站 / 当前文件夹」，回车即搜，不跳转 -->
          <!-- 范围下拉独立成一项（不放进 prepend，避免吃不到宽度溢出到组外） -->
          <div class="rd-searchrow">
            <el-select
              v-model="scope"
              class="rd-scope"
              size="large"
              @change="setScope(scope)"
            >
              <el-option label="全站" value="all" />
              <el-option label="当前文件夹" value="folder" />
            </el-select>

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
                  <span class="rd-card__time" title="创建时间">
                    <span class="rd-card__time-k">创建</span> {{ fmtDateTime(row.createtime) }}
                  </span>
                  <span
                    v-if="row.updatetime"
                    class="rd-card__time rd-card__time--upd"
                    title="更新时间"
                  >
                    <span class="rd-card__time-k">更新</span> {{ fmtUpdated(row) }}
                  </span>
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
        </div>
      </main>
    </div>

    <!-- 生成的长图预览：确认效果后再下载 -->
    <el-dialog
      v-model="shotOpen"
      title="长图已生成"
      width="min(92vw, 540px)"
      append-to-body
      class="rd-shotdlg"
      @closed="releaseShot"
    >
      <div class="rd-shotdlg__view">
        <img :src="shotUrl" alt="文章长图预览" />
      </div>
      <div class="rd-shotdlg__meta">
        手机宽度 420px · 实际尺寸 {{ shotMeta }}
      </div>
      <template #footer>
        <el-button @click="shotOpen = false">关闭</el-button>
        <el-button type="primary" @click="downloadShot">下载图片</el-button>
      </template>
    </el-dialog>
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
  align-items: center;
  gap: 16px;
}

/* 主题开关是药丸按钮，和文字链接对齐要单独给点间距 */
.rd-head__theme {
  margin-left: 4px;
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

/* 详情 / 列表两个分支用 v-show 切换，各自充当原来的 flex 容器，
   间距和直接挂在 .rd-main 下时保持一致 */
.rd-detail,
.rd-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 搜索栏：范围下拉在左，输入框（带搜索按钮）在右，两个独立控件并排 */
.rd-searchrow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rd-search {
  max-width: 560px;
  width: 100%;
  flex: 0 1 auto;
}

/* 范围下拉：宽度够放「当前文件夹」四个字，与输入框同高（size=large = 40px） */
.rd-scope {
  width: 118px;
  flex: 0 0 auto;

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

/* 详情页右侧的上/下篇按钮：和「返回列表」同样的药丸语言，
   但用品牌蓝区分「翻页」和「返回」两种方向 */
.rd-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex: 0 0 auto;
}

.rd-navbtn {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  padding: 6px 14px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 999px;
  color: var(--color-primary-text);
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
  }

  &:disabled {
    cursor: default;
    opacity: 0.38;
  }
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
    flex-wrap: wrap;
    gap: 4px 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  &__dot {
    opacity: 0.6;
  }

  /* 创建 / 更新两个时间：都只到天 + 时分，第二个用更淡的色弱化。
     两个时间都展示，避免「按更新时间排却只看到创建时间」的错位。 */
  &__time {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    opacity: 0.92;

    /* 「创建 / 更新」小标签：比时间值再淡一档，做视觉分组 */
    &-k {
      opacity: 0.62;
    }
  }

  &__time--upd {
    opacity: 0.72;
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

/* 详情态收窄到和随机推荐/搜索详情一致的阅读宽度（880px）。
   ⚠️ 必须限定在宽屏：这条规则的 :has() 特异性高于窄屏那条
   「grid-template-columns: minmax(0,1fr)」，不限定就会在手机上
   强行排成 212px + 剩余，把正文挤成一条 130px 宽的竖排。 */
@media (min-width: 861px) {
  .rd-body:has(.rd-main .rd-bar) {
    grid-template-columns: 212px minmax(0, 1fr);
  }
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

/* .reading-page 在浅色下把 --word-color 钉成深色（防止白字压白卡片），
   半透明主题必须翻回白色 —— 否则顶栏品牌名、主题开关、排序小字全是
   「深字压深底」，在手机端的深色底上直接看不见。 */
body[data-theme='semiTransparent'] .reading-page {
  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 62%, transparent);
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

/* 详情态顶部条：半透明主题下它是直接压在壁纸上的（后面没有白纸），
   白字遇到壁纸亮区就读不出来 —— 给它加一层暗色半透底，白字才稳。 */
body[data-theme='semiTransparent'] .rd-bar {
  padding: 8px 14px;
  border-radius: var(--radius-panel, 8px);
  background-color: rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
}

body[data-theme='semiTransparent'] .rd-bar__tip {
  color: rgba(255, 255, 255, 0.78);
}

/* 暗底上用亮蓝，和文件夹选中态、返回按钮保持同一套半透明白底 */
body[data-theme='semiTransparent'] .rd-navbtn {
  color: #8ab6f0;
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(138, 182, 240, 0.5);

  &:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.18);
    border-color: rgba(138, 182, 240, 0.75);
  }
}

/* ===== 手机端（≤860px）=====
   窄屏不再「左栏 + 右栏」并排，改成上下：文件夹收成一行可横滑的胶囊，
   文章列表/正文拿满宽度；详情态直接把文件夹栏收起（已经选过了，白占地方）。 */
@media (max-width: 860px) {
  .reading-page {
    width: 100%;
    /* 默认是 content-box，width:100% 再加左右 padding 会顶出 24px 横向滚动 */
    box-sizing: border-box;
    margin: 0;
    padding: 12px 12px 44px;
    gap: 14px;
  }

  /* 顶栏：品牌不许折行，导航整条换到第二行、横向可滑 */
  .rd-head {
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding-bottom: 10px;
  }

  .rd-brand {
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: 8px;

    &__name {
      font-size: 18px;
      white-space: nowrap;
    }

    /* 「阅览模式」这个副标题在手机上只挤位置 */
    &__sub {
      display: none;
    }
  }

  .rd-head__nav {
    width: 100%;
    gap: 14px;
    overflow-x: auto;
    padding-bottom: 2px;
    -webkit-overflow-scrolling: touch;

    > * {
      flex: 0 0 auto;
    }
  }

  .rd-head__theme {
    margin-left: 0;
  }

  .rd-side {
    position: static;
    gap: 6px;

    &__head {
      display: none;
    }
  }

  /* 文件夹卡片 → 横滑胶囊，只占一行，不再吃掉整个首屏 */
  .rd-folders {
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    -webkit-overflow-scrolling: touch;
  }

  .rd-folder {
    flex: 0 0 auto;
    padding: 8px 13px;
    font-size: 13px;
    border-radius: 999px;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.05);

    &__name {
      max-width: 42vw;
    }
  }

  .reading-page--detail .rd-side {
    display: none;
  }

  .rd-main {
    gap: 12px;
  }

  .rd-detail,
  .rd-list {
    gap: 12px;
  }

  .rd-searchrow {
    gap: 8px;
  }

  /* 输入框在 flex 行里 width:100% 会让整行超出容器（min-width:auto 挡着不肯缩），
     手机端改成「吃掉剩余宽度」并允许收缩。 */
  .rd-search {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }

  .rd-scope {
    width: 96px;
  }

  .rd-tools {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .rd-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .rd-card {
    padding: 16px;
    gap: 8px;

    &__title {
      font-size: 16px;
    }

    &__excerpt {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
  }

  .rd-bar {
    flex-wrap: wrap;
    gap: 8px;
  }

  .rd-nav {
    margin-left: auto;
  }

  .rd-navbtn {
    font-size: 13px;
    padding: 5px 12px;
  }

  .rd-bar__tip {
    font-size: 12px;
  }

  /* 分页：手机上放不下「每页条数 + 跳页」，只留总数/页码/上下页 */
  .rd-pager {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    gap: 4px;

    :deep(.el-pagination__sizes),
    :deep(.el-pagination__jump) {
      display: none;
    }

    :deep(.el-pager li) {
      min-width: 26px;
      height: 26px;
      line-height: 26px;
      font-size: 12.5px;
    }
  }
}
</style>

<style lang="scss">
/* ===== 生成手机长图 =====
   离屏长图节点和预览弹窗都挂在 body 下（scoped 作用域选不到），只能写全局。
   导读：宿主 .rd-shot 移出屏幕，但真正被截的是里面的 .rd-shot__sheet；
   宽度钉死 420px（2 倍导出 = 840px 宽），排版按手机阅读习惯重排，
   不跟随页面当前主题 —— 半透明主题的「暗底白字」截成图片在手机上很难读。 */
.rd-shot {
  position: fixed;
  top: 0;
  left: -100000px;
  z-index: -1;
  pointer-events: none;
  --word-color: #1f1f1f;
  color: #1f1f1f;
  background-color: #fff;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', sans-serif;
}

.rd-shot__sheet {
  box-sizing: border-box;
  width: 100%;
  padding: 30px 26px 24px;
  background-color: #fff;
}

.rd-shot__title {
  margin: 0;
  font-size: 23px;
  line-height: 1.45;
  font-weight: 700;
  color: #1f1f1f;
  word-break: break-word;
}

.rd-shot__meta {
  margin-top: 10px;
  font-size: 12.5px;
  color: rgba(31, 31, 31, 0.55);
}

.rd-shot__hr {
  height: 1px;
  margin: 18px 0 20px;
  background-color: rgba(0, 0, 0, 0.08);
}

/* 正文沿用 Vditor 渲染结果的 .vditor-reset 排版，这里只补「窄屏长图」需要的约束 */
.rd-shot__body {
  font-size: 16px;
  line-height: 1.85;
  color: #1f1f1f;
  word-break: break-word;

  img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }

  /* 长图里表格不能横向滚动：压进宽度，单元格自己折行 */
  table {
    width: 100%;
    table-layout: fixed;
    font-size: 14px;

    th,
    td {
      word-break: break-word;
    }
  }

  /* 代码块同理：长行折行显示，截出来的图才完整 */
  pre {
    padding: 12px 14px;
    border-radius: 6px;
    background-color: #f6f8fa;
    overflow: visible;
    white-space: pre-wrap;
    word-break: break-word;

    > code {
      padding: 0;
      background: none;
      font-size: 13.5px;
      line-height: 1.7;
      white-space: inherit;
    }
  }

  /* 行内代码给一点底色，和正文区分开 */
  :not(pre) > code {
    padding: 1px 5px;
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.05);
    font-size: 14px;
  }

  blockquote {
    margin: 0 0 16px;
    padding: 8px 12px;
    border-left: 3px solid #d9d9de;
    background-color: #f7f7f8;
    color: #4a4a4a;
  }

  a {
    color: #2f6fd0;
  }
}

.rd-shot__foot {
  margin-top: 26px;
  padding-top: 14px;
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
  font-size: 12px;
  text-align: center;
  color: rgba(31, 31, 31, 0.42);
}

/* 预览弹窗：长图缩进弹窗里看整体比例，点「下载图片」拿原图 */
.rd-shotdlg {
  .el-dialog__body {
    padding-top: 10px;
  }
}

.rd-shotdlg__view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  max-height: 60vh;
  padding: 10px;
  overflow: auto;
  border-radius: 8px;
  background-color: #f4f4f6;

  img {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }
}

.rd-shotdlg__meta {
  margin-top: 10px;
  font-size: 12.5px;
  color: #8a8a91;
}
</style>
