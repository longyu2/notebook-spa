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
      if (response.data == null) {
        console.error("error");
      }
    });
}
</script>

<template>
  <div class="article-content-contanier">
    <van-icon
      name="arrow-left"
      size="5vw"
      class="return-icon"
      @click="router.push('/notebook_phone')"
    />
    <van-field placeholder="请输入标题" v-model="title" />
    <van-field
      type="textarea"
      placeholder="请输入正文"
      autosize
      v-model="content"
    />
  </div>
</template>

<style lang="scss" scoped>
.article-content-contanier {
  margin: 0%;
  padding: 0%;
  .return-icon {
    margin: 3vw 3vw;
  }
}
</style>
