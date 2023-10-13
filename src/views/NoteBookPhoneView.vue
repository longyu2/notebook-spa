<script setup>
import { ref } from "vue";
import FolderList from "../components/phone/FolderList.vue";

// 定义响应式的checkArticleId，
let checkArticleId = ref(0);

function increaseCount(id) {
  checkArticleId.value = id; //   list通过emit传来的选中文章的id，更改它.再通过props传给content组件
}
</script>

<!-- <template>
  <router-view @submit="increaseCount" :checkArticleId="checkArticleId">
  </router-view>
</template> -->

<template>
  <div class="phone-box">
    <div class="config-icon">
      <van-icon name="setting-o" size="30" />
    </div>
    <FolderList></FolderList>
  </div>
</template>

<style lang="scss" scoped>
.phone-box {
  width: 100%;
  height: 100%;
}
.config-icon {
  box-sizing: border-box;
  padding: 3vw;
  display: flex;
  justify-content: flex-end;
}
</style>
