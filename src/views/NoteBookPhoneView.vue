<template>
  <div class="container"></div>

  <div id="NoteBook-List" v-show="!is_Content_Show">
    <img
      v-show="!is_Content_Show"
      id="ImageButtonAdd"
      src="@/assets//addNewNotebook.svg"
      @click="addNewNotebook()"
    />

    <ul id="List-ul">
      <li v-for="i in leftArr" :key="i" @click="byIdSelContent(i.Notebookid)">
        <!-- substring做一个截取，因为左边列表宽度有限内容只能显示十几个字 -->
        <p class="p_1" v-html="i.title.substring(0, 16)"></p>
        <p class="p_2" v-html="i.content.substring(0, 18)"></p>
        <p class="p_3" v-html="i.createtime"></p>
      </li>
    </ul>
  </div>

  <div id="NoteBook-Content" v-show="is_Content_Show">
    <img
      class="return-btn"
      src="@/assets/返回箭头.svg"
      id="return-button"
      @click="change_list_Or_Content()"
    />

    <input
      type="text"
      placeholder="标题"
      id="TextBoxTitle"
      v-model="notebookTitle"
    />
    <hr />
    <textarea
      name="reworkmes"
      placeholder="开始书写"
      id="txtContent"
      style="overflow: auto"
      v-model="notebookContent"
    ></textarea>
  </div>
</template>

<script>
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

    // 接口返回左边列表
    leftPost: function () {
      let that = this;
      axios.get(this.server_url + "/getNotebookList").then(
        function (response) {
          that.leftArr = response.data;
          // 将第一篇文章内容查询
          that.byIdSelContent(that.leftArr[0].Notebookid);
        },
        function (err) {
          console.log(err);
        }
      );
    },

    // 根据id查询标题和内容
    byIdSelContent: function (Notebookid) {
      this.change_list_Or_Content(); // 切换到内容页

      this.save(); // 切换时存储

      // 禁用save方法，因为查询标题和内容会改变notebookTitle和notebookContent 的值，会触发不必要的提交，在解除禁用
      this.check_submit = false;

      let that = this;
      axios
        .post(this.server_url + "/byIdSelContent", {
          id: Notebookid,
        })
        .then(function (response) {
          // console.log(response.data);
          that.checkId = response.data[0].Notebookid;
          that.notebookContent = response.data[0].content;
          that.notebookTitle = response.data[0].title;
        })
        .catch(function (error) {
          console.log(error);
        });
      that.check_submit = true; //接触save方法的禁用
    },
    // 添加新文章
    addNewNotebook: function () {
      this.change_list_Or_Content(); // 切换到内容页
      let that = this;
      this.save();
      axios
        .get(this.server_url + "/addnewNotebook")
        .then(function (response) {
          that.checkId = response.data[0].Notebookid;
          console.log(response.data[0].Notebookid);
          that.notebookContent = "";
          that.notebookTitle = "";
          if (response.data == null) {
            console.error("接口返回数据为空");
          }
          //返回的是只有一个元素的数组，还是需要用下标0取
          that.leftArr.push(response["data"][0]);
          // 滚动条到底
          that.$nextTick(function () {
            document.getElementById("left").scrollTop = 1000000;
          });
        })
        .catch(function (error) {
          console.log(error);
        });
    },
    //切换列表页与内容页面
    change_list_Or_Content: function () {
      // 值为true则进入内容页，反之则返回列表页
      this.is_Content_Show = !this.is_Content_Show;
      console.log("change");
    },
  },

  // 页面加载时执行
  created: function () {
    this.leftPost();
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

      .p_1 {
        font-size: 6vmin;
      }

      .p_2 {
        font-size: 5vmin;
      }

      .p_3 {
        font-size: 5vmin;
        margin-left: 10px;
        color: gray;
      }
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
