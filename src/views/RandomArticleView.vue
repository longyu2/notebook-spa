<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import MdArticle from '@/components/pc/MdArticle.vue'
import ThemeToggle from '@/components/pc/ThemeToggle.vue'
import { initTheme } from '@/assets/js/theme'

const server_url = localStorage.getItem('server_url')

/* ===== 主题 =====
   本页是独立路由，data-theme 得自己挂，否则半透明主题下背景壁纸不会铺开
   （body[data-theme='semiTransparent'] 里那条规则）。主题开关在顶栏。 */
initTheme()

const loading = ref(true)
const error = ref('')
const title = ref('')
const createtime = ref('')
const rawContent = ref('')
const total = ref(0)
const shown = ref(0)

/* ===== 公开标记 =====
   存库字段 Notebooklist.is_public（迁移 V004）。
   和 AI 生成标记一样单独走 PUT /article/public —— 那条路只要 id，
   不用把 title/content 整篇提交回来。 */
const isPublic = ref(false)
const pubFlagSaving = ref(false)

async function setPublic(on: boolean) {
  if (isPublic.value === on) return

  const prev = isPublic.value
  isPublic.value = on // 乐观更新
  pubFlagSaving.value = true
  try {
    await axios.put(`${server_url}/article/public`, {
      Notebookid: currentId,
      is_public: on ? 1 : 0
    })
    ElMessage({
      showClose: true,
      message: on ? '已设为公开，可在「公开页」看到' : '已取消公开',
      type: 'success'
    })
  } catch {
    isPublic.value = prev
    ElMessage({ showClose: true, message: '公开标记同步失败，请重试', type: 'error' })
  } finally {
    pubFlagSaving.value = false
  }
}

const togglePublic = () => setPublic(!isPublic.value)

/* ===== 随机且不重复 =====
   用 localStorage 记住「已经看过的下标」，一轮看完自动重开。 */
let list: any[] = []
let seen: number[] = []
let currentId: number | null = null

try {
  const saved = JSON.parse(localStorage.getItem('randomArr') || '[]')
  if (Array.isArray(saved)) seen = saved.filter((n: unknown) => typeof n === 'number')
} catch {
  seen = []
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
      currentId = null
      error.value = '这篇取不到了，再试一次'
      return
    }

    currentId = row.Notebookid
    title.value = row.title || '无标题'
    createtime.value = row.createtime || ''
    rawContent.value = row.content || ''
    // MySQL 的 tinyint(1) 经 axios 回来是 0 / 1，也可能是 null（老数据）
    isPublic.value = !!row.is_public
    shown.value = seen.length

    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e: any) {
    title.value = ''
    currentId = null
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

      <div class="random-actions">
        <ThemeToggle class="random-theme" />

        <el-button
          v-if="title"
          class="random-public"
          :class="{ 'random-public--on': isPublic }"
          :loading="pubFlagSaving"
          @click="togglePublic"
        >
          {{ isPublic ? '已公开' : '设为公开' }}
        </el-button>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          :disabled="total === 0"
          @click="showRandom"
        >
          {{ title ? '换一篇' : '随机推荐' }}
        </el-button>
      </div>
    </nav>

    <MdArticle
      :title="title"
      :createtime="createtime"
      :content="rawContent"
      :loading="loading"
      :error="error"
      empty-text="还没有可推荐的文章"
    />
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

    /* 工具栏文字用，卡片内部由 MdArticle 自己钉白纸黑字 */
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

  &-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &-stat {
    font-size: 14px;
    color: var(--muted);

    b {
      color: var(--word-color);
      font-weight: 600;
    }
  }
}

/* 「设为公开」开关：默认中性，公开后走蓝色系（和顶栏 AI 药丸一致） */
.random-public {
  --el-button-bg-color: transparent;
  --el-button-border-color: rgba(0, 0, 0, 0.18);
  --el-button-text-color: rgba(31, 31, 31, 0.82);
  --el-button-hover-bg-color: rgba(0, 0, 0, 0.04);
  --el-button-hover-border-color: rgba(0, 0, 0, 0.32);
  --el-button-hover-text-color: #1f1f1f;
}

.random-public--on {
  --el-button-bg-color: color-mix(in srgb, var(--color-primary) 14%, transparent);
  --el-button-border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
  --el-button-text-color: var(--color-primary-text);
  --el-button-hover-bg-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
  --el-button-hover-border-color: color-mix(in srgb, var(--color-primary) 60%, transparent);
  --el-button-hover-text-color: var(--color-primary-text);
}

/* 半透明主题：容器在浅色下把 --word-color 钉成深色，这里要翻回白色，
   否则「已看 N / M」和主题开关是深字压深底（手机深色底上看不见）。 */
body[data-theme='semiTransparent'] .random-box {
  --word-color: #fff;
  --muted: color-mix(in srgb, #fff 62%, transparent);
}

/* 「设为公开」按钮在浅色下是深字描边，暗底上要换成白色描边 */
body[data-theme='semiTransparent'] .random-public {
  --el-button-border-color: rgba(255, 255, 255, 0.24);
  --el-button-text-color: rgba(255, 255, 255, 0.86);
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.1);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.42);
  --el-button-hover-text-color: #fff;
}

/* ===== 手机端（≤860px）=====
   工具栏一行放不下（已看 N/M + 主题 + 设为公开 + 换一篇），
   改成「统计占一行，按钮组换到下一行并平分宽度」。 */
@media (max-width: 860px) {
  .random-box {
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 12px 12px 40px;
    gap: 12px;
  }

  .random-bar {
    flex-wrap: wrap;
    gap: 10px;
    min-height: 0;
  }

  .random-stat {
    font-size: 13px;
    /* 「已看 1 / 16」不许折成两行 */
    white-space: nowrap;
    flex: 1 1 auto;
  }

  .random-actions {
    width: 100%;
    gap: 8px;

    /* 主题开关保持自身宽度，两个按钮平分剩下的空间 */
    > * {
      flex: 1 1 0;
      min-width: 0;
    }

    .random-theme {
      flex: 0 0 auto;
    }
  }

  .random-public,
  .random-actions :deep(.el-button) {
    margin-left: 0;
  }
}
</style>
