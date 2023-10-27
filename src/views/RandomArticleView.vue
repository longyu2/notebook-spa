<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { server_url } from '@/assets/constants/server_url'

let count = 0
let NoteBookList: any = []

let title = ref('')
let createtime = ref('')
let content = ref('')

axios.get(`${server_url}/articles?folderid=-2`).then((result) => {
  count = result.data.data.length
  NoteBookList = result.data.data
})

// 为确保体验，以前看过的不能重复出现
let arr: number[] = []
const lo = localStorage.getItem('randomArr')
if (lo != null) {
  arr = JSON.parse(lo)
}

function showRandomArticle() {
  let rand = 0
  /* 循环进行随机数生成，若与数组中已有的数重复，则continue，
  若不重复，break 跳出循环，若数组长度达到总数据量上限，也跳出循环*/
  while (true) {
    rand = Math.floor(Math.random() * count)
    if (arr.length == count) {
      alert('第一次循环已经完成')
      localStorage.setItem('randomArr', JSON.stringify([]))
      arr = []
      break
    }

    if (arr.indexOf(rand) != -1) {
      continue
    } else {
      arr.push(rand)
      localStorage.setItem('randomArr', JSON.stringify(arr))
      break
    }
  }

  // 使用axios 获取文章信息
  axios.get(`${server_url}/article/${NoteBookList[rand].Notebookid}`).then((results) => {
    // 将查询到的文章信息赋给title 和 content 两个响应性变量
    title.value = results.data[0].title
    content.value = results.data[0].content
    createtime.value = results.data[0].createtime
  })
}
</script>

<template>
  <div class="random-box">
    <nav>
      <el-button size="large" @click="showRandomArticle">随机推荐</el-button>
    </nav>

    <el-card class="random-text">
      <p>{{ title }}</p>

      <br />
      <p>{{ createtime }}</p>
      <br />
      <p>{{ content }}</p>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.random {
  &-box {
    margin: 100px auto;
    width: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    nav {
      margin: 20px;
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
  }
  &-text {
    min-height: 200px;
    width: 100%;
  }
}
</style>
