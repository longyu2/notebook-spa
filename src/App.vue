<script setup lang="ts">
import axios from 'axios'
import { useRouter } from 'vue-router'
const server_url = localStorage.getItem('server_url')

const router = useRouter()

/* 页面加载时测一下 token 还有没有效，失效就回登录页。

   两个必须收住的口子（否则公开页会被顶掉）：
   1) 没有 token 时（公开页的匿名访客）这个请求必然失败，
      而失败就 push('/login') 会把刚打开的公开页立刻顶走 —— 所以干脆不发。
   2) 已经在免登录页面上时也别跳，免得在公开页里被弹走。 */
const token = localStorage.getItem('token')
const OPEN_PATHS = ['/login', '/regist', '/public']

if (token) {
  axios.get(`${server_url}/testToken`).catch(() => {
    const path = router.currentRoute.value.path
    const onOpenPage = OPEN_PATHS.some(
      (p) => path === p || path.startsWith(p + '/')
    )
    if (!onOpenPage) {
      router.push('/login') // 若token 过期，或者无效则跳转到 login
    }
  })
}
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
