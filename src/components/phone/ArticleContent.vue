<script setup lang="ts">
import { ref, watch } from 'vue'
import axios from 'axios'
import { server_url } from '../../assets/constants/server_url'
import { saveArticle } from '@/assets/js/ArticlesTools'
let user = JSON.parse(localStorage.getItem('user')!)

let [title, content] = [ref(''), ref('')]

const props = defineProps(['articleId'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

let contentUpdateLock = false

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
    /* ... */
    if (articleId == prevArticleId) {
      console.error('错误，watch新旧值相等了！')
    } else {
      // 使用axios 获取文章信息

      // 使用axios 获取文章信息
      axios.get(`${server_url}/article/${props.articleId}`).then((results) => {
        contentUpdateLock = true // 由articleId变化而产生的刷新，锁住

        // 将查询到的文章信息赋给title 和 content 两个响应性变量
        title.value = results.data[0].title
        content.value = results.data[0].content
      })
    }
  }
)
</script>

<template>
  <div class="article-content-box">
    <van-icon name="arrow-left" size="7vw" class="return-icon" @click="hideContent" />

    <van-field v-model="title" class="input-text-title" label="" placeholder="请输入标题" />
    <span class="word-count">{{ content.length }} 字</span>

    <textarea class="input-text-content" v-model="content" placeholder="请输入内容"> </textarea>
  </div>
</template>
