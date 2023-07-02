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
</script>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;
#notebook-box {
  background-color: skyblue;
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
