<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import axios from 'axios'
const server_url = localStorage.getItem('server_url')

import { saveArticle } from '@/assets/js/ArticlesTools'
import type { UploadProps, UploadUserFile } from 'element-plus'
import Vditor from 'vditor'
import 'vditor/src/assets/less/index.less'
import { ElMessage } from 'element-plus'
import ArticleContentTool from '@/components/pc/ArticleContentTool.vue'

// 文件上传
const token = localStorage.getItem('token')

const uploadHeaders = { Authorization: token }

const fileList = ref<UploadUserFile[]>([])
let user = JSON.parse(localStorage.getItem('user')!)
let [title, content] = [ref(''), ref('')]
let titleUpdateLock = ref(false)

let titlePlaceholder = ref('请输入标题')

let vditorHeight = Math.floor(window.innerHeight * 0.9)

const vditor = ref<Vditor | null>(null)

/* ===== 编辑器写入队列 =====
   Vditor 的 lute 是异步加载的（内部 addScript(...).then()），
   在 after 回调跑完之前 this.vditor.lute 还是 undefined，
   此时 setValue / getValue / disabled 全都会抛异常。

   而文章只要几毫秒就回来了，lute 却要等两秒多 —— 于是 watch 里的
   setValue(正文) 先抛掉、正文根本没进编辑器，等 after 再跑时再写一个
   initValue('')，编辑器就彻底空了。表现就是「AI 读不到正文」。

   所以统一走下面的入口：编辑器没就绪就先把「该写什么」排进队列，
   after 里再补写。这样文章加载和编辑器初始化谁先谁后都不会丢正文。 */
let editorReady = false
let pendingApply: { md: string; disabled: boolean } | null = null

/** 把正文写进编辑器；编辑器还没就绪就先排队，等 after 里补写。 */
function applyToEditor(md: string, disabled: boolean) {
  if (!editorReady || !vditor.value) {
    pendingApply = { md, disabled }
    return
  }
  pendingApply = null
  if (disabled) vditor.value.disabled()
  else vditor.value.enable()
  vditor.value.setValue(md)
}

// 已保存提示
let savedTip = ref(false)
let tipTimer: ReturnType<typeof setTimeout> | null = null

function showSavedTip() {
  savedTip.value = true
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    savedTip.value = false
  }, 1500)
}

// 用于初始化编辑器的函数，传入参数
const initEditor = async (initValue: string) => {
  vditor.value = new Vditor('vditor', {
    outline: {
      position: 'left',
      enable: true
    },

    height: vditorHeight,
    toolbarConfig: {
      pin: true
    },

    preview: {
      maxWidth: vditorHeight
    },
    cache: {
      enable: true
    },
    after: () => {
      /* 到这里 lute 才真正就绪，setValue 才不会抛异常。
         先标记就绪，再把排队中的正文补写进去 —— 文章很可能早就加载好了，
         只是之前写不进来而已。只有队列为空（文章还没回来）时才写初始值。 */
      editorReady = true
      if (pendingApply) {
        const { md, disabled } = pendingApply
        pendingApply = null
        applyToEditor(md, disabled)
      } else if (initValue) {
        vditor.value?.setValue(initValue)
      }
    },
    input: (md) => {
      content.value = md
      save()
    }
  })
}

// vditor源文件没改，刷新后可以自动回默认样式，透明样式在js代码里面改
const setTheme = (theme: string) => {
  const el = document.body.querySelector('.vditor') as HTMLElement
  // 把当前主题标记到 body 上，供 css 里区分选中态等主题相关的样式
  document.body.setAttribute('data-theme', theme)
  if (theme === 'semiTransparent') {
    document.body.style.setProperty('--word-color', 'white')
    document.body.style.setProperty('--all-backcolor', 'rgba(0, 0, 0, 0.1)')

    el.style.setProperty('--panel-background-color', 'rgba(0, 0, 0, 0.1)')
    el.style.setProperty('--toolbar-background-color', 'rgba(0, 0, 0, 0.3)')
    el.style.setProperty('--textarea-background-color', 'rgba(0, 0, 0, 0.2)')
  } else if (theme === 'light') {
    //
  } else if (theme === 'dark') {
    //
  } else if (theme === 'no') {
    console.error('未知主题')
  }
}

onMounted(async () => {
  await initEditor('')
  setTheme(localStorage.getItem('theme') || 'no')
})

onUnmounted(() => {
  if (tipTimer) clearTimeout(tipTimer)
})

const props = defineProps(['articleId', 'articleCheckedIndex', 'queryStr'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

// 将内容的变化通知父组件，使其修改列表中的显示
function save() {
  saveArticle(props.articleId, title.value, content.value)
  contentUpdate(title, content)
  showSavedTip()
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  title.value = target.value
  save()
}

/* ===== AI 助手与编辑器的接口 =====
   正文优先问 vditor 实例要（getValue 比响应式的 content 更实时，
   比如用户刚敲完还没触发 input 回调时也不会拿到旧值）。
   但编辑器没就绪时 getValue 会抛异常，这时退回 content ——
   那里存的始终是「当前这篇文章」的正文，也就是用户正在看的 content view。 */
const getAiContext = () => {
  let md = ''
  let selection = ''
  try {
    md = vditor.value?.getValue() || ''
    selection = vditor.value?.getSelection() || ''
  } catch {
    md = ''
  }
  return {
    title: title.value || '',
    /* 这里必须用 trim() 判断，不能写 `md || content.value`：
       编辑器为空时 Vditor 的 getValue() 返回的是 "\n" 而不是 ""，
       而 "\n" 是 truthy，会把后面那个兜底整个短路掉 ——
       结果就是正文明明好好躺在 content 里，AI 却只收到一个换行符，
       表现就是「AI 读不到正文」。 */
    content: md.trim() ? md : content.value || '',
    selection
  }
}

// 把 AI 结果写回编辑器。注意 setValue / updateValue / insertValue 都是程序化写入，
// 不会触发编辑器的 input 回调，所以要手动把内容同步进 content 并落一次盘。
const applyAiResult = ({
  text,
  mode
}: {
  text: string
  mode: 'replaceAll' | 'replaceSelection' | 'insert'
}) => {
  if (!vditor.value) return
  if (mode === 'replaceAll') {
    // clearStack = false：保留撤销栈。
    // AI 现在是「整篇覆写」，万一它漏了段落或改歪了，用户必须能 Ctrl+Z 回去 ——
    // 默认的 setValue(text) 会把撤销栈清空，那就真没法救了。
    vditor.value.setValue(text, false)
  } else if (mode === 'replaceSelection') {
    vditor.value.updateValue(text)
  } else {
    vditor.value.insertValue(text)
  }
  vditor.value.focus()
  nextTick(() => {
    const md = vditor.value?.getValue()
    if (typeof md === 'string') {
      content.value = md
      save()
    }
  })
}

// 监控props中的articleId，若其等于-9999，禁用编辑器
watch(
  () => props.articleId,
  (newProps) => {
    if (newProps === -9999) {
      title.value = ''
      // 同样走队列：新建文章时编辑器可能还没就绪
      applyToEditor('', true)
      titleUpdateLock.value = true
      titlePlaceholder.value = ''
      savedTip.value = false
      if (tipTimer) clearTimeout(tipTimer)
    } else {
      titlePlaceholder.value = '请输入标题'
      // 编辑器没就绪时不必也不能动它：正文加载完会走 applyToEditor 一并 enable
      if (editorReady) vditor.value?.enable()
      titleUpdateLock.value = false
    }
  }
)

// 定义当内容发生更改时用来通知父组件的emit
const contentUpdate = (title: any, content: any) => {
  emit('contentUpdate', {
    articleId: props.articleId,
    title: title.value,
    content: content.value
  })
}

// 监视articleId如有变化，重新渲染文章列表
watch(
  () => props.articleId,
  (articleId, prevArticleId) => {
    if (articleId == prevArticleId) {
      console.error('错误，watch新旧值相等了！')
      return
    }

    // 切文章时清掉上一篇的"已保存"提示
    savedTip.value = false
    if (tipTimer) clearTimeout(tipTimer)

    axios.get(`${server_url}/article/${props.articleId}`).then((results) => {
      title.value = results.data[0].title
      content.value = results.data[0].content

      const highlight = props.queryStr != ''
      if (highlight) {
        content.value = content.value.replace(props.queryStr, `***~~${props.queryStr}~~***`)
        titleUpdateLock.value = true
      } else {
        titleUpdateLock.value = false
      }
      // 走队列写入：编辑器还没就绪（lute 没加载完）就等 after 补写，
      // 直接 setValue 会抛异常，正文就再也进不去了。
      applyToEditor(content.value, highlight)
    })
  }
)

// 外部链接
const pubArticle = () => {
  if (server_url == null) return
  axios.put(`${server_url}/pubarticle/${props.articleId}`).then((data) => {
    if (data.data.status == '200') {
      navigator.clipboard.writeText(`${server_url.replace('/v1', '')}/${data.data.url}`)
      ElMessage({
        showClose: true,
        message: '外部访问链接已成功复制至剪贴板',
        type: 'success'
      })
    } else {
      alert('意外错误')
    }
  })
}

// 上传成功的回调
const handleSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
  if (server_url == null) return
  const newImageUrl = `${server_url.replace('/v1', '')}/${response.url}`

  vditor.value!.setValue(content.value + `![](${newImageUrl})\n`)
  content.value = content.value + `![](${newImageUrl})\n`

  axios.post(`${server_url}/image`, {
    imagePath: response.url,
    Notebookid: props.articleId
  })

  if (fileList.value.every((item) => item.status === 'success')) {
    fileList.value = []
  }

  save()
}
</script>

<template>
  <div class="right-container">
    <div class="article-content-box shadow">
      <div id="TopRight">
        <span>你好， {{ user.userName }}！</span>
        <span>
          你当前阅读的是第
          <b>
            <span>{{ props.articleCheckedIndex }} </span>
          </b>

          篇文章
        </span>

        <span class="word-count">
          共
          <b><span v-text="content.length"></span></b>字</span
        >

        <router-link to="show">数据统计</router-link>

        <router-link to="random">随机推荐</router-link>
        <el-upload
          v-model:file-list="fileList"
          class="upload-demo"
          :action="`${server_url}/upload`"
          :on-success="handleSuccess"
          :headers="uploadHeaders"
          multiple="true"
          limit="100"
        >
          <button class="btn" size="large">上传图片</button>
        </el-upload>
        <button class="btn" size="large" @click="pubArticle">复制外部链接</button>
        <router-link to="disk"><button class="btn" size="large">网盘</button></router-link>

        <div class="space"></div>
        <Transition name="save-tip-fade">
          <span v-if="savedTip" class="save-tip">已保存 ✓</span>
        </Transition>

        <router-link to="admin" class="setting">
          <el-icon size="25"><Setting /></el-icon>
        </router-link>
      </div>

      <input
        id="input-title"
        :placeholder="titlePlaceholder"
        :disabled="titleUpdateLock"
        :value="title"
        @input="onInput"
      />
      <div id="vditor-box">
        <div id="vditor" class="vditor"></div>
      </div>
    </div>

    <ArticleContentTool :get-context="getAiContext" @apply="applyAiResult" />
  </div>
</template>

<style>
.save-tip {
  font-size: 13px;
  margin-left: 8px;
  display: inline-block;
  color: rgba(120, 220, 150, 0.85);
}

.save-tip-fade-enter-active,
.save-tip-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.save-tip-fade-enter-from,
.save-tip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
