<script setup>
import { ref } from "vue";
import axios from "axios";
import { server_url } from "@/assets/constants/server_url";
// 请求拦截, 给axios 添加请求头，设置token
axios.interceptors.request.use(
  (config) => {
    // 添加自定义token
    config.headers.authorization = localStorage.getItem("token");
    return config;
  },
  (error) => {
    return Promise.error(error);
  }
);

let count = 0;
let NoteBookList = [];

let title = ref("");
let createtime = ref("");
let content = ref("");

axios.get(`${server_url}/articles?folderid=-2`).then((result) => {
  console.log(result.data.data); //  查询到的信息存储到article数组中

  count = result.data.data.length;
  NoteBookList = result.data.data;
  console.log(NoteBookList);
});

function showRandomArticle() {
  console.log(NoteBookList);
  let rand = Math.floor(Math.random() * count);

  // 使用axios 获取文章信息
  axios
    .post(`${server_url}/byIdSelContent`, { id: NoteBookList[rand].Notebookid })
    .then((results) => {
      // 将查询到的文章信息赋给title 和 content 两个响应性变量
      console.log(results.data[0]);
      title.value = results.data[0].title;
      content.value = results.data[0].content;
      createtime.value = results.data[0].createtime;
    });
}
</script>

<template>
  <el-button @click="showRandomArticle">随机推荐</el-button>
  <el-card>
    <p>{{ title }}</p>

    <br />
    <p>{{ createtime }}</p>
    <br />

    <p>{{ content }}</p>
  </el-card>
</template>
