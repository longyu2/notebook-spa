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
  /**
   * 本条消息的意图。
   *  - chat    ：提问/闲聊，只回答，绝不碰编辑器（不给工具）
   *  - command ：要求改动文档，允许模型调用 write_document 写回
   *  - action  ：点预设动作按钮触发的，也算 command
   */
  intent?: 'chat' | 'command' | 'action'
  /** 这条是「改写类动作」的结果，可以回写编辑器 */
  canApply?: boolean
  /** 正在流式接收 */
  streaming?: boolean
  error?: boolean
  /** 这条已经把动作直接落到编辑器上了（不需要再点回写按钮） */
  action?: boolean
  /** 模型正在思考（thinking 模式会先吐 reasoning_content，正文还没开始） */
  thinking?: boolean
  /** 深度思考过程全文（reasoning_content 累积起来的内容） */
  reasoning?: string
  /** 思考过程面板当前是否展开 */
  reasoningOpen?: boolean
  /**
   * 用户手动开合过思考过程。
   * 一旦为 true，就不再自动收起 —— 否则用户刚点开、正文一开始又被合上，很烦人。
   */
  reasoningPinned?: boolean
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

/* ---- 深度思考档位（对应 DeepSeek 的 thinking.type + reasoning_effort） ----
 *
 * 官方只认三档真实强度：low / high / max，默认 high。
 * （medium / xhigh 只是兼容别名，服务端会映射成 high，所以不暴露成独立档位。）
 * 再加一个「关闭」，共四档。
 *
 * 关闭走 thinking.type = "disabled"，而不是把 reasoning_effort 设成 "none" ——
 * 后者不是合法强度值；而且 disabled 时不能再带 reasoning_effort，两个一起发是非法组合。
 * 这段翻译全在后端做，前端只管传档位字符串。
 */
type ThinkLevel = 'off' | 'low' | 'high' | 'max'

const THINK_LEVELS: { key: ThinkLevel; label: string; hint: string }[] = [
  { key: 'off', label: '关', hint: '不思考，最快' },
  { key: 'low', label: '低', hint: '轻量思考，较快' },
  { key: 'high', label: '标准', hint: '默认档，质量与速度均衡' },
  { key: 'max', label: '最高', hint: '最充分的推理，最慢但最细致' }
]

function initialThinkLevel(): ThinkLevel {
  const saved = localStorage.getItem('ai_thinking_level')
  if (saved && THINK_LEVELS.some((l) => l.key === saved)) return saved as ThinkLevel
  // 兼容上一版的布尔开关：只有明确关过才当 off，其余保持默认 high
  return localStorage.getItem('ai_thinking') === '0' ? 'off' : 'high'
}

const thinkingLevel = ref<ThinkLevel>(initialThinkLevel())

function setThinkLevel(k: ThinkLevel) {
  thinkingLevel.value = k
  localStorage.setItem('ai_thinking_level', k)
}

/** 当前档位的说明文字，给整组控件当 tooltip */
const thinkingHint = computed(
  () => THINK_LEVELS.find((l) => l.key === thinkingLevel.value)?.hint ?? ''
)

/* ---- 流式传输开关 ----
 *
 * 开：后端把 SSE 原样透传，正文边生成边显示（打字机效果）。
 * 关：后端等整段生成完再一次性返回 JSON（stream: false），长文改写时页面不会一直滚，
 *     代价是等待期间看不到任何进度。两条路径前端都要能处理。
 */
const streamOn = ref(localStorage.getItem('ai_stream') !== '0')

function toggleStream() {
  streamOn.value = !streamOn.value
  localStorage.setItem('ai_stream', streamOn.value ? '1' : '0')
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

/* ===== 提问 / 命令 判定 ===== */

/**
 * 命令类关键词：出现这些字样，基本可以断定用户是要改文档。
 * 判断顺序上，「问」优先于「改」—— 因为「帮我把这段改得更好吗？」是征询，
 * 而「怎么改写第三段？」是提问，两者都含「改」字，但都不该直接动稿子。
 */
const CMD_WORDS = [
  '润色', '改写', '修改', '改成', '改为', '改一下', '改得', '改这', '改下',
  '扩写', '精简', '压缩', '缩短', '展开', '补充', '补上', '加上', '加一段', '添加',
  '删掉', '删除', '去掉', '移除', '替换', '换成', '纠错', '错别字', '语病',
  '重写', '续写', '翻译', '排版', '格式化', '整理成', '改成更',
  '插入', '写回', '更新文档'
  /* 注意：「全文」「整篇」这类只是范围限定词，不是动作，绝不能放进命令词表。
     它们和「总结/分析/看一遍」搭配时全是提问（「全文总结一下」「整篇讲了什么」），
     放进来会把这些误判成改写命令。 */
]

/**
 * 提问类关键词：出现这些就问，不做任何写入。
 *
 * 「总结/概括/整理」这几个是双面的：既是动词命令（「帮我总结成一段」），
 * 也是提问名词（「总结一下文章内容」）。这类歧义词一律归到「提问」——
 * 判成提问只是少写一次，用户觉得该改会再说一句；判成命令却可能把稿子改了。
 */
const ASK_WORDS = [
  '什么', '为什么', '为何', '怎么', '如何', '怎样', '是否', '能不能', '可以吗',
  '吗？', '吗?', '呢？', '呢?', '？', '?',
  '解释', '说明一下', '讲讲', '介绍一下', '总结一下', '概括', '分析',
  '区别', '哪个', '哪些', '多少', '几段', '多长', '几个字',
  '建议', '你觉得', '好不好', '行不行',
  '总结', '概述', '讲讲看', '说说'
]

/**
 * 明确的「动手改」前缀：只有这些开头，才认为用户是在下命令。
 * 用来收拾「帮我写个总结」这类：光看「总结」是歧义，但带「帮我写/帮我改」就是命令。
 */
const CMD_PREFIX = /^(帮我|请|麻烦|给我|替我)?\s*(写|写个|写一段|写个总结|改|做|生成|整理出|弄)/

/**
 * 判断这轮对话是「提问」还是「命令」。
 *
 * 保守优先：只要看起来像提问，就按提问处理（不给工具）。
 * 漏判成命令的代价是「模型可能顺手改了稿子」，用户下次就不会放心提问了；
 * 漏判成提问的代价只是「这次没写回，用户再点一下按钮」—— 后者轻得多。
 */
function detectIntent(text: string): 'chat' | 'command' {
  const t = text.trim()
  if (!t) return 'chat'

  const hasCmd = CMD_WORDS.some((w) => t.includes(w))
  const hasAsk = ASK_WORDS.some((w) => t.includes(w))

  // 问号结尾 → 一律当提问，哪怕里面带了「改写」之类的动词
  if (/[?？]\s*$/.test(t)) return 'chat'

  // 「帮我写个总结」这类：疑问词只是内容名词，真正表意的是「帮我写」
  if (CMD_PREFIX.test(t)) return 'command'

  // 有命令词且没歧义词 → 命令
  if (hasCmd && !hasAsk) return 'command'

  // 两者都占：短句更像命令（「润色一下」），长句更像讨论（「这文章要怎么润色」）
  if (hasCmd && hasAsk) return t.length <= 12 ? 'command' : 'chat'

  return 'chat'
}

/** 只有命令类消息才允许写回编辑器 */
function allowsWrite(intent: ChatMessage['intent']): boolean {
  return intent === 'command' || intent === 'action'
}

/**
 * 输入框里当前的文字会被判成什么，实时显示给用户看。
 * 这里用 computed 是安全的：input 是 ref，读它就是在建立响应式依赖。
 */
const inputMode = computed(() => detectIntent(input.value))

/* 这里必须是普通函数，绝不能写成 computed。
   getContext() 读的是 vditor 的实时内容（getValue() 是去读 DOM），那不是响应式数据，
   computed 追踪不到任何依赖 —— 一旦算过一次就永久缓存，用户改了正文它也不知道。
   实测过：编辑器改成「丙」之后，第二次请求发出的 system 提示词和第一次一字不差。
   写成普通函数，每次 send() 时现算，才能做到「编辑器一变，AI 读到的就变」。 */
function buildSystemPrompt(writeAllowed: boolean): string {
  const ctx = props.getContext()
  const content = ctx.content || ''
  const doc = content.slice(0, MAX_CONTEXT)
  const truncated = content.length > MAX_CONTEXT

  /* 三种模式的提示词必须说清楚，不能混：
     ① writeAllowed = true  —— 本轮是改写命令，允许（且要求）调用工具写回；
     ② writeAllowed = false 且文档超长 —— 看不到全文，禁止覆写，怕弄丢后半篇；
     ③ writeAllowed = false 且文档正常 —— 本轮是提问，只回答，一个字都不要动稿子。 */
  let modeRule: string
  if (writeAllowed) {
    modeRule = WRITE_RULE
  } else if (truncated) {
    modeRule =
      '注意：这篇文章太长，你只看到了开头部分。此时不要调用 write_document 覆写全文，' +
      '否则会把你看不到的内容弄丢；请改用文字回复，说明情况并让用户自己决定。'
  } else {
    modeRule = [
      '【本轮是提问，不是改写】用户只是在向你提问或和你讨论，绝对不要改动文档。',
      '直接在对话里回答即可，不要输出整篇正文，也不要调用任何写文档的工具。',
      '如果用户确实想要你改稿，他会明确说「帮我改」「润色一下」这类命令。'
    ].join('\n')
  }

  return [
    '你是一个中文写作助手，帮助用户润色、改写和答疑。',
    MATH_RULE,
    modeRule,
    '用户当前正在编辑的文章如下（供你理解上下文）：',
    '<文章标题>' + (ctx.title || '（无标题）') + '</文章标题>',
    '<文章正文>',
    doc + (truncated ? '\n……（正文过长，以上仅为开头部分）' : ''),
    '</文章正文>',
    // 只有命令模式才需要「只输出正文」这条 —— 提问模式要的恰恰是有解释的回答
    writeAllowed ? '当用户要求你改写时，' + OUTPUT_RULE : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** 文档没超长时才允许整篇覆写（同样必须是普通函数，理由见 buildSystemPrompt） */
function canFullRewrite(): boolean {
  const ctx = props.getContext()
  return (ctx.content || '').length <= MAX_CONTEXT
}


/** 手动开合深度思考过程；标记 pinned 之后就不再被自动收起覆盖 */
function toggleReasoning(m: ChatMessage) {
  m.reasoningOpen = !m.reasoningOpen
  m.reasoningPinned = true
}

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
async function send(history: ChatMessage[], target: ChatMessage, intent?: ChatMessage['intent']) {
  loading.value = true
  abortCtrl = new AbortController()

  /* 两道闸：
     ① 这轮必须是「命令」才考虑写回 —— 提问根本不该碰编辑器；
     ② 文档没超长才允许整篇覆写。
     合起来决定要不要把 write_document 下发给模型。
     不给工具是硬约束：模型看不到这个函数，就不可能误改文档，
     比在提示词里求它「别改」可靠得多。 */
  const writeAllowed = allowsWrite(intent) && canFullRewrite()

  try {
    const res = await fetch(`${apiBase()}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // token 在后端签发时就带了 "Bearer " 前缀，直接用
        Authorization: localStorage.getItem('token') || ''
      },
      body: JSON.stringify({
        stream: streamOn.value,
        thinking: thinkingLevel.value,
        ...(writeAllowed ? { tools: [WRITE_TOOL] } : {}),
        messages: [
          // 每次发送都现从 vditor 取一次正文，绝不复用上一次的
          { role: 'system', content: buildSystemPrompt(writeAllowed) },
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

    /* 非流式路径：后端返回的是 { status, data } 这种一次性 JSON，
       结构跟 SSE 的 delta 完全不同，必须单独处理。
       （tool_calls 在这里是完整对象，不像流式那样按 index 增量拼接。） */
    if (!streamOn.value) {
      const j = await res.json()
      const message = j?.data?.choices?.[0]?.message
      if (!message) {
        target.content = '后端没有返回内容'
        target.error = true
        return
      }
      if (message.reasoning_content) {
        target.reasoning = message.reasoning_content
        target.reasoningOpen = false // 一次性到达，没必要占着位置
      }
      target.content = stripFence(message.content || '')

      const calls = message.tool_calls
      if (Array.isArray(calls) && calls.length) {
        runWriteTool(
          calls.map((c: any) => ({
            id: c.id || '',
            name: c.function?.name || '',
            args: c.function?.arguments || ''
          })),
          target,
          intent
        )
      }
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const buf = { v: '' }
    const toolAcc = new Map<number, ToolCallAcc>()

    const handlers = {
      onText: (t: string) => {
        if (target.thinking) {
          target.thinking = false
          // 正文开始了就把思考过程收起来，把位置让给答案；
          // 但用户自己点开过就不动它，否则刚展开又被合上，很烦
          if (!target.reasoningPinned) target.reasoningOpen = false
        }
        target.content += t
      },
      onReasoning: (t: string) => {
        if (!target.reasoning) {
          target.reasoning = ''
          target.reasoningOpen = true
        }
        target.reasoning += t
        if (!target.thinking) {
          // thinking 模式下正文还没开始，不给反馈用户会以为卡住了
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
      runWriteTool([...toolAcc.values()], target, intent)
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
function runWriteTool(calls: ToolCallAcc[], target: ChatMessage, intent?: ChatMessage['intent']) {
  const notes: string[] = []
  const before = (props.getContext().content || '').length
  let applied = false

  /* 最后一道闸。正常情况下提问轮压根不给工具，模型无从调用；
     但万一后端/模型仍吐了工具调用，这里直接丢弃 —— 宁可少写一次，
     也不能在用户只是提问的时候把稿子改了。 */
  if (!allowsWrite(intent)) {
    target.content =
      target.content.trim() +
      '\n\n（本轮是提问，已忽略模型给出的改写内容，编辑器未改动）'
    target.action = true
    target.canApply = false
    return
  }

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
    if (!canFullRewrite()) {
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
    content: `【${action.label}·${scope}】\n\n${target}`,
    // 点按钮 = 明确的改写命令，允许写回
    intent: 'action'
  }
  const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true, canApply: true }
  pushMessage(userMsg)
  const liveAi = pushMessage(aiMsg)
  await scrollToBottom()
  await send([userMsg], liveAi, userMsg.intent)
}

/**
 * 输入框发送。
 *
 * 这里做「提问 vs 命令」的判定：判断成命令才把 write_document 工具下发给模型，
 * 提问则不给工具 —— 模型看不到工具就不可能误改文档，比靠提示词求它别改可靠得多。
 */
async function ask(text?: string) {
  const q = (text ?? input.value).trim()
  if (!q || loading.value) return
  const userMsg: ChatMessage = { role: 'user', content: q, intent: detectIntent(q) }
  const aiMsg: ChatMessage = { role: 'assistant', content: '', streaming: true, canApply: true }
  pushMessage(userMsg)
  const liveAi = pushMessage(aiMsg)
  input.value = ''
  await scrollToBottom()
  await send([userMsg], liveAi, userMsg.intent)
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
        可以直接下命令，它会改好整篇并写回编辑器：<br />
        「把全文润色一遍」<br />
        「在第三段后面加一段总结」<br />
        <span class="ai-card__empty-sep">也可以只是提问，它只回答、不动你的稿子：</span>
        「这篇文章主要讲了什么」<br />
        「第二段的论证有什么问题」<br />
        <span class="ai-card__empty-key">Enter 发送 / Shift+Enter 换行</span>
      </p>

      <div
        v-for="(m, i) in messages"
        :key="i"
        class="ai-msg"
        :class="m.role === 'user' ? 'ai-msg--user' : 'ai-msg--ai'"
      >
        <!-- 深度思考过程：默认折叠，流式思考时自动展开，正文一开始自动收起 -->
        <div v-if="m.reasoning" class="ai-reason">
          <button class="ai-reason__head" @click="toggleReasoning(m)">
            <span class="ai-reason__caret" :class="{ 'ai-reason__caret--open': m.reasoningOpen }"
              >▶</span
            >
            <span class="ai-reason__title">深度思考过程</span>
            <span v-if="m.thinking" class="ai-reason__live">
              <span class="ai-msg__spinner"></span>思考中
            </span>
            <span v-else class="ai-reason__len">{{ m.reasoning.length }} 字</span>
          </button>
          <div v-show="m.reasoningOpen" class="ai-reason__body">{{ m.reasoning }}</div>
        </div>

        <!-- 还没有思考内容可显示时，给个转圈，别让用户以为卡住 -->
        <div v-if="m.thinking && !m.reasoning" class="ai-msg__body ai-msg__body--thinking">
          <span class="ai-msg__spinner"></span>思考中
        </div>

        <div
          v-if="m.content || !m.reasoning"
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
        :placeholder="
          inputMode === 'command'
            ? '要改哪里？例如「把全文润色一遍」'
            : '提问，或直接说要改什么…'
        "
        @keydown="onKeydown"
      ></textarea>
      <button v-if="loading" class="ai-send ai-send--stop" title="停止" @click="stop">
        <el-icon><Refresh /></el-icon>
      </button>
      <button v-else class="ai-send" :disabled="!input.trim()" title="发送" @click="ask()">
        <el-icon><Promotion /></el-icon>
      </button>
    </div>

    <!-- 底部控制栏：左边实时显示这轮会被判成「提问」还是「改写」，
         右边是深度思考档位和流式传输开关。用户不必猜系统会怎么理解自己的话。 -->
    <div class="ai-card__bar">
      <span
        class="ai-card__mode"
        :class="{ 'ai-card__mode--cmd': inputMode === 'command' }"
        :title="
          inputMode === 'command'
            ? '这条会被当成改写命令，AI 可以改你的稿子'
            : '这条会被当成提问，AI 只回答、不会动你的稿子'
        "
      >
        {{ inputMode === 'command' ? '改写模式' : '提问模式' }}
      </span>

      <div class="ai-think" :title="`深度思考：${thinkingHint}`">
        <span class="ai-think__label">思考</span>
        <div class="ai-think__seg">
          <button
            v-for="lv in THINK_LEVELS"
            :key="lv.key"
            class="ai-think__opt"
            :class="{ 'ai-think__opt--on': thinkingLevel === lv.key }"
            :title="lv.hint"
            @click="setThinkLevel(lv.key)"
          >
            {{ lv.label }}
          </button>
        </div>
      </div>

      <button
        class="ai-stream"
        :class="{ 'ai-stream--on': streamOn }"
        :title="streamOn ? '流式传输已开：边生成边显示' : '流式传输已关：等全部生成完再一次性显示'"
        @click="toggleStream"
      >
        <span class="ai-stream__dot"></span>流式
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 外观完全复用 .theme-card 那套主题令牌，两套主题下都能自动对上 */
.ai-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: color-mix(in srgb, var(--word-color) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 18%, transparent);
  border-radius: var(--radius-panel);
  padding: 16px 14px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__icon {
    color: var(--color-primary-text);
    font-size: 22px;
  }

  &__title {
    color: var(--word-color);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  &__model {
    margin-left: auto;
    font-size: 13px;
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
  }

  &__gear {
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
    cursor: pointer;
    font-size: 17px;
    transition:
      color 0.2s,
      transform 0.3s;

    &:hover,
    &--on {
      color: var(--color-primary-text);
    }

    &--on {
      transform: rotate(60deg);
    }
  }

  &__clear {
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
    cursor: pointer;
    font-size: 17px;
    transition: color 0.2s;

    &:hover {
      color: var(--color-danger);
    }
  }

  &__notice {
    font-size: 14.5px;
    line-height: 1.7;
    color: color-mix(in srgb, var(--word-color) 88%, transparent);
    background-color: color-mix(in srgb, var(--color-accent) 18%, transparent);
    border-radius: var(--radius-item);
    padding: 11px 13px;
    cursor: pointer;

    u {
      color: var(--color-primary-text);
      font-weight: 600;
    }
  }

  &__list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-right: 2px;
  }

  &__empty {
    font-size: 14.5px;
    line-height: 1.85;
    /* 空状态是用户第一眼看到的内容，不能是灰蒙蒙的一片 —— 提到 76% */
    color: color-mix(in srgb, var(--word-color) 76%, transparent);
    margin-top: 4px;
  }

  &__empty-key {
    display: inline-block;
    margin-top: 10px;
    color: color-mix(in srgb, var(--word-color) 56%, transparent);
  }

  /* 「也可以只是提问」这句换个主色，把两段示例分开，扫一眼就懂有两种用法 */
  &__empty-sep {
    display: inline-block;
    margin-top: 8px;
    color: var(--color-primary-text);
    font-weight: 500;
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
      /* rows=3 的自然高度（3×24 + 16 内边距 + 2 边框 ≈ 90px）。
         写死 min-height 是为了字号或 line-height 以后被改动时，
         输入框不会跟着塌下去 —— 这个高度是按「看得见两句话」定的。 */
      min-height: 100px;
      font-family: inherit;
      font-size: 15px;
      line-height: 1.6;
      color: var(--word-color);
      background-color: var(--all-backcolor);
      border: 1px solid color-mix(in srgb, var(--word-color) 24%, transparent);
      border-radius: var(--radius-item);
      padding: 9px 11px;
      outline: none;
      transition: border-color 0.2s;

      &::placeholder {
        color: color-mix(in srgb, var(--word-color) 55%, transparent);
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
  gap: 7px;
  padding: 12px;
  border-radius: var(--radius-item);
  background-color: color-mix(in srgb, var(--word-color) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);

  &__label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 14.5px;
    color: var(--word-color);
    white-space: nowrap;
  }

  &__current {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
  }

  &__input {
    width: 100%;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 15px;
    color: var(--word-color);
    background-color: var(--all-backcolor);
    border: 1px solid color-mix(in srgb, var(--word-color) 24%, transparent);
    border-radius: var(--radius-item);
    padding: 7px 9px;
    outline: none;
    transition: border-color 0.2s;

    &::placeholder {
      color: color-mix(in srgb, var(--word-color) 55%, transparent);
    }

    &:focus {
      border-color: var(--color-primary);
    }
  }

  &__hint {
    font-size: 13px;
    line-height: 1.6;
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
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
    font-size: 15px;
    line-height: 1.8;
    color: var(--word-color);
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: var(--radius-item);
    padding: 11px 13px;

    &--error {
      color: var(--color-danger);
      font-weight: 500;
    }

    /* 动作回执：左侧加一道主色条，和普通问答明显区分开 */
    &--action {
      border-left: 3px solid var(--color-primary);
      background-color: color-mix(in srgb, var(--color-primary) 11%, transparent);
    }

    /* 模型思考中，正文还没开始 */
    &--thinking {
      color: color-mix(in srgb, var(--word-color) 72%, transparent);
      background-color: transparent;
      padding: 4px 2px;
    }
  }

  &__spinner {
    display: inline-block;
    width: 13px;
    height: 13px;
    margin-right: 7px;
    vertical-align: -1px;
    border: 2px solid color-mix(in srgb, var(--word-color) 26%, transparent);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: ai-spin 0.7s linear infinite;
  }

  &--user &__body {
    background-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
  }

  &--ai &__body {
    background-color: color-mix(in srgb, var(--word-color) 10%, transparent);
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

/**
 * 深度思考过程。
 *
 * 这是次要信息，但**不能太淡** —— 用户明确要求「看得清」，所以正文色号
 * 只降到 78%，仍远高于 AA 线。折叠时只占一行，不跟答案抢位置。
 */
.ai-reason {
  border: 1px solid color-mix(in srgb, var(--word-color) 16%, transparent);
  border-radius: var(--radius-item);
  background-color: color-mix(in srgb, var(--word-color) 4%, transparent);
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: color-mix(in srgb, var(--word-color) 72%, transparent);
    background-color: transparent;
    border: none;
    padding: 8px 10px;
    cursor: pointer;
    text-align: left;

    &:hover {
      color: var(--word-color);
      background-color: color-mix(in srgb, var(--word-color) 6%, transparent);
    }
  }

  &__caret {
    flex-shrink: 0;
    font-size: 9px;
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
    transition: transform 0.15s;

    &--open {
      transform: rotate(90deg);
    }
  }

  &__title {
    flex: 1;
  }

  &__live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    color: var(--color-primary-text);
    font-weight: 600;
  }

  &__len {
    flex-shrink: 0;
    font-weight: 400;
    color: color-mix(in srgb, var(--word-color) 56%, transparent);
  }

  &__body {
    /* 思考过程可能很长，限高 + 内部滚动，别把答案顶出屏幕 */
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 10px 10px;
    font-size: 13px;
    line-height: 1.7;
    color: color-mix(in srgb, var(--word-color) 78%, transparent);
    white-space: pre-wrap;
    word-break: break-word;
    border-top: 1px solid color-mix(in srgb, var(--word-color) 12%, transparent);
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
  font-size: 14.5px;
  line-height: 1;
  color: var(--word-color);
  background-color: color-mix(in srgb, var(--word-color) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 14%, transparent);
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;

  &:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
    color: var(--color-primary-text);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/**
 * 底部控制栏：左边是模式提示，右边是深度思考档位。
 * 面板最窄到 280px 时两件东西放不下，所以允许 flex-wrap —— 宁可换行也不挤扁。
 */
.ai-card__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

/* 模式指示：提问=中性灰，改写=主色，颜色本身就是最强的提示 */
.ai-card__mode {
  flex-shrink: 0;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1;
  padding: 7px 12px;
  border-radius: 999px;
  color: color-mix(in srgb, var(--word-color) 72%, transparent);
  background-color: color-mix(in srgb, var(--word-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--word-color) 14%, transparent);

  &--cmd {
    color: var(--color-primary-text);
    font-weight: 600;
    background-color: color-mix(in srgb, var(--color-primary) 16%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
}

/**
 * 深度思考档位：一个标签 + 四档分段控件。
 *
 * 为什么用分段控件而不是「点一下循环切换」：四档循环要从「关」到「最高」按三下，
 * 而且当前在哪一档全靠记；分段控件一次点击直达，且当前档位一直可见。
 * 也不用下拉菜单 —— 那要多一层弹层，为了四个选项不划算。
 */
.ai-think {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  color: color-mix(in srgb, var(--word-color) 62%, transparent);

  &__label {
    font-size: 13px;
    font-weight: 500;
    color: color-mix(in srgb, var(--word-color) 62%, transparent);
    white-space: nowrap;
  }

  &__seg {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--word-color) 24%, transparent);
    background-color: color-mix(in srgb, var(--word-color) 6%, transparent);
  }

  &__opt {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    color: color-mix(in srgb, var(--word-color) 72%, transparent);
    background-color: transparent;
    border: none;
    border-radius: 999px;
    padding: 5px 9px;
    cursor: pointer;
    transition:
      color 0.15s,
      background-color 0.15s;

    &:hover {
      color: var(--word-color);
      background-color: color-mix(in srgb, var(--word-color) 10%, transparent);
    }

    /* 选中态跟模式药丸走同一套：蓝色淡底 + 深蓝字。
       不用「蓝底白字」—— 品牌蓝 #5590e2 压白字只有 2.9:1，过不了 AA。
       这套组合实测 5.18:1。
       注意 --on 必须连 :hover 一起写死：.ai-think__opt:hover 的特异性高于单个类，
       否则鼠标划过去时选中态会被 hover 的灰底盖掉。 */
    &--on,
    &--on:hover {
      color: var(--color-primary-text);
      font-weight: 600;
      background-color: color-mix(in srgb, var(--color-primary) 16%, transparent);
    }
  }
}

/**
 * 流式传输开关。
 * 只有开/关两态，不值得上分段控件，一个带状态点的小胶囊就够。
 * 配色跟模式药丸、档位选中态同一套：蓝色淡底 + 深蓝字（实测 5.4:1）。
 * 同样要把 :hover 一起写死，否则鼠标划过时开启态会被 hover 的灰边盖掉。
 */
.ai-stream {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  color: color-mix(in srgb, var(--word-color) 62%, transparent);
  background-color: transparent;
  border: 1px solid color-mix(in srgb, var(--word-color) 24%, transparent);
  border-radius: 999px;
  padding: 6px 11px;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background-color 0.15s;

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: color-mix(in srgb, var(--word-color) 40%, transparent);
    transition:
      background-color 0.15s,
      box-shadow 0.15s;
  }

  &:hover {
    color: var(--word-color);
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
  }

  &--on,
  &--on:hover {
    color: var(--color-primary-text);
    font-weight: 600;
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    background-color: color-mix(in srgb, var(--color-primary) 14%, transparent);

    .ai-stream__dot {
      background-color: var(--color-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
    }
  }
}

.ai-op {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--word-color) 92%, transparent);
  background-color: transparent;
  border: 1px solid color-mix(in srgb, var(--word-color) 30%, transparent);
  border-radius: var(--radius-item);
  padding: 7px 12px;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background-color 0.2s;

  &:hover {
    color: var(--color-primary-text);
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  &:disabled {
    opacity: 0.5;
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
  width: 36px;
  height: 36px;
  font-size: 17px;
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
