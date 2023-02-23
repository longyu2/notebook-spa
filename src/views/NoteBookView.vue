<script setup>
import { ref } from "vue";
const props = defineProps(["server_url"]);

let folders = ref([]); // 定义响应式文件夹

//初始化，填充文件夹
axios
  .get(`${props.server_url}/QueryFolder`)
  .then((res) => (folders.value = res.data));

// 新建文件夹
function createFolder() {
  const name = prompt("请输入文件夹名");
  axios
    .post(`${props.server_url}/folders`, {
      folder_name: name,
    })
    .then((res) => {
      folders.value.push(res.data[0]);
      console.log(this.folders);
    });
}
// 文件夹更名
function folderRename(folder_id, index) {
  const newName = prompt("请输入新文件夹名");
  axios
    .put(`${props.server_url}/folders`, { folder_id, newName })
    .then((result) => {
      console.log(result.data);
      folders.value[index].folder_name = newName;
    });
}

let foldeDelDialogVisible = ref(false); // 控制删除对话框的出现
let delFolder = { id: 0, index: 0 }; // 定义一个将要确认删除的文件夹的id 以及在数组中的索引

// 文件夹删除
function deleteFolder(folder_id, index) {
  foldeDelDialogVisible.value = true;
  delFolder = { folder_id, index };
  console.log(delFolder);
}
// 确认删除
function confirmDelFolder() {
  foldeDelDialogVisible.value = false;
  console.log(delFolder.id);
  const folder_id = delFolder.id;
  axios
    .delete(`${props.server_url}/folders`, {
      params: { folder_id: delFolder.folder_id },
    })
    .then((restults) => console.log(restults.data));
  folders.value.splice(delFolder.index, 1);
}
</script>

<template>
  <div id="notebook-box">
    <div id="folder">
      <button class="addFolderBtn" @click="createFolder">新建文件夹</button>
      <ul>
        <li
          @click="changeFolder(-2, '全部笔记')"
          :class="{ buttonchecked: -2 === folderChecked.folderId }"
        >
          全部笔记
        </li>
        <li
          @click="changeFolder(-1, '未分类')"
          :class="{ buttonchecked: -1 === folderChecked.folderId }"
        >
          未分类
        </li>
        <li
          v-for="(item, index) in folders"
          :class="{ buttonchecked: folderChecked.folderId === item.folder_id }"
          @click="changeFolder(item.folder_id, item.folder_name)"
          :key="index"
        >
          <span style="color: red" @click="deleteFolder(item.folder_id, index)"
            >X</span
          >
          {{ item.folder_name }}

          <span
            style="color: blueviolet"
            @click="folderRename(item.folder_id, index)"
            >更名</span
          >
        </li>
      </ul>

      <el-dialog
        v-model="foldeDelDialogVisible"
        title="Tips"
        width="30%"
        :before-close="handleClose"
      >
        <span> 你确定要删除这个文件夹吗？ </span>

        <template #footer>
          <span class="dialog-footer">
            <el-button @click="foldeDelDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="confirmDelFolder()">
              确认
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>

    <div class="article-list-box">
      <div id="TopLeft">
        <span class="folderName">
          {{ folderChecked.folderName }}
        </span>

        <div class="topleft-bottom">
          <div class="isChecked-area">
            <a class="del-btn" v-if="check_bool" @click="delete_content()"
              >删除</a
            >

            <span
              class="move-btn"
              v-if="check_bool"
              @click="IsShowMoveToFolder = true"
              >移动到..</span
            >
          </div>

          <img
            id="ImageButtonAdd"
            @click="addNewNotebook()"
            src="@/assets/addNewNoteBook.svg"
            alt=""
          />
        </div>
      </div>

      <div id="left">
        <ul id="List-ul">
          <li
            v-for="(item, index) in NoteBookList"
            :key="index"
            @click="byIdSelContent(item['Notebookid'])"
            :class="{ buttonchecked: item.Notebookid === checkId }"
          >
            <input
              type="checkbox"
              @change="check_change()"
              v-model="checkBtnCheckedList[index]"
              name=""
              class="checkbox"
              id=""
            />

            <!-- substring做一个截取，因为左边列表宽度有限内容只能显示十几个字 -->
            <div class="article-information-box">
              <p class="p_1" v-text="item['title'].substring(0, 14)"></p>
              <p class="p_2" v-text="item['content'].substring(0, 16)"></p>
              <p class="p_3" v-text="item['createtime']"></p>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div class="article-content-box">
      <div id="TopRight">
        <button class="output" @click="outputJson">导出</button>
        <a href=""></a>

        <router-link to="login" class="output">登录</router-link>
      </div>
      <div id="right">
        <input
          type="text"
          placeholder="请输入标题"
          id="TextBoxTitle"
          v-model="notebookTitle"
        />
        <hr />
        <textarea
          name="reworkmes"
          placeholder="请输入内容"
          id="txtContent"
          style="overflow: auto"
          v-model="notebookContent"
        ></textarea>
      </div>
    </div>
  </div>

  <MoveToFolder
    v-if="IsShowMoveToFolder"
    :folderList="folders"
    :check_list="check_id_list"
    :server_url="server_url"
    @some-event="IsShowMoveToFolder = false"
  >
  </MoveToFolder>
</template>

<script>
import MoveToFolder from "@/components/pc/MoveToFolder.vue";
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
  components: {
    MoveToFolder,
  },
  data: function () {
    return {
      notebookContent: "",
      notebookTitle: "",
      lastTime: 0,
      NoteBookList: [],
      checkId: 0, //用来指示当前选中的是哪一篇笔记
      nums: true, //计数器，用来标识只执行一次的填充
      times: 0, // 时间戳
      set_timeout: (() => {}, 1000),
      checkBtnCheckedList: [], // 用来保存被选中的文章的id, 以布尔值存储
      check_id_list: [], //用来保存被选中的文章的id,只存储 已选中的id
      check_bool: false, //当checkBtnCheckedList 的值全为false，check——bool为false

      folderChecked: { folderId: -2, folderName: "所有笔记" },
      IsShowMoveToFolder: false, // 是否显示移动文件夹的悬浮窗
    };
  },
  watch: {
    notebookContent: function (newVal, oldVal) {
      // 保证节流的最后一次能触发
      // 新旧值不同，说明发生了修改，执行保存
      if (newVal != oldVal) {
        if (parseInt(new Date().getTime() / 1000) - this.times < 3) {
          clearTimeout(this.set_timeout);
          this.set_timeout = setTimeout(() => {
            // 完成了节流的最后一次修改
            this.save();
          }, 3000);

          // 3秒内修改不提交 ,并且刷新settimeout
          return;
        }
        this.times = parseInt(new Date().getTime() / 1000);
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
    // 根据输入的folderid 来进行视图的切换
    changeFolder: function (folderId, folderName) {
      this.getindex = folderId;
      this.folderChecked = { folderId: folderId, folderName: folderName };
      const that = this;
      if (folderName == "全部笔记") {
        this.getAllArticle();
        return;
      }
      if (folderName == "未分类") {
        axios.get(`${this.server_url}/articles?folderid=-1`).then((results) => {
          that.NoteBookList = results.data.data; // 查询回来的数据可以直接使用
          that.QueryTopArticle();
        });
        return;
      }
      this.folderChecked = { folderId: folderId, folderName: folderName };

      axios
        .get(`${this.server_url}/articles?folderid=${folderId}`)
        .then((result) => {
          if (result.data.status == "查询成功") {
            const article_list = result.data.data;
            that.NoteBookList = article_list;
            that.QueryTopArticle();
          }
        });
    },
    // 导出0
    outputJson: function () {
      alert("导出功能已停用");
    },

    // closeMoveCallback 根据emit事件关闭 文件夹移动框
    closeMoveCallback: function () {
      console.log("closer");
      this.IsShowMoveToFolder = false;
    },
    // all复选按钮改变事件
    check_change: function () {
      let that = this;
      for (let i = 0; i < that.checkBtnCheckedList.length; i++) {
        if (that.checkBtnCheckedList[i] == true) {
          that.check_bool = true;
        } else if (i == that.checkBtnCheckedList.length - 1) {
          that.check_bool = false;
        }
      }

      for (let i = 0; i < this.checkBtnCheckedList.length; i++) {
        if (this.checkBtnCheckedList[i] == true) {
          // 如果 该id 不存在于列表，则添加进去,因为每次change 会重复扫描
          if (
            this.check_id_list.indexOf(this.NoteBookList[i].Notebookid) == -1
          ) {
            this.check_id_list.push(this.NoteBookList[i].Notebookid); // 将id值添加到列表
          }
        } else {
          // 如果该id不存在，不必管，如果存在，删去
          this.check_id_list.splice(i, 1);
        }
      }
    },
    // 将选中的内容删除
    delete_content: function () {
      let that = this;
      //  checkBtnCheckedList 这个数组只根据NoteBookList的索引保存了布尔值数组，此处为了数据库转换方便，将其转换为notebookid的数组，
      //  只保留值为true的id
      let del_object = { del_sql_notebookid_list: this.check_id_list }; // 此数组中存放的id为数据库显示的id，比NoteBookList 的id +1

      console.log(this.check_id_list);
      axios.post(`${this.server_url}/delContent`, del_object).then((res) => {
        if (res == null) {
          console.error("res is null!");
        }
        // 清除选中
        that.checkBtnCheckedList = [];
        that.check_bool = false;
        // 重新填充左边
        that.getAllArticle();
      });
    },
    // 将内容保存到云
    save: function () {
      if (this.NoteBookList == []) {
        return;
      }

      let that = this;
      // 完成之后修改NoteBookList左边显示的值

      that.NoteBookList.forEach((element) => {
        if (element.Notebookid == that.checkId) {
          //  如果新旧值相同，不必提交到服务器

          // 此处foreach 是防止因为查询单篇文章更改 watch 导致重复触发网络请求
          if (
            element.content == that.notebookContent &&
            element.title == that.notebookTitle
          ) {
            // 清除时间戳，不然会导致立即打字不会同步到左边，因为watch已经被触发过了。
            that.times = 0;
            return;
          }

          element.content = that.notebookContent;
          element.title = that.notebookTitle;

          // 提交到服务器
          axios
            .post(this.server_url + "/updateContent", {
              Notebookid: this.checkId,
              content: this.notebookContent,
              title: this.notebookTitle,
            })
            .then(function (response) {
              if (response.data != "修改成功") {
                console.error("修改出现错误！请检查！");
              }
            });
        }
      });
    },
    // 获取所有的文章信息并且渲染视图
    getAllArticle: function () {
      let that = this;
      axios.get(this.server_url + "/articles").then(
        function (response) {
          that.NoteBookList = response.data;
          that.QueryTopArticle();
          that.$nextTick(function () {
            // document.getElementById("left").scrollTop = 1000000;
          });
        },
        function (err) {
          console.log(err);
        }
      );
    },
    // 根据id查询标题和内容
    byIdSelContent: function (Notebookid) {
      // 如果文章列表为空。停止查询
      if (this.NoteBookList.length == 0) {
        return;
      }

      let that = this;
      axios
        .post(this.server_url + "/byIdSelContent", {
          id: Notebookid,
        })
        .then(function (response) {
          if (response.data == null || response.data == []) {
            console.error("接口返回的数据为空");
            return;
          }

          that.checkId = response.data[0].Notebookid;
          that.notebookContent = response.data[0].content;
          that.notebookTitle = response.data[0].title;
        })
        .catch(function (error) {
          console.log(error);
        });

      this.$nextTick(function () {
        // that.check_submit = true; //接触save方法的禁用
      });
    },
    // 添加新文章
    addNewNotebook: function () {
      let that = this;
      this.save();
      axios
        // 在发起请求时，传给后端此时的folderid
        .post(`${this.server_url}/articles`, {
          folderid: this.folderChecked.folderId,
        })
        .then(function (result) {
          const newArticle = result.data.data.articleInfo;
          that.checkId = newArticle.Notebookid;
          that.notebookContent = "";
          that.notebookTitle = "";
          //返回的是只有一个元素的数组，还是需要用下标0取
          that.NoteBookList.push(newArticle);
          // 滚动条到底
          that.$nextTick(function () {
            document.getElementById("left").scrollTop = 1000000;
          });
        })
        .catch(function (error) {
          console.log(error);
        });
    },
    // 查询列表中的第一篇文章
    QueryTopArticle: function () {
      // 如果文章列表为空。停止查询
      if (this.NoteBookList.length != 0) {
        // 将第一篇文章内容查询
        this.byIdSelContent(this.NoteBookList[0].Notebookid);
      }
    },
  },
  // 页面加载时执行
  created: function () {
    // 测试token 是否有效
    axios
      .get(`${this.server_url}/testToken`)
      .then((results) => {})
      .catch((err) => {
        this.$router.push("/login"); // 出现
      });

    this.getAllArticle();
  },
};
</script>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;
#notebook-box {
  background-color: #125677;
  height: 100vh;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0px 20px;
  position: relative;
  z-index: 1;
  #folder {
    flex-shrink: 0;
    width: 140px;
    height: 865px;
    background-color: white;
    border-radius: $radius;
    padding: 20px 20px;
    display: flex;
    flex-flow: column nowrap;
    align-items: flex-start;
    .addFolderBtn {
      background: #255475;
      border: 0;
      font-size: large;
      border-radius: 5px;
      padding: 5px 5px;
      color: white;
    }
    .addFolderBtn:hover {
      background-color: #55a6fb;
    }
    ul {
      list-style: none;
      display: flex;
      flex-flow: column nowrap;

      li {
        border: 0px;
        line-height: 40px;
        width: 100%;

        button {
          background: 0%;
          border: 0px;
        }
      }
    }
  }

  .article-list-box {
    margin-left: 20px;
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
      height: 785px;
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

  .article-content-box {
    min-width: 400px;
    height: $box-height;
    margin-left: 22px;
    flex-grow: 4;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    #right {
      height: 785px;
      border-bottom: 0px;
      background-color: azure;
      background-color: white;
      border-radius: $radius;
      #TextBoxTitle {
        width: 100%;
        flex-grow: 4;
        height: 35px;
        font-weight: 400;
        font-size: 24px;
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
        font-size: 18px;
        font-family: "微软雅黑";
        border: 1px solid gray;
        border-radius: 5px;
        outline: none;
        border: none;
      }
    }

    #TopRight {
      width: 100%;
      height: 100px;
      background-color: azure;
      top: 0px;
      left: 265px;
      border-radius: $radius;

      background-color: white;

      .output {
        margin: 20px 20px 0 0;
        float: right;
        text-decoration: none;
        color: black;
        border: 0px;
        background: 0%;
        font-size: large;
      }

      .output:hover {
        color: cadetblue;
      }
    }
  }
}

.buttonchecked {
  background-color: #c0c0c0;
}
</style>
