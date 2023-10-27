<template>
  <router-view></router-view>
</template>

<script lang="ts">
import axios from 'axios'

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
        alert('toke验证失败l')
        this.$router.push('/login') // 若token 过期，或者无效则跳转到 login
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
