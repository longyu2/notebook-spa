<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'
import { server_url } from '../../assets/constants/server_url'
import { saveArticle } from '@/assets/js/ArticlesTools'
let user = JSON.parse(localStorage.getItem('user')!)
let [title, content] = [ref(''), ref('')]
import type { UploadProps, UploadUserFile } from 'element-plus'

const fileList = ref<UploadUserFile[]>([])
import Vditor from 'vditor'
import 'vditor/dist/index.css'

/**
 *  用来锁住内容，保证只是因切换文章产生的content 和 title 变化不会被
 *  watch 监听到，从而覆盖 产生变化，导致修改时间发生惨痛的变化
 */
let contentUpdateLock = false

const vditor = ref<Vditor | null>(null)

// 用于初始化编辑器的函数，传入参数
function initEditor(initValue: string) {
  vditor.value = new Vditor('vditor', {
    height: 1060,
    toolbarConfig: {
      pin: true
    },
    cache: {
      enable: false
    },
    after: () => {
      vditor.value!.setValue(initValue)
    },
    input: (md) => {
      content.value = md // 回调将编辑器输入
    }
  })
}

onMounted(() => {
  initEditor('')
})

const props = defineProps(['articleId', 'articleCheckedIndex'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

// 监听tite 和 content
watch([title, content], ([newTitle, newContent]) => {
  // 如果被锁住，不可以触发储存方法
  if (!contentUpdateLock) {
    saveArticle(props.articleId, title.value, content.value)
  } else {
    contentUpdateLock = false // 触发后解锁，则不会影响正常使用
  }

  // 将内容的变化通知父组件，使其修改列表中的显示
  contentUpdate(title, content)
})

// 返回按钮关闭文章内容

function hideContent() {
  emit('contentHide')
}

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
    } else {
      // 使用axios 获取文章信息
      axios.get(`${server_url}/article/${props.articleId}`).then((results) => {
        // 将查询到的文章信息赋给title 和 content 两个响应性变量
        contentUpdateLock = true // 由articleId变化而产生的刷新，锁住
        title.value = results.data[0].title
        content.value = results.data[0].content
        initEditor(results.data[0].content)
      })
    }
  }
)

// 文件上传

const token = localStorage.getItem('token')

const uploadHeaders = { Authorization: token }

const handleSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
  const newImageUrl = `https://note.misaka-mikoto.cn:9999/${response.url}`
  vditor.value!.setValue(content.value + `![](${newImageUrl})`)
  content.value = content.value + `![](${newImageUrl})`
  fileList.value = [] // 清空文件列表
}
</script>

<template>
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

      <router-link to="random">随机推荐</router-link>

      <el-upload
        v-model:file-list="fileList"
        class="upload-demo"
        :action="`${server_url}/upload`"
        :on-success="handleSuccess"
        :headers="uploadHeaders"
      >
        <el-button text size="large">上传图片</el-button>
      </el-upload>

      <div class="space"></div>

      <router-link to="admin" class="setting">
        <el-icon size="25"><Setting /></el-icon>
      </router-link>
    </div>

    <input id="input-title" placeholder="请输入标题" v-model="title" />
    <div id="vditor" class="vditor"></div>
  </div>
</template>
