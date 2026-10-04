<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Promotion, Delete, CopyDocument, Refresh, Document, Setting } from '@element-plus/icons-vue'
import { server_url } from '@/assets/constants/server_url'
import { parseSSEChunk, flushSSE, type ToolCallAcc } from '@/assets/js/aiStream'

/**
 * 服务端地址。
 *
 * 每次请求现读 localStorage，不能直接用 import 进来的 server_url ——
 * server_url.ts 顶层带副作用，只在首次 import 时求值一次，而 LoginView 就 import 了它，
 * 所以那个常量在用户点登录页的服务器下拉框之前就已经冻住了。
 * 登录成功走的是 router.push（SPA 跳转，不刷新页面），常量不会重算，
 * 结果就是：登录页切到「本地」后，其他组件都对，只有这里还打向旧地址。
 * 项目里其余 15 处也都是直接读 localStorage 的，这里保持一致。
 */
function apiBase(): string {
  return localStorage.getItem('server_url') || server_url
}

/**
 * AI 写作助手面板
 *
 * 形态上是「动作 + 对话」二合一：
 *   - 预设动作（润色/扩写/精简/改错别字）→ 直接读编辑器内容改写，结果可一键回写
 *   - 自由提问 → 带着编辑器正文当上下文回答，不用切到别的应用
 *
 * 它自己不碰编辑器：正文通过 getContext() 拿，回写通过 emit('apply') 交给父组件。
 * 这样编辑器内部（vditor 实例、保存逻辑）都封装在 ArticleContent.vue 里。
 */

const props = defineProps<{
  /** 由父组件提供，返回当前编辑器的标题/正文/选中文本 */
  getContext: () => { title: string; content: string; selection: string }
}>()

const emit = defineEmits<{
  /** mode: replaceAll（替换全文）| replaceSelection（替换选区）| insert（插入光标处） */
  (e: 'apply', payload: { text: string; mode: 'replaceAll' | 'replaceSelection' | 'insert' }): void
}>()

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 这条是「改写类动作」的结果，可以回写编辑器 */
  canApply?: boolean
  /** 正在流式接收 */
  streaming?: boolean
  error?: boolean
  /** 这条已经把动作直接落到编辑器上了（不需要再点回写按钮） */
  action?: boolean
  /** 模型正在思考（thinking 模式会先吐 reasoning_content，正文还没开始） */
  thinking?: boolean
}

const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const configured = ref<boolean | null>(null)
const modelName = ref('')
const listEl = ref<HTMLElement | null>(null)
let abortCtrl: AbortController | null = null

/* ---- 设置面板（key 存服务端，不落浏览器） ---- */
const showSettings = ref(false)
const keyDraft = ref('')
const keyMasked = ref('')
const saving = ref(false)
const testing = ref(false)

/* ---- 深度思考开关（对应 DeepSeek 的 thinking.type） ---- */
// 默认开：DeepSeek 服务端默认就是思考模式，保持默认不改变既有行为。
// 关掉能明显变快，适合「润色一句话」这种不需要深思的活儿。
const thinkingOn = ref(localStorage.getItem('ai_thinking') !== '0')

function toggleThinking() {
  thinkingOn.value = !thinkingOn.value
  localStorage.setItem('ai_thinking', thinkingOn.value ? '1' : '0')
}

/**
 * 正文作为上下文时的上限。
 *
 * 全量写入方案下这个值很关键：模型必须看到完整文档，才能给出「完整的最终稿」。
 * 给太少 → 它看不到的部分会被写丢；给太多 → 输入 token 涨得快。
 * 30000 字符（中文约 2 万 token）能覆盖绝大多数文章，配合后端 32K 的 max_tokens，
 * 输入输出加起来仍远在模型上下文之内。
 */
const MAX_CONTEXT = 30000

const QUICK_ACTIONS: { key: string; label: string; prompt: string }[] = [
  {
    key: 'polish',
    label: '润色',
    prompt: '请润色下面的文字，让它更通顺、自然、有表达力，保持原意和原有的 Markdown 结构。'
  },
  {
    key: 'expand',
    label: '扩写',
    prompt: '请把下面的文字扩写得更充实，补充细节和过渡，保持原意和原有的 Markdown 结构。'
  },
  {
    key: 'shorten',
    label: '精简',
    prompt: '请把下面的文字精简，去掉冗余表达，保留核心信息，保持原有的 Markdown 结构。'
  },
  {
    key: 'proofread',
    label: '改错别字',
    prompt:
      '请只修正下面文字里的错别字、标点误用和明显语病，其余内容和格式保持完全不变。'
  }
]

const OUTPUT_RULE =
  '只输出处理后的正文本身，不要任何解释、说明或前言，也不要用代码块包裹。保持 Markdown 格式。'

/**
 * 数学公式规则。
 *
 * 编辑器是 Vditor，默认就用 KaTeX 渲染 LaTeX（已实测：ir 模式下 $...$ 和 $$...$$
 * 都能正确渲染成 .katex / .katex-display，无需额外配置）。
 * 所以这里唯一要做的是「让模型知道可以写 LaTeX」—— 不写清楚它就会退化成
 * x^2、根号x、alpha 这类纯文本近似，插回编辑器后只是一堆乱码字符。
 */
const MATH_RULE = [
  '本文档是 Markdown，编辑器支持 LaTeX 数学公式（KaTeX 渲染）。',
  '凡是数学内容——公式、上下标、分数、根号、积分、求和、矩阵、希腊字母等——一律用 LaTeX 写，不要用纯文本近似：',
  '  行内公式用单个美元符号，例如 $E = mc^2$、$\\frac{a}{b}$、$\\alpha + \\beta$；',
  '  独立成行的公式用双美元符号，例如 $$\\int_{0}^{1} x^{2}\\,dx = \\frac{1}{3}$$。',
  '公式不要用反引号或代码块包裹，否则不会被渲染成公式。',
  '改写时，文中已有的 LaTeX 公式必须原样保留：不要转义反斜杠、不要增删 $ 符号、不要改动公式内容。'
].join('\n')

/**
 * 唯一的工具：整篇写入。
 *
 * 为什么只留一个、而且是「全量」而不是「插入到第 N 段」：
 * 局部插入最怕的是位置算错 —— 模型得自己数段落、前端得自己拼字符串，
 * 任何一边出岔子都会把文档改坏。让模型始终交出「完整的最终稿」，前端整篇覆写，
 * 就没有「局部拼接」这一类问题；模型也不用数段落序号，
 * 用户说「插到第三段后面」，它只要把插好之后的全文给出来就行。
 *
 * 安全底线：前端用 setValue(text, false) 写入，撤销栈保留，改坏了 Ctrl+Z 能回去。
 */
const WRITE_TOOL = {
  type: 'function',
  function: {
    name: 'write_document',
    description:
      '把改动后的完整文档写回编辑器。凡是需要改动文档的请求（润色、改写、扩写、精简、纠错、插入段落、调整结构等）都必须调用它。',
    parameters: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description:
            '改动后的完整 Markdown 文档全文。必须包含全部原有内容（包括用户没要求改动的部分），不能是片段、差异或摘要。'
        }
      },
      required: ['markdown']
    }
  }
}

const WRITE_RULE = [
  '【最重要】当用户要求你改动文档时，必须调用 write_document 工具，把改动后的完整文档传进去。',
  '不要只在回复里贴正文 —— 那样用户还得自己复制粘贴。',
  'write_document 的 markdown 参数必须是完整的最终稿：所有原有内容都要在，不能只给改动的那一段。',
  '如果你只是在回答问题、解释概念或给建议（用户没有让你改文档），就直接用文字回复，不要调用工具。'
].join('\n')

const systemPrompt = computed(() => {
  const ctx = props.getContext()
  const content = ctx.content || ''
  const doc = content.slice(0, MAX_CONTEXT)
  const truncated = content.length > MAX_CONTEXT
  return [
    '你是一个中文写作助手，帮助用户润色、改写和答疑。',
    MATH_RULE,
    // 文档超长时模型看不到全文，此时禁止整篇覆写，否则后半篇会被写丢
    truncated
      ? '注意：这篇文章太长，你只看到了开头部分。此时不要调用 write_document 覆写全文，' +
        '否则会把你看不到的内容弄丢；请改用文字回复，说明情况并让用户自己决定。'
      : WRITE_RULE,
    '用户当前正在编辑的文章如下（供你理解上下文）：',
    '<文章标题>' + (ctx.title || '（无标题）') + '</文章标题>',
    '<文章正文>',
    doc + (truncated ? '\n……（正文过长，以上仅为开头部分）' : ''),
    '</文章正文>',
    '当用户要求你改写时，' + OUTPUT_RULE
  ].join('\n')
})

/** 文档没超长时才允许整篇覆写 */
const canFullRewrite = computed(() => {
  const ctx = props.getContext()
  return (ctx.content || '').length <= MAX_CONTEXT
})


/** 模型偶尔还是会用 ``` 包裹，兜一层防御 */
function stripFence(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return m ? m[1].trim() : t
}

async function scrollToBottom() {
  await nextTick()
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 核心：把 messages 发给后端转发，流式接收 */
async function send(history: ChatMessage[], target: ChatMessage) {
  loading.value = true
  abortCtrl = new AbortController()
  try {
    const res = await fetch(`${apiBase()}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // token 在后端签发时就带了 "Bearer " 前缀，直接用
        Authorization: localStorage.getItem('token') || ''
      },
      body: JSON.stringify({
        stream: true,
        thinking: thinkingOn.value,
        // 文档太长时不给工具，模型只能文字回复，避免它拿半篇文档去「覆写全文」
        ...(canFullRewrite.value ? { tools: [WRITE_TOOL] } : {}),
        messages: [
          { role: 'system', content: systemPrompt.value },
          ...history.map((m) => ({ role: m.role, content: m.content }))
        ]
      }),
      signal: abortCtrl.signal
    })

    if (!res.ok) {
      let msg = `请求失败（HTTP ${res.status}）`
      try {
        const j = await res.json()
        if (j?.message) msg = j.message
      } catch {
        /* 忽略解析失败 */
      }
      target.content = msg
      target.error = true
      target.streaming = false
      ElMessage.error(msg)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const buf = { v: '' }
    const toolAcc = new Map<number, ToolCallAcc>()

    const handlers = {
      onText: (t: string) => {
        target.thinking = false
        target.content += t
      },
      onThinking: () => {
        // thinking 模式下正文还没开始，不给反馈用户会以为卡住了
        if (!target.thinking) {
          target.thinking = true
          scrollToBottom()
        }
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parseSSEChunk(decoder.decode(value, { stream: true }), buf, handlers, toolAcc)
      await scrollToBottom()
    }
    // 冲掉缓冲区里最后那行（SSE 最后一条不一定以换行结尾）
    flushSSE(buf, handlers, toolAcc)
    target.thinking = false

    target.content = stripFence(target.content)

    // 模型请求了动作 → 直接落到编辑器上，不需要用户再点按钮
    if (toolAcc.size) {
      runWriteTool([...toolAcc.values()], target)
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (!target.content) target.content = '（已停止）'
    } else {
      target.content = `出错了：${err?.message || err}`
      target.error = true
    }
  } finally {
    target.streaming = false
    loading.value = false
    abortCtrl = null
    await scrollToBottom()
  }
}

/**
 * 执行模型请求的写入动作。
 *
 * 目前只有 write_document 一个工具，语义是「整篇覆写」。
 * 参数是模型生成的 JSON，官方文档明确说了不保证合法、也可能臆造参数，
 * 所以这里必须校验后再用，不能直接信。
 */
function runWriteTool(calls: ToolCallAcc[], target: ChatMessage) {
  const notes: string[] = []
  const before = (props.getContext().content || '').length
  let applied = false

  for (const c of calls) {
    if (c.name !== 'write_document') {
      notes.push(`✗ 不认识的操作：${c.name}`)
      continue
    }

    let md = ''
    try {
      const args = JSON.parse(c.args || '{}')
      md = typeof args.markdown === 'string' ? args.markdown : ''
    } catch {
      notes.push('✗ 参数不是合法 JSON，已跳过')
      continue
    }

    if (!md.trim()) {
      notes.push('✗ 返回的文档是空的，已跳过')
      continue
    }

    // 双保险：即使提示词没拦住，也不拿被截断的上下文去覆写全文
    if (!canFullRewrite.value) {
      notes.push('✗ 文档超出长度上限，不能整篇覆写')
      continue
    }

    const after = md.length
    const pct = before > 0 ? Math.round((after / before) * 100) : 100

    // === 缩水检查 ===
    // 全量写入最危险的失败模式不是报错，而是「模型漏掉了一整段，还自信地说已完成」。
    // 用户要几十分钟后才发现，那时候 Ctrl+Z 早就没用了。所以缩得太狠就拦下来。
    if (before >= 200 && after < before * 0.3) {
      notes.push(
        `⚠ 没有写回：新稿只有原稿的 ${pct}%（${before} → ${after} 字），很可能漏了内容。` +
          `内容已在上方，确认没问题再点「替换全文」。`
      )
      continue
    }

    emit('apply', { text: md, mode: 'replaceAll' })
    applied = true

    if (before >= 200 && after < before * 0.6) {
      notes.push(
        `✓ 已写回全文，但只有原稿的 ${pct}%（${before} → ${after} 字），请核对；不对就 Ctrl+Z`
      )
    } else {
      notes.push(`✓ 已写回全文（${before} → ${after} 字，Ctrl+Z 可撤销）`)
    }
  }

  const head = target.content.trim()
  target.content = (head ? head + '\n\n' : '') + notes.join('\n')
  target.action = true
  // 已经落到编辑器上的就不给回写按钮了，免得重复写；被拦下的则给，让用户能手动放行
  target.canApply = !applied
}

/**
 * push 一条消息，并把「数组里的那个响应式代理」还给你。
 *
 * 为什么不能直接用上面 new 出来的那个裸对象：
 *   messages 是 ref([])，push 进去的裸对象会被原样存下来（Vue 写入时不做深转换），
 *   模板里 v-for 读到它时才会包成代理。所以后面 `target.content += chunk`
 *   改的是裸对象 —— 数据确实变了，但没有任何 trigger，视图不刷新。
 *   表现就是：流式输出期间气泡一直空着、光标一直转，直到 finally 里
 *   `loading.value = false`（这是个真 ref）才连带把当前内容一次性刷出来，
 *   看着像「卡了很久然后突然整段出现」。
 * 从数组里读一次拿到的才是代理，改它才会触发更新。
 */
function pushMessage(raw: ChatMessage): ChatMessage {
  messages.value.push(raw)
  return messages.value[messages.value.length - 1]
}

/** 预设动作：优先处理选中文本，没选中就处理全文 */
async function runAction(action: (typeof QUICK_ACTIONS)[number]) {
  if (loading.value) return
  const ctx = props.getContext()
  const target = ctx.selection && ctx.selection.trim() ? ctx.selection : ctx.content
  if (!target || !target.trim()) {
    ElMessage.warning('编辑器里还没有内容')
    return
  }

  const scope = ctx.selection && ctx.selection.trim() ? '选中的内容' : '全文'
  const userMsg: ChatMessage = {
    role: 'user',
    content: `【${action.label}·${scope}】\n\n${target}`
  }
  const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true, canApply: true }
  pushMessage(userMsg)
  const liveAi = pushMessage(aiMsg)
  await scrollToBottom()
  await send([userMsg], liveAi)
}

/** 自由提问 */
async function ask() {
  const q = input.value.trim()
  if (!q || loading.value) return
  const userMsg: ChatMessage = { role: 'user', content: q }
  const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true, canApply: true }
  pushMessage(userMsg)
  const liveAi = pushMessage(aiMsg)
  input.value = ''
  await scrollToBottom()
  await send([userMsg], aiMsg)
}

function stop() {
  abortCtrl?.abort()
}

function clearAll() {
  messages.value = []
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

function apply(text: string, mode: 'replaceAll' | 'replaceSelection' | 'insert') {
  const ctx = props.getContext()
  if (mode === 'replaceSelection' && !(ctx.selection && ctx.selection.trim())) {
    ElMessage.warning('当前没有选中文本')
    return
  }
  emit('apply', { text, mode })
  ElMessage.success(mode === 'replaceAll' ? '已替换全文' : mode === 'insert' ? '已插入' : '已替换选区')
}

function onKeydown(e: KeyboardEvent) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    ask()
  }
}

/* ---- 配置相关 ---- */

/** 统一的带鉴权请求头。token 在后端签发时就带了 "Bearer " 前缀，直接用 */
function authHeaders(extra?: Record<string, string>) {
  return {
    Authorization: localStorage.getItem('token') || '',
    ...(extra || {})
  }
}

/** 拉取后端配置状态；没配 key 就自动把设置面板展开，省一次点击 */
async function loadStatus() {
  try {
    const res = await fetch(`${apiBase()}/ai/status`, { headers: authHeaders() })
    const j = await res.json()
    configured.value = Boolean(j?.configured)
    modelName.value = j?.model || ''
    keyMasked.value = j?.apiKeyMasked || ''
    if (configured.value === false) showSettings.value = true
  } catch {
    configured.value = null
  }
}

/** 只校验不保存，方便用户先确认 key 是对的再存 */
async function testKey() {
  const key = keyDraft.value.trim()
  if (!key || testing.value) return
  testing.value = true
  try {
    const res = await fetch(`${apiBase()}/ai/verify`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ apiKey: key })
    })
    const j = await res.json().catch(() => null)
    if (res.ok) {
      ElMessage.success(j?.message || 'Key 有效')
    } else {
      // detail 里是 DeepSeek 的原始报错，比 HTTP 状态码有用得多
      ElMessage.error(j?.detail ? `${j.message}：${j.detail}` : j?.message || `校验失败（HTTP ${res.status}）`)
    }
  } catch (err: any) {
    ElMessage.error(`请求失败：${err?.message || err}`)
  } finally {
    testing.value = false
  }
}

async function saveKey() {
  const key = keyDraft.value.trim()
  if (!key || saving.value) return
  saving.value = true
  try {
    const res = await fetch(`${apiBase()}/ai/config`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ apiKey: key })
    })
    const j = await res.json().catch(() => null)
    if (!res.ok) {
      ElMessage.error(j?.message || `保存失败（HTTP ${res.status}）`)
      return
    }
    keyDraft.value = ''
    await loadStatus()
    showSettings.value = false
    ElMessage.success(`已保存（${j?.apiKeyMasked || ''}）`)
  } catch (err: any) {
    ElMessage.error(`请求失败：${err?.message || err}`)
  } finally {
    saving.value = false
  }
}

async function clearKey() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await fetch(`${apiBase()}/ai/config`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ clear: true })
    })
    if (!res.ok) {
      ElMessage.error('清除失败')
      return
    }
    await loadStatus()
    showSettings.value = true
    ElMessage.success('已清除')
  } catch (err: any) {
    ElMessage.error(`请求失败：${err?.message || err}`)
  } finally {
    saving.value = false
  }
}

onMounted(loadStatus)
</script>

<template>
  <div class="ai-card">
    <div class="ai-card__header">
      <el-icon class="ai-card__icon"><Promotion /></el-icon>
      <span class="ai-card__title">AI 助手</span>
      <span class="ai-card__model">{{ modelName }}</span>
      <el-icon
        class="ai-card__gear"
        :class="{ 'ai-card__gear--on': showSettings }"
        title="API Key 设置"
        @click="showSettings = !showSettings"
      >
        <Setting />
      </el-icon>
      <el-icon v-if="messages.length" class="ai-card__clear" title="清空对话" @click="clearAll">
        <Delete />
      </el-icon>
    </div>

    <!-- key 直接在前端填，不用去改 json 再重启后端 -->
    <div v-if="showSettings" class="ai-config">
      <div class="ai-config__label">
        DeepSeek API Key
        <span v-if="keyMasked" class="ai-config__current" :title="`当前 ${keyMasked}`">
          {{ keyMasked }}
        </span>
      </div>
      <input
        v-model="keyDraft"
        class="ai-config__input"
        type="password"
        autocomplete="off"
        spellcheck="false"
        :placeholder="keyMasked ? '输入新 Key 可覆盖' : 'sk-...'"
        @keydown.enter="saveKey"
      />
      <div class="ai-config__hint">只存在服务端，不会写进浏览器。</div>
      <div class="ai-config__btns">
        <button class="ai-op" :disabled="testing || !keyDraft.trim()" @click="testKey">
          {{ testing ? '校验中…' : '测试' }}
        </button>
        <button
          class="ai-op ai-op--primary"
          :disabled="saving || !keyDraft.trim()"
          @click="saveKey"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button
          v-if="configured"
          class="ai-op ai-op--danger"
          :disabled="saving"
          @click="clearKey"
        >
          清除
        </button>
      </div>
    </div>

    <!-- 没配 key 时给出明确指引，而不是让用户对着报错猜 -->
    <div v-if="configured === false && !showSettings" class="ai-card__notice" @click="showSettings = true">
      还没配置 API Key，<u>点这里填写</u>。
    </div>

    <div ref="listEl" class="ai-card__list">
      <p v-if="!messages.length" class="ai-card__empty">
        直接说要什么，它会改好整篇并写回编辑器，比如：<br />
        「把全文润色一遍」<br />
        「在第三段后面加一段总结」<br />
        「把标题改得更吸引人」<br />
        也可以只提问，那种情况它只回答、不动你的稿子。<br />
        <span class="ai-card__empty-key">Enter 发送 / Shift+Enter 换行</span>
      </p>

      <div
        v-for="(m, i) in messages"
        :key="i"
        class="ai-msg"
        :class="m.role === 'user' ? 'ai-msg--user' : 'ai-msg--ai'"
      >
        <div v-if="m.thinking" class="ai-msg__body ai-msg__body--thinking">
          <span class="ai-msg__spinner"></span>思考中
        </div>
        <div
          v-else
          class="ai-msg__body"
          :class="{ 'ai-msg__body--error': m.error, 'ai-msg__body--action': m.action }"
        >{{ m.content }}<span v-if="m.streaming" class="ai-msg__cursor"></span></div>

        <div
          v-if="m.role === 'assistant' && !m.streaming && !m.error && m.content && m.canApply"
          class="ai-msg__ops"
        >
          <button class="ai-op" @click="apply(m.content, 'replaceAll')">
            <el-icon><Document /></el-icon>替换全文
          </button>
          <button class="ai-op" @click="apply(m.content, 'replaceSelection')">替换选区</button>
          <button class="ai-op" @click="apply(m.content, 'insert')">插入</button>
          <button class="ai-op" @click="copy(m.content)">
            <el-icon><CopyDocument /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <div class="ai-card__actions">
      <button
        v-for="a in QUICK_ACTIONS"
        :key="a.key"
        class="ai-chip"
        :disabled="loading"
        @click="runAction(a)"
      >
        {{ a.label }}
      </button>
    </div>

    <div class="ai-card__input">
      <textarea
        v-model="input"
        rows="3"
        placeholder="问点什么，或输入自定义指令…"
        @keydown="onKeydown"
      ></textarea>
      <button v-if="loading" class="ai-send ai-send--stop" title="停止" @click="stop">
        <el-icon><Refresh /></el-icon>
      </button>
      <button v-else class="ai-send" :disabled="!input.trim()" title="发送" @click="ask">
        <el-icon><Promotion /></el-icon>
      </button>
    </div>

    <!-- 深度思考开关：对应 DeepSeek 的 thinking.type。
         放在输入框下方当控制栏用，输入框就不会被顶到面板最底部，
         视线不用一路甩到底才能打字。 -->
    <button
      class="ai-think"
      :class="{ 'ai-think--on': thinkingOn }"
      :title="thinkingOn ? '深度思考已开启：回答更细致，但更慢' : '深度思考已关闭：响应更快'"
      @click="toggleThinking"
    >
      <span class="ai-think__dot"></span>
      深度思考
      <span class="ai-think__state">{{ thinkingOn ? '开' : '关' }}</span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
/* 外观完全复用 .theme-card 那套主题令牌，两套主题下都能自动对上 */
.ai-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: color-mix(in srgb, var(--word-color) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 14%, transparent);
  border-radius: var(--radius-panel);
  padding: 14px 12px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    color: var(--color-primary);
    font-size: 18px;
  }

  &__title {
    color: var(--word-color);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  &__model {
    margin-left: auto;
    font-size: 11px;
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
  }

  &__gear {
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
    cursor: pointer;
    font-size: 14px;
    transition:
      color 0.2s,
      transform 0.3s;

    &:hover,
    &--on {
      color: var(--color-primary);
    }

    &--on {
      transform: rotate(60deg);
    }
  }

  &__clear {
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
    cursor: pointer;
    font-size: 14px;
    transition: color 0.2s;

    &:hover {
      color: var(--color-danger);
    }
  }

  &__notice {
    font-size: 12px;
    line-height: 1.6;
    color: color-mix(in srgb, var(--word-color) 70%, transparent);
    background-color: color-mix(in srgb, var(--color-accent) 14%, transparent);
    border-radius: var(--radius-item);
    padding: 8px 10px;
    cursor: pointer;

    u {
      color: var(--color-primary);
    }
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 2px;
  }

  &__empty {
    font-size: 12px;
    line-height: 1.7;
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
    margin-top: 4px;
  }

  &__empty-key {
    display: inline-block;
    margin-top: 6px;
    color: color-mix(in srgb, var(--word-color) 32%, transparent);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__input {
    display: flex;
    align-items: flex-end;
    gap: 6px;

    textarea {
      flex: 1;
      min-width: 0;
      resize: none;
      /* rows=3 的自然高度（3×18.75 + 14 内边距 + 2 边框 ≈ 72px）。
         写死 min-height 是为了字号或 line-height 以后被改动时，
         输入框不会跟着塌下去 —— 这个高度是按「看得见两句话」定的。 */
      min-height: 72px;
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--word-color);
      background-color: var(--all-backcolor);
      border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);
      border-radius: var(--radius-item);
      padding: 7px 9px;
      outline: none;
      transition: border-color 0.2s;

      &::placeholder {
        color: color-mix(in srgb, var(--word-color) 38%, transparent);
      }

      &:focus {
        border-color: var(--color-primary);
      }
    }
  }
}

.ai-config {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: var(--radius-item);
  background-color: color-mix(in srgb, var(--word-color) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 12%, transparent);

  &__label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    color: var(--word-color);
    white-space: nowrap;
  }

  &__current {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 10.5px;
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
  }

  &__input {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--word-color);
    background-color: var(--all-backcolor);
    border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);
    border-radius: var(--radius-item);
    padding: 6px 8px;
    outline: none;
    transition: border-color 0.2s;

    &::placeholder {
      color: color-mix(in srgb, var(--word-color) 38%, transparent);
    }

    &:focus {
      border-color: var(--color-primary);
    }
  }

  &__hint {
    font-size: 10.5px;
    line-height: 1.5;
    color: color-mix(in srgb, var(--word-color) 45%, transparent);
  }

  &__btns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }
}

.ai-msg {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__body {
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--word-color);
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: var(--radius-item);
    padding: 8px 10px;

    &--error {
      color: var(--color-danger);
    }

    /* 动作回执：左侧加一道主色条，和普通问答明显区分开 */
    &--action {
      border-left: 3px solid var(--color-primary);
      background-color: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }

    /* 模型思考中，正文还没开始 */
    &--thinking {
      color: color-mix(in srgb, var(--word-color) 50%, transparent);
      background-color: transparent;
      padding: 4px 2px;
    }
  }

  &__spinner {
    display: inline-block;
    width: 11px;
    height: 11px;
    margin-right: 6px;
    vertical-align: -1px;
    border: 2px solid color-mix(in srgb, var(--word-color) 18%, transparent);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: ai-spin 0.7s linear infinite;
  }

  &--user &__body {
    background-color: color-mix(in srgb, var(--color-primary) 14%, transparent);
  }

  &--ai &__body {
    background-color: color-mix(in srgb, var(--word-color) 7%, transparent);
  }

  /**
   * 流式输出时句尾的指示点。
   *
   * 原来是 6×13 的方块做 opacity 0/1 硬闪（step-end）。硬闪在长文流式输出时很扎眼，
   * 而且方块看着像文本插入符、容易被误读成"还能在这里打字"。
   * 改成圆点 + 缓动脉冲（scale + opacity），这是 ChatGPT / Claude / Linear 这一档
   * 产品的通用做法，柔和且不抢注意力。
   */
  &__cursor {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 5px;
    border-radius: 50%;
    vertical-align: middle;
    background-color: var(--color-primary);
    animation: ai-pulse 1.1s ease-in-out infinite;
  }

  &__ops {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
}

/** 柔和脉冲：句尾指示点 */
@keyframes ai-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.3;
    transform: scale(0.72);
  }
}

/** 思考中的旋转圈 */
@keyframes ai-spin {
  to {
    transform: rotate(360deg);
  }
}

.ai-chip {
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  color: var(--word-color);
  background-color: color-mix(in srgb, var(--word-color) 8%, transparent);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

/**
 * 深度思考开关。
 * align-self 是必须的：.ai-card 是 column flex，默认 align-items: stretch
 * 会把按钮拉满整行，看着像个大横条。
 */
.ai-think {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1;
  color: color-mix(in srgb, var(--word-color) 55%, transparent);
  background-color: transparent;
  border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background-color 0.2s;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: color-mix(in srgb, var(--word-color) 30%, transparent);
    transition:
      background-color 0.2s,
      box-shadow 0.2s;
  }

  &__state {
    color: color-mix(in srgb, var(--word-color) 38%, transparent);
  }

  &:hover {
    color: var(--word-color);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
  }

  &--on {
    color: var(--color-primary);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);

    .ai-think__dot {
      background-color: var(--color-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
    }

    .ai-think__state {
      color: var(--color-primary);
    }
  }
}

.ai-op {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: inherit;
  font-size: 11.5px;
  line-height: 1;
  color: color-mix(in srgb, var(--word-color) 78%, transparent);
  background-color: transparent;
  border: 1px solid color-mix(in srgb, var(--word-color) 20%, transparent);
  border-radius: var(--radius-item);
  padding: 4px 8px;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background-color 0.2s;

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* 主按钮：保存 */
  &--primary {
    color: #fff;
    background-color: var(--color-primary);
    border-color: var(--color-primary);

    &:hover:not(:disabled) {
      color: #fff;
      background-color: var(--color-primary-hover);
      border-color: var(--color-primary-hover);
    }
  }

  /* 危险按钮：清除 key */
  &--danger {
    color: var(--color-danger);
    border-color: color-mix(in srgb, var(--color-danger) 45%, transparent);

    &:hover:not(:disabled) {
      color: var(--color-danger-hover);
      border-color: var(--color-danger-hover);
      background-color: color-mix(in srgb, var(--color-danger) 12%, transparent);
    }
  }
}

.ai-send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 15px;
  color: #fff;
  background-color: var(--color-primary);
  border: none;
  border-radius: var(--radius-item);
  cursor: pointer;
  transition:
    background-color 0.2s,
    opacity 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--stop {
    background-color: var(--color-danger);

    &:hover {
      background-color: var(--color-danger-hover);
    }
  }
}
</style>
