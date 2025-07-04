<script setup lang="ts">
import axios from 'axios'
import { useRouter, useRoute } from 'vue-router'
import { server_url } from '@/assets/constants/index'
const router = useRouter()
const route = useRoute()

const _isMobile = () => {
  return navigator.userAgent.match(
    /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
  )
}

if (route.path != 'login' && route.path != 'regist' && route.path != 'show') {
  if (_isMobile()) {
    router.replace('/notebook_phone')
  } else {
    router.replace('/notebook')
  }
}
// 页面加载时执行
// 测试token 是否有效
axios.get(`${server_url}/testToken`).catch((err) => {
  router.push('/login') // 若token 过期，或者无效则跳转到 login
  console.error(err)
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
