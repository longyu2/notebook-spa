<script setup>
import { ref, watch } from "vue";
import axios from "axios";
import { server_url } from "../../assets/constants/server_url";
import { saveArticle } from "@/assets/js/ArticlesTools.js";
import "@/assets/css/articleContent.scss";
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

// 返回按钮关闭文章内容

function hideContent() {
  emit("contentHide");
}

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
      <van-icon
        name="arrow-left"
        size="5vw"
        class="return-icon"
        @click="hideContent"
      />

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
