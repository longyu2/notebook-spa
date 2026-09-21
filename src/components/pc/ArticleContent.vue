<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
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
      vditor.value!.setValue(initValue)
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

// 监控props中的articleId，若其等于-9999，禁用编辑器
watch(
  () => props.articleId,
  (newProps) => {
    if (newProps === -9999) {
      title.value = ''
      vditor.value!.setValue('')
      vditor.value?.disabled()
      titleUpdateLock.value = true
      titlePlaceholder.value = ''
      savedTip.value = false
      if (tipTimer) clearTimeout(tipTimer)
    } else {
      titlePlaceholder.value = '请输入标题'
      vditor.value?.enable()
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

    axios.get(`${server_url}/article/${props.articleId}`).then(async (results) => {
      title.value = results.data[0].title
      content.value = results.data[0].content

      if (props.queryStr != '') {
        content.value = content.value.replace(props.queryStr, `***~~${props.queryStr}~~***`)
        vditor.value?.disabled()
        titleUpdateLock.value = true
      } else {
        vditor.value?.enable()
        titleUpdateLock.value = false
      }
      await vditor.value!.setValue(content.value)
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

    <ArticleContentTool> </ArticleContentTool>
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
