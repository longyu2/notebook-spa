<script setup>
import { useRouter } from "vue-router";
import { server_url } from "@/assets/constants/index.js";
import { ref, watch } from "vue";
import axios from "axios";
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

const router = useRouter();
const props = defineProps(["checkArticleId"]); // 从父组件取得文章id
let [title, content] = [ref(""), ref("")]; // 定义标题和内容

// 根据id 查询 文章内容
axios
  .post(server_url + "/byIdSelContent", { id: props.checkArticleId })
  .then((response) => {
    content.value = response.data[0].content;
    title.value = response.data[0].title;
  });

// 多个来源组成的数组
watch([title, content], ([newTitle, newContent]) => {
  console.log(`x is ${newTitle} and y is ${newContent}`);
  save();
});

// 将内容保存到云
function save() {
  // 提交到服务器
  axios
    .post(server_url + "/updateContent", {
      Notebookid: props.checkArticleId,
      content: content.value,
      title: title.value,
    })
    .then(function (response) {
      console.log(response.data);
    });
}
</script>

<template>
  <div>
    <van-icon name="arrow-left" @click="router.push('/notebook_phone')" />
    <van-field placeholder="请输入标题" v-model="title" />
    <van-field type="textarea" placeholder="请输入正文" v-model="content" />

    <div>sdsdsd{{ props.checkArticleId }}</div>
  </div>
</template>

<style></style>
