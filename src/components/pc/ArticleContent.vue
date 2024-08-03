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
let [contentUpdateLock, titleUpdateLock] = [false, ref(false)]
let titlePlaceholder = ref('请输入标题')

const vditor = ref<Vditor | null>(null)

// 用于初始化编辑器的函数，传入参数
function initEditor(initValue: string) {
  vditor.value = new Vditor('vditor', {
    height: 2000,
    toolbarConfig: {
      pin: true
    },
    cache: {
      enable: true
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

const props = defineProps(['articleId', 'articleCheckedIndex', 'queryStr'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

// 监听tite 和 content
watch([title, content], ([newTitle, newContent]) => {
  // 如果被锁住，不可以触发储存方法
  if (!contentUpdateLock) {
    // 如果queryStr不空且content包含querystr，则去色
    if (props.queryStr != '' && content.value.indexOf(`***~~${props.queryStr}~~***`) != -1) {
      content.value = content.value.replace(`***${props.queryStr}***`, props.queryStr)
    }

    saveArticle(props.articleId, title.value, content.value)
  } else {
    contentUpdateLock = false // 触发后解锁，则不会影响正常使用
  }

  // 将内容的变化通知父组件，使其修改列表中的显示

  contentUpdate(title, content)
})

// 监控props中的articleId，若其等于-9999，禁用编辑器
watch(
  () => props.articleId,
  (newProps) => {
    if (newProps === -9999) {
      title.value = ''
      titleUpdateLock.value = true
      vditor.value!.setValue('') // 清空编辑器
      vditor.value?.disabled() // 禁用编辑器
      titlePlaceholder.value = ''
    } else {
      titlePlaceholder.value = '请输入标题'
      titleUpdateLock.value = false
      vditor.value?.enable() // 启用编辑器
    }
  }
)

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
      axios.get(`${server_url}/article/${props.articleId}`).then(async (results) => {
        // 将查询到的文章信息赋给title 和 content 两个响应性变量
        contentUpdateLock = true // 由articleId变化而产生的刷新，锁住
        title.value = results.data[0].title
        content.value = results.data[0].content

        if (props.queryStr != '') {
          // 如果queryStr 不为空，则高亮queryStr
          content.value = content.value.replace(props.queryStr, `***~~${props.queryStr}~~***`)
          await initEditor(content.value)
          vditor.value?.disabled()
        } else {
          await initEditor(content.value)
          vditor.value?.enable()
        }
      })
    }
  }
)

import { ElMessage } from 'element-plus'

// 外部链接
const pubArticle = () => {
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

// 文件上传
const token = localStorage.getItem('token')

const uploadHeaders = { Authorization: token }

const handleSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
  const newImageUrl = `${server_url.replace('/v1', '')}/${response.url}`

  vditor.value!.setValue(content.value + `![](${newImageUrl})\n`)
  content.value = content.value + `![](${newImageUrl})\n` // 为编辑区加上图片

  // 这里再次调用一个接口，将图片信息保存到服务器
  axios.post(`${server_url}/image`, {
    imagePath: response.url,
    Notebookid: props.articleId
  })

  // 当列表里每一项的状态都是success以后才清空文件列表
  if (fileList.value.every((item) => item.status === 'success')) {
    fileList.value = [] // 清空文件列表
  }
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
        multiple="true"
        limit="100"
      >
        <el-button text size="large">上传图片</el-button>
      </el-upload>
      <el-button text size="large" @click="pubArticle">复制外部链接</el-button>

      <div class="space"></div>

      <router-link to="admin" class="setting">
        <el-icon size="25"><Setting /></el-icon>
      </router-link>
    </div>

    <input
      id="input-title"
      :placeholder="titlePlaceholder"
      :disabled="titleUpdateLock"
      v-model="title"
    />
    <div id="vditor" class="vditor"></div>
  </div>
</template>
