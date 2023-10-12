<script setup>
import { ref } from "vue";
import FolderList from "../components/pc/FolderList.vue";

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
    <FolderList></FolderList>
  </div>
</template>

<style lang="scss" scoped>
.phone-box {
  width: 100%;
  height: 100%;
}
</style>
