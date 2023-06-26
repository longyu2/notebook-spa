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
};
</script>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;
#notebook-box {
  background-color: #d0c0c0;
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
