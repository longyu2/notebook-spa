<script setup>
import { ref } from "vue";
import { server_url } from "@/assets/constants/index.js";
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

const articleList = ref([]);
const loading = ref(false);
const finished = ref(false);

console.log(server_url);

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

getAllArticle(); // 查询所有文章

// 根据id查询标题和内容
function byIdSelContent(Notebookid) {
  // router.push("/content");
}
</script>
<template>
  <div id="NoteBook-List">
    <img
      v-show="!is_Content_Show"
      id="ImageButtonAdd"
      src="@/assets//addNewNotebook.svg"
      @click="addNewNotebook()"
    />

    <van-list
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      @load="getAllArticle"
    >
      <van-cell v-for="item in articleList" :key="item.title" class="van-cell">
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

    <van-tag type="success">df</van-tag>
    <van-tag type="danger">标签</van-tag>
    <van-tag type="warning">标签</van-tag>
  </div>

  <!-- <router-view></router-view> -->
</template>

<script>
export default {
  props: ["server_url"],
  data() {
    return {
      notebookContent: "",
      notebookTitle: "",
      lastTime: 0,
      leftArr: [],
      checkId: 0, //用来指示当前选中的是哪一篇笔记
      nums: true, //计数器，用来标识只执行一次的填充
      times: 0, // 时间戳
      check_submit: false, //此值表示save方法是否可用，为false则save方法禁用
      set_timeout: (() => {}, 1000),
      is_Content_Show: true, // 这个值表示当前处于内容页还是列表页
    };
  },
  watch: {
    checkId: function () {
      this.save();
    },
    notebookContent: function (newVal, oldVal) {
      // 保证节流的最后一次能触发
      // 新旧值不同，说明发生了修改，执行保存
      if (newVal != oldVal) {
        if (parseInt(new Date().getTime() / 1000) - this.time < 3) {
          clearTimeout(this.set_timeout);
          if (this.check_submit) {
            this.set_timeout = setTimeout(() => {
              // 完成了节流的最后一次修改
              this.save();
            }, 3500);
          }
          // 3秒内修改不提交 ,并且刷新settimeout
          return;
        }
        this.time = parseInt(new Date().getTime() / 1000);
        this.save();
      }
    },
    notebookTitle: function (newVal, oldVal) {
      // 新旧值不同，说明发生了修改，执行保存
      if (newVal != oldVal) {
        this.save();
      }
    },
  },

  methods: {
    // 将内容保存到云
    save: function () {
      let that = this;
      // 完成之后修改leftarr左边显示的值
      that.leftArr.forEach((element) => {
        if (element.Notebookid == that.checkId) {
          element.content = that.notebookContent;
          element.title = that.notebookTitle;
        }
      });
      // 提交到服务器
      axios
        .post(this.server_url + "/updateContent", {
          Notebookid: this.checkId,
          content: this.notebookContent,
          title: this.notebookTitle,
        })
        .then(function (response) {
          console.log(response);
        });
    },

    // // 根据id查询标题和内容
    // byIdSelContent: function (Notebookid) {
    //   this.change_list_Or_Content(); // 切换到内容页

    //   this.save(); // 切换时存储

    //   // 禁用save方法，因为查询标题和内容会改变notebookTitle和notebookContent 的值，会触发不必要的提交，在解除禁用
    //   this.check_submit = false;

    //   let that = this;
    //   axios
    //     .post(this.server_url + "/byIdSelContent", {
    //       id: Notebookid,
    //     })
    //     .then(function (response) {
    //       // console.log(response.data);
    //       that.checkId = response.data[0].Notebookid;
    //       that.notebookContent = response.data[0].content;
    //       that.notebookTitle = response.data[0].title;
    //     })
    //     .catch(function (error) {
    //       console.log(error);
    //     });
    //   that.check_submit = true; //接触save方法的禁用
    // },
    // 添加新文章
    //   addNewNotebook: function () {
    //     this.change_list_Or_Content(); // 切换到内容页
    //     let that = this;
    //     this.save();
    //     axios
    //       .get(this.server_url + "/addnewNotebook")
    //       .then(function (response) {
    //         that.checkId = response.data[0].Notebookid;
    //         console.log(response.data[0].Notebookid);
    //         that.notebookContent = "";
    //         that.notebookTitle = "";
    //         if (response.data == null) {
    //           console.error("接口返回数据为空");
    //         }
    //         //返回的是只有一个元素的数组，还是需要用下标0取
    //         that.leftArr.push(response["data"][0]);
    //         // 滚动条到底
    //         that.$nextTick(function () {
    //           document.getElementById("left").scrollTop = 1000000;
    //         });
    //       })
    //       .catch(function (error) {
    //         console.log(error);
    //       });
    //   },
    //   //切换列表页与内容页面
    //   change_list_Or_Content: function () {
    //     // 值为true则进入内容页，反之则返回列表页
    //     this.is_Content_Show = !this.is_Content_Show;
    //     console.log("change");
    //   },
  },

  // 页面加载时执行
  created: function () {
    // this.leftPost();
  },
};
</script>

<style scoped lang="scss">
* {
  margin: 0px;
  padding: 0px;
  background-color: white;
}

#NoteBook-List {
  #ImageButtonAdd {
    position: fixed;
    width: 20vmin;
    height: 20vmin;
    z-index: 2;
    top: 85vh;
    left: 75vw;
    border-radius: 50%;
  }
  ul {
    z-index: 1;
    li {
      list-style: none;
      border-bottom: 1px solid #909090;
      padding: 3vmin 3vmin;
      margin-left: 1vmin;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      p {
        margin-top: 3vmin;
      }
    }
  }
}

.van-cell {
  padding-left: 5%;
  .cell-content {
    width: 90%;
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

#NoteBook-Content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0 2.5vw;
  .return-btn {
    width: 30px;
    height: 30px;
  }

  #TextBoxTitle {
    margin-top: 10px;
    width: 95vw;
    font-weight: 500;
    font-size: 7vw;
    border-radius: 5px;
    outline: none;
    border: none;
    min-height: 7vw;
  }

  hr {
    width: 95vw;
  }
  #txtContent {
    margin-top: 10px;
    height: 90vh;
    width: 95vw;
    font-size: 4vw;
    font-weight: 400;
    font-family: "微软雅黑";
    outline: none;
    border: 0px;
  }
}
</style>
