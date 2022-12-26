<template>
  <div id="box">
    <div id="TopLeft">
      <a class="del-btn" v-if="check_bool" @click="delete_content()">删除</a>
      <div id="all-checkBox">
        <!-- <input type="checkbox" @change="allCheckButtonclick" value="全选" /> -->
        <!-- 全选 -->
      </div>
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
              v-model="check_button_list[index]"
              name=""
              class="checkbox"
              id=""
            />
          </div>

          <!-- substring做一个截取，因为左边列表宽度有限内容只能显示十几个字 -->

          <p class="p_1" v-text="item['title'].substring(0,13)"></p>
          <p class="p_2" v-text="item['content'].substring(0,15)"></p>
          <p class="p_3" v-text="item['createtime']"></p>
        </li>
      </ul>
    </div>

    <div id="TopRight">
      <a
        class="output"
        href="https://ltyis.com:9999/output.json"
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
</template>

<script>
import axios from "axios";
export default {
  data: function () {
    return {
      notebookContent: "",
      notebookTitle: "",
      lastTime: 0,
      leftArr: [],
      leftArr_re: [],
      checkId: 0, //用来指示当前选中的是哪一篇笔记
      nums: true, //计数器，用来标识只执行一次的填充
      times: 0, // 时间戳
      check_submit: false, //此值表示save方法是否可用，为false则save方法禁用
      set_timeout: (() => {}, 1000),
      server_url: "https://ltyis.com:9999",
      // server_url: "http://127.0.0.1:9999",
      check_button_list: [], // 用来保存被选中的文章的id,
      check_bool: false, //当check_button_list 的值全为false，check——bool为false
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
        if (parseInt(new Date().getTime() / 1000) - this.times < 3) {
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
    // 复选按钮改变事件
    check_change: function () {
      let that = this;
      for (let i = 0; i < that.check_button_list.length; i++) {
        if (that.check_button_list[i] == true) {
          that.check_bool = true;
          return;
        }
      }
      that.check_bool = false;
    },
  
    test: function () {
      console.log(this.check_button_list);
    },

    // 将选中的内容删除
    delete_content: function () {
      let that = this;
      //  check_button_list 这个数组只根据leftarr的索引保存了布尔值数组，此处为了数据库转换方便，将其转换为notebookid的数组，
      //  只保留值为true的id
      let del_object = { del_sql_notebookid_list: [] }; // 此数组中存放的id为数据库显示的id，比leftarr 的id +1
      for (let i = 0; i < this.check_button_list.length; i++) {
        if (this.check_button_list[i] == true) {
          del_object.del_sql_notebookid_list.push(this.leftArr[i].Notebookid);
        }
      }

      axios.post(`${this.server_url}/delContent`, del_object).then((res) => {
        // 清除选中
        that.check_button_list = [];
        that.check_bool = false;
        // 重新填充左边
        that.leftPost();
      });
    },
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
        .then(function (response) {});
    },

    // 接口返回左边列表
    leftPost: function () {
      let that = this;
      axios.get(this.server_url + "/getNotebookList").then(
        function (response) {
          that.leftArr = response.data;
          // 将第一篇文章内容查询
          that.byIdSelContent(that.leftArr[that.leftArr.length - 1].Notebookid);

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
      this.save(); // 切换时存储

      // 禁用save方法，因为查询标题和内容会改变notebookTitle和notebookContent 的值，会触发不必要的提交，在解除禁用
      this.check_submit = false;
      let that = this;
      axios
        .post(this.server_url + "/byIdSelContent", {
          id: Notebookid,
        })
        .then(function (response) {
          console.log(response.data)
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
      this.save();
      let that = this;
      axios
        .get(this.server_url + "/addnewNotebook")
        .then(function (response) {
          response.data[0].Notebookid += 1;
          that.checkId = response.data[0].Notebookid;
          that.notebookContent = "";
          that.notebookTitle = "";

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
  },

  // 页面加载时执行
  created: function () {
    this.leftPost();
  },
};
</script>

<style>
.output {
  margin: 20px 20px 0 0;
  float: right;
  text-decoration: none;
  color: black;
}

.checkbox {
  margin: 5px 5px;
  z-index: 2;
}

.output:hover {
  color: cadetblue;
}

li:hover {
  background-color: burlywood;
}

.del-btn {
  position: absolute;
  top: 7px;
  left: 7px;
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

#ImageButtonAdd {
  height: 50px;
  width: 50px;
  position: absolute;
  left: 170px;
  top: 8px;
}

#all-checkBox {
  position: absolute;
  top: 45px;
  left: 5px;
}
</style>
