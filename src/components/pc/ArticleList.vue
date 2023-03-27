<script setup>
import axios from "axios";
import { server_url } from "@/assets/constants/index.js";
import { ref, watch } from "vue";
import ArticleContent from "./ArticleContent.vue";
import { reactive, computed } from "vue";
import MoveToFolder from "@/components/pc/MoveToFolder.vue";
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

const props = defineProps(["folderId"]);

// 监视folderId,如有变化，重新渲染文章列表
watch(
  () => props.folderId,
  (folderId, prevFolderId) => {
    /* ... */
    if (folderId == prevFolderId) {
      console.error("错误，watch新旧值相等了！");
    }

    getArticleByFoldeId(folderId);
  }
);

let articles = ref([]);
let ArticleCheckId = ref(0);

// 根据folderId 获取文章信息并渲染
function getArticleByFoldeId(folderId) {
  axios.get(`${server_url}/articles?folderid=${folderId}`).then((result) => {
    articles.value = result.data.data; //  查询到的信息存储到article数组中
    ArticleCheckId = ref(articles.value[0].Notebookid); // 选中列表中最新的文章
    //在信息获取完成后，为其添加控制checkbox 的属性
    articles.value.forEach((element) => {
      element.checked = false;
    });
  });
}

getArticleByFoldeId(props.folderId); // 初始时调用查询方法，并填充

// 更改显示的文章
function byIdSelContent(Notebookid) {
  ArticleCheckId.value = Notebookid;
}

// 删除选中的文章
function delete_content() {
  let del_object = { del_sql_notebookid_list: [] };

  for (let i = 0; i < articles.value.length; i++) {
    // 删除articles 数组中对应数据
    if (articles.value[i].checked) {
      del_object.del_sql_notebookid_list.push(articles.value[i].Notebookid);
    }
  }

  // 调用后台的删除接口，将参数传递给后台进行删除
  axios.post(`${server_url}/delContent`, del_object).then((res) => {
    if (res == null) {
      console.error("res is null!");
    }
  });

  // 重新获取文章列表,由于不进行延迟的话，服务器返回太快，获取的数据是未删除的数据，所以延时0.1秒再去服务器获取数据
  setTimeout(function () {
    getArticleByFoldeId(props.folderId);
  }, 100);
}

// closeMoveCallback 根据emit事件关闭 文件夹移动框
// function closeMoveCallback() {
//   console.log("closer");
//   IsShowMoveToFolder = false;
// }

// 使用一个计算属性 ref来表示是否有check button 被选中，只要有一个以上被选中，该值为true
const isButtonChecked = computed(() => {
  let count = 0;
  // 遍历所有的checked 属性值，只要有一项的checkd 值为true，则count > 0 ，计算属性返回true
  articles.value.forEach((element) => {
    if (element.checked) {
      count++;
    }
  });
  if (count > 0) {
    return true;
  } else {
    return false;
  }
});

// 添加新文章
function addArticle() {
  axios
    // 在发起请求时，传给后端此时的folderid
    .post(`${server_url}/articles`, {
      folderid: props.folderId,
    })
    .then((result) => {
      let newArticle = result.data.data.articleInfo;
      console.log("data:");
      console.table(newArticle);

      console.table(newArticle);
      newArticle.checked = false;
      ArticleCheckId.value = newArticle.Notebookid;
      //返回的是只有一个元素的数组，还是需要用下标0取
      articles.value.unshift(newArticle);
    });
}

// 接收子组件传来的值
function contentUpdate(data) {
  // 对articles 进行遍历，找到Notebookid 与 子组件传来的articleId 相同的那一项，更改其内容
  articles.value.forEach((element) => {
    if (element.Notebookid == data.articleId) {
      console.log(data.content);
      element.title = data.title;
      element.content = data.content;
      console.log(element.content);
    }
  });
}
</script>

<template>
  <div class="article-list-box">
    <div id="TopLeft">
      <span class="article-count"> 共{{ articles.length }}条笔记 </span>
      <div class="topleft-bottom">
        <div class="isChecked-area">
          <a class="del-btn" v-if="isButtonChecked" @click="delete_content()"
            >删除</a
          >

          <span class="move-btn" v-if="isButtonChecked">移动到..</span>
        </div>
        <img
          id="ImageButtonAdd"
          @click="addArticle()"
          src="@/assets/addNewNoteBook.svg"
          alt=""
        />
      </div>
    </div>

    <div id="left">
      <ul id="List-ul">
        <li
          v-for="(item, index) in articles"
          :key="index"
          @click="byIdSelContent(item['Notebookid'])"
          :class="{ buttonchecked: item.Notebookid === ArticleCheckId }"
        >
          <input
            type="checkbox"
            name=""
            v-model="item.checked"
            class="checkbox"
            id=""
          />

          <!-- substring做一个截取，因为左边列表宽度有限内容只能显示十几个字 -->
          <div class="article-information-box">
            <p class="p_1" v-text="item.title.substring(0, 14)"></p>
            <p class="p_2" v-text="item.content.substring(0, 16)"></p>
            <p class="p_3" v-text="item.createtime"></p>
          </div>
        </li>
      </ul>
    </div>
  </div>

  <!-- <MoveToFolder></MoveToFolder> -->

  <ArticleContent
    @content-update="contentUpdate"
    :articleId="ArticleCheckId"
  ></ArticleContent>
</template>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;

.article-list-box {
  margin-left: 10px;
  width: auto;
  height: $box-height;
  border: $black-border;
  color: #111111;
  border: 0px;

  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  #TopLeft {
    width: $left-width;
    height: 100px;
    border-radius: 0;
    background-color: white;
    border-radius: $radius;
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: flex-start;
    .article-count {
      margin-left: 15px;
      font-size: medium;
      color: #909090;
    }
    .folderName {
      margin-left: 20px;
      font-size: large;
      color: green;
    }
    .topleft-bottom {
      padding: 0%;
      width: 300px;
      height: 55px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      .isChecked-area {
        padding: 0;
        width: 75%;
        padding: 10px;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;

        .del-btn {
          margin-left: 20px;
          width: 50px;
          height: 18px;
          color: white;
          background-color: cornflowerblue;
          padding: 5px 10px;
          font-size: medium;
          border: 0ch;
          border-radius: 5px;
          line-height: 18px;
        }

        .del-btn:hover {
          background-color: crimson;
          transform: scale(1.2);
        }

        .move-btn {
          height: 18px;
          width: 70px;
          margin-left: 20px;
          color: white;
          background-color: cornflowerblue;
          padding: 5px 10px;
          font-size: medium;
          border: 0ch;
          border-radius: 5px;
          line-height: 18px;
        }
        .move-btn:hover {
          background-color: orange;
          transform: scale(1.2);
        }
      }

      #ImageButtonAdd {
        margin-right: 10px;
        height: 44px;
      }
      #ImageButtonAdd:hover {
        transform: scale(1.2);
      }
    }
  }

  #left {
    padding: 0px;
    height: 795px;
    width: $left-width;
    overflow: auto;
    background-color: white;
    border-radius: $radius;
    ul {
      margin-top: 0%;

      padding: 0px;
    }

    li {
      list-style: none;
      border-bottom: 1px solid #909090;
      width: inherit;
      height: 70px;
      padding: 10px 10px;
      display: flex;
      align-items: flex-start;
      .checkbox {
        margin-top: 5px;
      }
      .article-information-box {
        margin-left: 10px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        p {
          margin: 3px 0px;
        }
        .p_1 {
          font-size: 15px;
          font-weight: 600;
        }

        .p_2 {
          font-size: 14px;
        }

        .p_3 {
          font-size: 13px;
          color: gray;
        }
      }
    }
  }

  .checkbox {
    margin: 5px 5px;
    z-index: 2;
  }

  li:hover {
    background-color: #dddddd;
  }
}

.buttonchecked {
  background-color: gainsboro;
}
</style>
