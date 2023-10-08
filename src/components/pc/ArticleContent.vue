<script setup>
import { ref, watch } from "vue";
import axios from "axios";
import { server_url } from "../../assets/constants/server_url";
import { saveArticle } from "@/assets/js/ArticlesTools.js";

let user = JSON.parse(localStorage.getItem("user"));

let [title, content] = [ref(""), ref("")];
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

const props = defineProps(["articleId"]);
const emit = defineEmits(["contentUpdate"]);

// 监听tite 和 content
watch([title, content], ([newTitle, newContent]) => {
  saveArticle(props.articleId, title.value, content.value);

  // 将内容的变化通知父组件，使其修改列表中的显示
  contentUpdate(title, content);
});

// 定义当内容发生更改时用来通知父组件的emit
const contentUpdate = (title, content) => {
  emit("contentUpdate", {
    articleId: props.articleId,
    title: title.value,
    content: content.value,
  });
};

// 监视articleId如有变化，重新渲染文章列表
watch(
  () => props.articleId,
  (articleId, prevArticleId) => {
    /* ... */
    if (articleId == prevArticleId) {
      console.error("错误，watch新旧值相等了！");
    } else {
      // 使用axios 获取文章信息
      axios
        .post(`${server_url}/byIdSelContent`, { id: props.articleId })
        .then((results) => {
          // 将查询到的文章信息赋给title 和 content 两个响应性变量
          title.value = results.data[0].title;
          content.value = results.data[0].content;
        });
    }
  }
);
</script>

<template>
  <div class="article-content-box shadow">
    <div id="TopRight">
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
    <div id="right">
      <input
        type="text"
        placeholder="请输入标题"
        id="TextBoxTitle"
        v-model="title"
      />
      <textarea
        name="reworkmes"
        placeholder="请输入内容"
        id="txtContent"
        style="overflow: auto"
        v-model="content"
      ></textarea>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 95vh;

.article-content-box {
  min-width: 400px;
  height: $box-height;
  margin-left: 20px;
  flex-grow: 4;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  #TopRight {
    padding: 10px;
    background-color: #fff;
    height: 10vh;
    border-radius: $radius;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    span,
    a {
      margin: 5px;
      font-size: small;
      color: black;
    }
    a:hover {
      margin: 5px;
      font-size: small;
      color: orange;
      transform: translate(0px, -3px);
    }
    .word-count {
      margin-left: 20px;
    }
  }
  #right {
    margin-top: 2vh;
    height: 85vh;
    border-bottom: 0px;
    background-color: white;
    #TextBoxTitle {
      margin-left: 8px;
      width: 80%;
      flex-grow: 4;
      height: 35px;
      font-weight: 400;
      font-size: medium;
      border-radius: 5px;
      outline: none;
      border: none;
    }

    #txtContent {
      flex-grow: 4;
      width: 98%;
      margin-top: 10px;
      margin-left: 1%;
      height: 90%;
      font-size: small;
      font-family: "微软雅黑";
      border: 1px solid gray;
      border-radius: 5px;
      outline: none;
      border: none;
    }
  }
}
</style>
