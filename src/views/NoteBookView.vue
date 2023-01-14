<template>
  <div id="notebook-box">
    <div id="folder">
      <p>文件夹</p>
      <button @click="createFolder">新建文件夹</button>

      <ul>
        <li v-for="item in folders" :key="item.id">
          <button>X</button>
          {{ item.folder_name }}
        </li>
      </ul>
    </div>

    <div class="article-list-box">
      <div id="TopLeft">
        <div class="isChecked-area">
          <a class="del-btn" v-if="check_bool" @click="delete_content()"
            >删除</a
          >

          <span
            class="move-btn"
            v-if="check_bool"
            @click="IsShowMoveToFolder = true"
            >移动到...</span
          >
        </div>

        <!-- <div id="all-checkBox">
          <input type="checkbox" @change="allCheckButtonclick" value="全选" /> 
            全选 
        </div> -->
        <img
          id="ImageButtonAdd"
          @click="addNewNotebook"
          src="@/assets/addNewNoteBook.svg"
          alt=""
        />
      </div>

      <div id="left">
        <ul id="List-ul">
          <li
            v-for="(item, index) in leftArr"
            :key="index"
            @click="byIdSelContent(item['Notebookid'])"
          >
            <div style="float: left">
              <input
                type="checkbox"
                @change="check_change()"
                v-model="checkBtnCheckedList[index]"
                name=""
                class="checkbox"
                id=""
              />
            </div>

            <!-- substring做一个截取，因为左边列表宽度有限内容只能显示十几个字 -->

            <p class="p_1" v-text="item['title'].substring(0, 13)"></p>
            <p class="p_2" v-text="item['content'].substring(0, 15)"></p>
            <p class="p_3" v-text="item['createtime']"></p>
          </li>
        </ul>
      </div>
    </div>

    <div class="article-content-box">
      <div id="TopRight">
        <a
          class="output"
          :href="`${server_url}/output.json`"
          download="output.txt"
          >导出</a
        >
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
import MoveToFolder from "../components/MoveToFolder.vue";

import Vditor from "vditor";
import axios from "axios";
import { getTransitionRawChildren } from "vue";

export default {
  components: {
    MoveToFolder,
  },
  data: function () {
    return {
      notebookContent: "",
      notebookTitle: "",
      lastTime: 0,
      leftArr: [],
      checkId: 0, //用来指示当前选中的是哪一篇笔记
      nums: true, //计数器，用来标识只执行一次的填充
      times: 0, // 时间戳

      set_timeout: (() => {}, 1000),
      // server_url: "https://note.misaka-mikoto.cn:9999",
      server_url: "http://127.0.0.1:9999",

      checkBtnCheckedList: [], // 用来保存被选中的文章的id, 以布尔值存储
      check_id_list: [], //用来保存被选中的文章的id,只存储 已选中的id
      check_bool: false, //当checkBtnCheckedList 的值全为false，check——bool为false

      folders: [],
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
    // closeMoveCallback
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
          if (this.check_id_list.indexOf(this.leftArr[i].Notebookid) == -1) {
            this.check_id_list.push(this.leftArr[i].Notebookid); // 将id值添加到列表
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
      //  checkBtnCheckedList 这个数组只根据leftarr的索引保存了布尔值数组，此处为了数据库转换方便，将其转换为notebookid的数组，
      //  只保留值为true的id
      let del_object = { del_sql_notebookid_list: this.check_id_list }; // 此数组中存放的id为数据库显示的id，比leftarr 的id +1

      console.log(this.check_id_list);
      axios.post(`${this.server_url}/delContent`, del_object).then((res) => {
        if (res == null) {
          console.error("res is null!");
        }
        // 清除选中
        that.checkBtnCheckedList = [];
        that.check_bool = false;
        // 重新填充左边
        that.leftPost();
      });
    },

    // 将内容保存到云
    save: function () {
      if (this.leftArr == []) {
        return;
      }

      let that = this;
      // 完成之后修改leftarr左边显示的值
      that.leftArr.forEach((element) => {
        if (element.Notebookid == that.checkId) {
          //  如果新旧值相同，不必提交到服务器
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

    // 接口返回左边列表(包括所有的文章信息)
    leftPost: function () {
      let that = this;
      axios.get(this.server_url + "/getNotebookList").then(
        function (response) {
          that.leftArr = response.data;

          // 如果文章列表为空。停止查询
          if (that.leftArr.length != 0) {
            // 将第一篇文章内容查询
            console.log(that.leftArr);
            that.byIdSelContent(that.leftArr[0].Notebookid);
          }

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
      if (this.leftArr.length == 0) {
        return;
      }

      let that = this;
      axios
        .post(this.server_url + "/byIdSelContent", {
          id: Notebookid,
        })
        .then(function (response) {
          if (response.data == null) {
            console.error("接口返回的数据为空");
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
      console.log(`checkid:${that.checkId}`);

      axios
        .get(this.server_url + "/addnewNotebook")
        .then(function (response) {
          response.data[0].Notebookid += 1;
          that.checkId = response.data[0].Notebookid;

          console.log(`checkid:${that.checkId}`);
          that.notebookContent = "";
          that.notebookTitle = "";

          if (response.data == null) {
            console.error("接口返回数据为空");
          }

          //返回的是只有一个元素的数组，还是需要用下标0取
          that.leftArr.push(response["data"][0]);

          // 滚动条到底
          that.$nextTick(function () {
            // document.getElementById("left").scrollTop = 1000000;
          });
        })
        .catch(function (error) {
          console.log(error);
        });
    },
    // 新建文件夹
    createFolder: function () {
      const name = prompt("请输入文件夹名");

      axios
        .post(`${this.server_url}/CreateFolder`, {
          folder_name: name,
        })
        .then((res) => {
          console.log(res.data);
          this.folders.push(res.data[0]);
        });
    },
  },

  // 页面加载时执行
  created: function () {
    this.leftPost();

    // 填充文件夹
    axios.get(`${this.server_url}/QueryFolder`).then((res) => {
      this.folders = res.data;
    });
  },
};
</script>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height :805px;

#notebook-box {
  height: 100vh;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0px 20px;
  position: relative;
  z-index: 1;
  #folder {
    flex-shrink:0;

    width: 200px;
    height: $box-height;
    background-color: white;
    border-radius: $radius;
    padding: 0%;
    display: flex;
    flex-flow: column nowrap;
    align-items: flex-start;

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
      width: 245px;
      height: 70px;

      border-radius: 0;
      background-color: white;
      border-radius: $radius;
      display: flex;
      justify-content: center;
      flex-direction: row;
      align-items: center;

      .isChecked-area {
        width: 180px;

        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;

        .del-btn {
          margin-left: 15px;
          height: 30px;
          color: white;
          background-color: cornflowerblue;
          padding: 5px 10px;
          font-size: 18px;
          border: 0ch;
          border-radius: 5px;
        }

        .del-btn:hover {
          background-color: crimson;
        }

        .move-btn {
          height: 30px;
          margin-left: 20px;

          color: white;
          background-color: cornflowerblue;
          padding: 5px 10px;
          font-size: 18px;
          border: 0ch;
          border-radius: 5px;
        }
      }

      #ImageButtonAdd {
        margin-left: 10px;

        height: 50px;
        width: 50px;
      }
    }

    #left {
      padding: 0px;
      height: 715px;
      width: 245px;

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
        height: 90px;
        padding-top: 12px;
        padding-left: 5px;

        p {
          line-height: 12px;
          height: 14px;
        }

        .p_1 {
          font-size: 14px;
          margin-left: 30px;
          margin-top: 5px;
        }

        .p_2 {
          font-size: 12px;
          margin-left: 30px;
        }

        .p_3 {
          font-size: 12px;
          margin-left: 30px;
          color: gray;
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
    min-width:400px;
    height: $box-height;
    margin-left: 22px;
    flex-grow: 4;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    #right {
      height: 715px;
      border-bottom: 0px;
      background-color: azure;
      background-color: white;
      border-radius: $radius;
      
    
      #TextBoxTitle {
        flex-grow: 4;
        height: 35px;
        font-weight: 400;
        font-size: 30px;
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
        font-size: 20px;
        font-family: "微软雅黑";
        border: 1px solid gray;
        border-radius: 5px;
        outline: none;
        border: none;
      }
    }

    #TopRight {
      width: 100%;
      height: 70px;
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
      }

      .output:hover {
        color: cadetblue;
      }
    }
  }
}
</style>
