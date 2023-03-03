<script setup>
import { ref } from "vue";
import { server_url } from "@/assets/constants/index.js";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();
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

const emit = defineEmits(["submit"]);
const loading = ref(false);
const finished = ref(false);

let articleList = ref([]); // 定义文章列表
getAllArticle(); // 查询所有文章

// 获取所有文章
function getAllArticle() {
  axios.get(server_url + "/getNotebookList").then(
    function (response) {
      // 每次获取10条
      articleList.value = response.data;
      loading.value = true;
      finished.value = true;
    },
    function (err) {
      console.log(err);
    }
  );
}
// 增加新文章
function addNewNotebook() {
  axios
    // 在发起请求时，传给后端此时的folderid
    .post(`${server_url}/articles`, {
      folderid: -1,
    })
    .then((result) => {
      const newArticle = result.data.data.articleInfo;
      articleList.value.push(newArticle);
      toArticleContent(newArticle.Notebookid);
    });
}

// emit请求，用于给content组件传递一个id值
function toArticleContent(checkArticleId) {
  emit("submit", checkArticleId); // emit 向父组件传递id 再由父组件的props 传递给ArticleContent,使得content能够正常的显示
  router.push("/notebook_phone/content");
}
</script>
<template>
  <div id="NoteBook-List">
    <van-icon
      id="ImageButtonAdd"
      size="14vw"
      color="orange"
      @click="addNewNotebook()"
      name="add"
    />
    <van-list
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      @load="getAllArticle"
    >
      <van-cell
        v-for="item in [...articleList].reverse()"
        :key="item.title"
        @click="toArticleContent(item.Notebookid)"
        class="van-cell"
      >
        <div class="cell-content">
          <p class="item-title">
            {{ item.title.substring(0, 13) }}
          </p>
          <p class="item-content">
            {{ item.content.substring(0, 46) }}
          </p>

          <span class="item-createtime">
            {{ item.createtime }}
          </span>
        </div>
      </van-cell>
    </van-list>
  </div>
</template>

<style scoped lang="scss">
#NoteBook-List {
  #ImageButtonAdd {
    position: fixed;
    z-index: 2;
    top: 90vh;
    left: 80vw;
  }
  .van-cell {
    padding-left: 6%;
    .cell-content {
      width: 98%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      .item-title {
        font-size: 4vw;
        color: #333;
      }
      .item-content {
        font-size: 3.5vw;
        text-align: left;
      }
      .item-createtime {
        font-size: 3vw;
      }
    }
  }
}
</style>
