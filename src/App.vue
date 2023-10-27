<template>
  <router-view></router-view>
</template>

<script lang="ts">
import axios from 'axios'

axios.interceptors.request.use((config) => {
  // 添加自定义token
  config.headers.authorization = localStorage.getItem('token')
  return config
})

import { server_url } from '@/assets/constants/index'

export default {
  data() {
    return {}
  },
  methods: {
    _isMobile: function () {
      let flag = navigator.userAgent.match(
        /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
      )
      return flag
    }
  },
  created() {
    if (this.$route.path != 'login' && this.$route.path != 'regist') {
      if (this._isMobile()) {
        this.$router.replace('/notebook_phone')
      } else {
        this.$router.replace('/notebook')
      }
    }
    // 页面加载时执行
    // 测试token 是否有效
    axios
      .get(`${server_url}/testToken`)
      .then((results) => {})
      .catch((err) => {
        this.$router.push('/login') // 出现
      })
  }
}
</script>

<style>
* {
  margin: 0px;
  padding: 0px;
}
</style>
