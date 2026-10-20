<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import MdArticle from '@/components/pc/MdArticle.vue'
import ThemeToggle from '@/components/pc/ThemeToggle.vue'
import { initTheme } from '@/assets/js/theme'

/* ===== 这个页面是给「没登录的人」看的 =====
   所以不能依赖登录后才写入的 localStorage.server_url：
   访客第一次来这里是空的。此时退回同源地址 —— 线上 nginx 把 :9995/v1/
   反代到后端 9994，正好是同源，天然可用。
   本地开发时 server_url 已经在登录时写好了，会走前面那个分支。 */
const server_url = localStorage.getItem('server_url') || `${location.origin}/v1`

const route = useRoute()
const router = useRouter()

/* 独立路由，data-theme 得自己挂，否则半透明主题的壁纸不会铺开。
   主题开关在顶栏，访客也能切。 */
initTheme()

const loggedIn = computed(() => localStorage.getItem('token') != null)

const list = ref<any[]>([])
const listLoading = ref(true)
const listError = ref('')

const detailLoading = ref(false)
const detailError = ref('')
const current = ref<any>(null)

/** 详情页的 id；列表页是 null */
const aid = computed(() => {
  const raw = route.params.aid
  const v = Array.isArray(raw) ? raw[0] : raw
  return v ? String(v) : ''
})

/** 把 Markdown 压成纯文本摘要，卡片上不显示语法符号。
    注意摘要来自后端 `left(content, 300)`，很可能在图片/链接的 URL 中间被截断
    （没有收尾的右括号），所以这两个正则的右括号要写成可选的，
    否则会残留半截 `![](http://...`。 */
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

const excerptOf = (row: any) => {
  const text = toPlainText(row?.excerpt || '')
  return text.length > 140 ? text.slice(0, 140) + '…' : text
}

function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function loadList() {
  listLoading.value = true
  listError.value = ''
  try {
    const res = await axios.get(`${server_url}/pubarticle/list`)
    list.value = res.data?.data ?? []
  } catch (e: any) {
    listError.value = '公开文章加载失败：' + (e?.message || e)
  } finally {
    listLoading.value = false
  }
}

async function loadDetail(id: string) {
  detailLoading.value = true
  detailError.value = ''
  current.value = null
  try {
    const res = await axios.get(`${server_url}/pubarticle/${id}`)
    const row = res.data?.data?.[0]
    if (!row) {
      detailError.value = '这篇文章不存在，或者作者已经取消公开了'
      return
    }
    current.value = row
    document.title = `${row.title || '无标题'} - 公开笔记`
  } catch (e: any) {
    detailError.value = '文章加载失败：' + (e?.message || e)
  } finally {
    detailLoading.value = false
  }
}

function openArticle(row: any) {
  router.push(`/public/${row.Notebookid}`)
}

/** 列表页 / 详情页共用一个路由组件，靠参数变化切换 */
async function sync() {
  if (aid.value) {
    await loadDetail(aid.value)
  } else {
    document.title = '公开笔记'
    current.value = null
    if (list.value.length === 0) await loadList()
  }
}

onMounted(sync)
watch(aid, sync)
</script>

<template>
  <div class="pub-box">
    <header class="pub-head">
      <div class="pub-brand">
        <span class="pub-brand__name">暮观云笔记</span>
        <span class="pub-brand__sub">公开文章</span>
      </div>
      <div class="pub-head__right">
        <router-link v-if="!loggedIn" to="/login" class="pub-head__link">登录</router-link>
        <router-link v-else to="/notebook" class="pub-head__link">回到笔记</router-link>
        <ThemeToggle />
      </div>
    </header>

    <!-- ===== 详情 ===== -->
    <template v-if="aid">
      <nav class="pub-bar">
        <button class="pub-back" @click="router.push('/public')">← 返回列表</button>
      </nav>
      <MdArticle
        :title="current ? current.title || '无标题' : ''"
        :createtime="current?.createtime || ''"
        :content="current?.content || ''"
        :loading="detailLoading"
        :error="detailError"
      />
    </template>

    <!-- ===== 列表 ===== -->
    <template v-else>
      <div v-if="listLoading" class="pub-hint">正在加载公开文章…</div>
      <div v-else-if="listError" class="pub-hint pub-hint--err">{{ listError }}</div>
      <div v-else-if="list.length === 0" class="pub-hint">
        还没有公开的文章。在「随机推荐」页或编辑器顶栏点「设为公开」就会出现在这里。
      </div>

      <div v-else class="pub-grid">
        <article
          v-for="row in list"
          :key="row.Notebookid"
          class="pub-card"
          @click="openArticle(row)"
        >
          <h2 class="pub-card__title">{{ row.title || '无标题' }}</h2>
          <p class="pub-card__excerpt">
            {{ excerptOf(row) || '（这篇还没有正文）' }}
          </p>
          <div class="pub-card__meta">
            <span>{{ fmtDate(row.createtime) }}</span>
            <span v-if="row.length" class="pub-card__dot">·</span>
            <span v-if="row.length">{{ row.length }} 字</span>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.pub {
  &-box {
    width: min(1040px, 92vw);
    margin: 32px auto 72px;
    display: flex;
    flex-direction: column;
    gap: 18px;

    --word-color: #1f1f1f;
    --muted: color-mix(in srgb, var(--word-color) 55%, transparent);
  }

  &-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);

    /* 右侧：登录/回到笔记 + 主题开关并排 */
    &__right {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }

  &-brand {
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

  &-head__link {
    font-size: 14px;
    color: var(--color-primary-text);
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }

  &-bar {
    display: flex;
    align-items: center;
  }

  &-back {
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

  &-hint {
    min-height: 200px;
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

  &-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }

  &-card {
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
}

/* 半透明主题下卡片浮在壁纸上，白底要压得更实一点才看得清 */
body[data-theme='semiTransparent'] .pub-card {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

body[data-theme='semiTransparent'] .pub-head {
  border-bottom-color: rgba(255, 255, 255, 0.18);
}

/* 容器在浅色下把 --word-color 钉成深色，半透明主题要翻回白色，
   否则顶栏品牌名 / 主题开关 / 空状态提示都是深字压深底。 */
body[data-theme='semiTransparent'] .pub-box {
  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 62%, transparent);
}

/* ===== 手机端（≤860px）===== */
@media (max-width: 860px) {
  .pub-box {
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 12px 44px;
    gap: 14px;
  }

  .pub-head {
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding-bottom: 10px;

    &__right {
      width: 100%;
      justify-content: space-between;
      gap: 12px;
    }
  }

  .pub-brand {
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: 8px;

    &__name {
      font-size: 18px;
      white-space: nowrap;
    }

    &__sub {
      display: none;
    }
  }

  .pub-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .pub-card {
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

  .pub-bar {
    flex-wrap: wrap;
    gap: 8px;
  }

  .pub-hint {
    min-height: 120px;
    font-size: 14px;
    padding: 0 8px;
  }
}
</style>
