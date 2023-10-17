<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'
import { server_url } from '../../assets/constants/server_url'
import { saveArticle } from '@/assets/js/ArticlesTools'
let user = JSON.parse(localStorage.getItem('user')!)

let [title, content] = [ref(''), ref('')]
axios.interceptors.request.use((config) => {
  // 添加自定义token
  config.headers.authorization = localStorage.getItem('token')
  return config
})

import Vditor from 'vditor'
import 'vditor/dist/index.css'

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
      console.log(md)
    }
  })
}

onMounted(() => {
  initEditor('')
})

const props = defineProps(['articleId'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

// 监听tite 和 content
watch([title, content], ([newTitle, newContent]) => {
  saveArticle(props.articleId, title.value, content.value)
  console.log(newTitle, newContent)
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
    /* ... */
    if (articleId == prevArticleId) {
      console.error('错误，watch新旧值相等了！')
    } else {
      // 使用axios 获取文章信息
      axios.post(`${server_url}/byIdSelContent`, { id: props.articleId }).then((results) => {
        // 将查询到的文章信息赋给title 和 content 两个响应性变量
        title.value = results.data[0].title
        content.value = results.data[0].content

        initEditor(results.data[0].content)
        //
      })
    }
  }
)
</script>

<template>
  <div class="article-content-box shadow">
    <div id="TopRight">
      <van-icon name="arrow-left" size="5vw" class="return-icon" @click="hideContent" />

      <span>你好， {{ user.userName }}！</span>
      <span>
        你当前阅读的是第
        <b>
          <span>{{ props.articleId }} </span>
        </b>

        篇文章
      </span>

      <span class="word-count">
        共
        <b><span v-text="content.length"></span></b>字</span
      >

      <router-link to="admin">管理页面</router-link>
      <router-link to="random">随机推荐</router-link>
    </div>

    <input id="input-title" placeholder="请输入标题" v-model="title" />

    <div id="vditor" class="vditor"></div>
  </div>
</template>
