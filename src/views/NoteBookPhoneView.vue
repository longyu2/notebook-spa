<script setup>
import { ref } from "vue";

// 定义响应式的checkArticleId，
let checkArticleId = ref(0);

function increaseCount(id) {
  checkArticleId.value = id; //   list通过emit传来的选中文章的id，更改它.再通过props传给content组件
}
</script>

<template>
  <router-view @submit="increaseCount" :checkArticleId="checkArticleId">
  </router-view>
</template>
