<script setup lang="ts">
import axios from 'axios'
import { useRouter } from 'vue-router'
import { server_url } from '@/assets/constants/index'
const router = useRouter()

// 页面加载时执行
// 测试token 是否有效
axios.get(`${server_url}/testToken`).catch((err) => {
  router.push('/login') // 若token 过期，或者无效则跳转到 login
})
</script>
<template>
  <router-view></router-view>
</template>

<style>
* {
  margin: 0px;
  padding: 0px;
}
</style>
