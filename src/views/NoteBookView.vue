<script setup>
import { ref } from "vue";
import { server_url } from "@/assets/constants/index.js";
import FolderList from "@/components/pc/FolderList.vue";
</script>

<template>
  <div id="notebook-box">
    <FolderList></FolderList>
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
  components: {
    MoveToFolder,
  },
  data: function () {
    return {
      lastTime: 0,
      checkId: 0, //用来指示当前选中的是哪一篇笔记
      nums: true, //计数器，用来标识只执行一次的填充
      times: 0, // 时间戳
      set_timeout: (() => {}, 1000),
      checkBtnCheckedList: [], // 用来保存被选中的文章的id, 以布尔值存储
      check_id_list: [], //用来保存被选中的文章的id,只存储 已选中的id
      check_bool: false, //当checkBtnCheckedList 的值全为false，check——bool为false
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
  // methods: {

  //   // all复选按钮改变事件
  //   check_change: function () {
  //     let that = this;
  //     for (let i = 0; i < that.checkBtnCheckedList.length; i++) {
  //       if (that.checkBtnCheckedList[i] == true) {
  //         that.check_bool = true;
  //       } else if (i == that.checkBtnCheckedList.length - 1) {
  //         that.check_bool = false;
  //       }
  //     }

  //     for (let i = 0; i < this.checkBtnCheckedList.length; i++) {
  //       if (this.checkBtnCheckedList[i] == true) {
  //         // 如果 该id 不存在于列表，则添加进去,因为每次change 会重复扫描
  //         if (
  //           this.check_id_list.indexOf(this.NoteBookList[i].Notebookid) == -1
  //         ) {
  //           this.check_id_list.push(this.NoteBookList[i].Notebookid); // 将id值添加到列表
  //         }
  //       } else {
  //         // 如果该id不存在，不必管，如果存在，删去
  //         this.check_id_list.splice(i, 1);
  //       }
  //     }
  //   },
  //   // 将选中的内容删除
  //   delete_content: function () {
  //     let that = this;
  //     //  checkBtnCheckedList 这个数组只根据NoteBookList的索引保存了布尔值数组，此处为了数据库转换方便，将其转换为notebookid的数组，
  //     //  只保留值为true的id
  //     let del_object = { del_sql_notebookid_list: this.check_id_list }; // 此数组中存放的id为数据库显示的id，比NoteBookList 的id +1

  //     console.log(this.check_id_list);
  //     axios.post(`${this.server_url}/delContent`, del_object).then((res) => {
  //       if (res == null) {
  //         console.error("res is null!");
  //       }
  //       // 清除选中
  //       that.checkBtnCheckedList = [];
  //       that.check_bool = false;
  //       // 重新填充左边
  //       that.getAllArticle();
  //     });
  //   },

  //   // 查询列表中的第一篇文章
  //   QueryTopArticle: function () {
  //     // 如果文章列表为空。停止查询
  //     if (this.NoteBookList.length != 0) {
  //       // 将第一篇文章内容查询
  //       this.byIdSelContent(this.NoteBookList[0].Notebookid);
  //     }
  //   },
  // },
  // 页面加载时执行
  created: function () {
    // 测试token 是否有效
    // axios
    //   .get(`${this.server_url}/testToken`)
    //   .then((results) => {})
    //   .catch((err) => {
    //     this.$router.push("/login"); // 出现
    //   });
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
}

.buttonchecked {
  background-color: #c0c0c0;
}
</style>
