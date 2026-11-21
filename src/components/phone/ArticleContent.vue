<script setup lang="ts">
import { ref, watch } from 'vue'
import axios from 'axios'
const server_url = localStorage.getItem('server_url')

import { saveArticle } from '@/assets/js/ArticlesTools'
let user = JSON.parse(localStorage.getItem('user')!)

let [title, content] = [ref(''), ref('')]

/* 私密笔记：手机端不做解密（编辑器只是个 textarea，塞不下口令/密钥那一套流程），
   只显示一句说明。关键是 privateLocked 一旦为真就绝不落盘 ——
   否则会把空串写回去，把密文覆盖掉。 */
const privateLocked = ref(false)

const props = defineProps(['articleId'])
const emit = defineEmits(['contentUpdate', 'contentHide'])

let contentUpdateLock = false

// 监听tite 和 content
watch([title, content], ([newTitle, newContent]) => {
  // 私密且未解锁：不存，也不往列表回传（回传会把密文/空标题画到卡片上）
  if (privateLocked.value) return

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
        const row = results.data[0]
        contentUpdateLock = true // 由articleId变化而产生的刷新，锁住

        if (!row) {
          privateLocked.value = false
          title.value = ''
          content.value = ''
          return
        }

        if (row.is_private == 1) {
          privateLocked.value = true
          title.value = ''
          content.value = ''
          return
        }

        privateLocked.value = false
        // 将查询到的文章信息赋给title 和 content 两个响应性变量
        title.value = row.title
        content.value = row.content
      })
    }
  }
)
</script>

<template>
  <div class="article-content-box">
    <van-icon name="arrow-left" size="7vw" class="return-icon" @click="hideContent" />

    <div v-if="privateLocked" class="phone-private">
      <van-icon name="lock" size="34" />
      <p class="phone-private__title">这篇笔记已加密</p>
      <p class="phone-private__text">
        服务器上只有 AES-256 密文。手机端暂不解密，请用电脑端打开并输入密码查看。
      </p>
    </div>

    <template v-else>
      <van-field v-model="title" class="input-text-title" label="" placeholder="请输入标题" />
      <span class="word-count">{{ content.length }} 字</span>

      <textarea class="input-text-content" v-model="content" placeholder="请输入内容"> </textarea>
    </template>
  </div>
</template>

<style>
.phone-private {
  padding: 18vh 24px 0;
  text-align: center;
  color: var(--word-color);
}

.phone-private__title {
  margin: 12px 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.phone-private__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  opacity: 0.8;
}
</style>
