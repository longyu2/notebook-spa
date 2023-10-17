<script setup lang="ts">
import { server_url } from '../assets/constants/server_url'
import headImg from '../assets/images/head.png'
import { ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
const router = useRouter()
// 请求拦截, 给axios 添加请求头，设置token
axios.interceptors.request.use((config) => {
  // 添加自定义token
  config.headers.authorization = localStorage.getItem('token')
  return config
})
let passwdText = ref('')

function updatePasswd() {
  axios
    .post(`${server_url}/passwd`, {
      username: 'admin',
      passwd: passwdText.value
    })
    .then((data) => {
      if (data.data.data == '修改成功') localStorage.setItem('token', '')
      console.log('成功')
    })
}

function quit() {
  localStorage.setItem('token', '')
  router.push('/login')
}
</script>

<template>
  <div class="main-box">
    <el-avatar :size="50" :src="headImg" />

    <div>
      <p>修改密码</p>

      输入新密码：

      <p>
        <el-input type="text" v-model="passwdText" />
        <el-button @click="updatePasswd">修改</el-button>
      </p>
    </div>

    <p>
      <el-button @click="quit">退出登录</el-button>
    </p>
  </div>
</template>

<style lang="scss" scoped>
.main-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-around;
  width: 25vw;
  height: 600px;
  margin: 100px auto;
  box-shadow: 0px 0px 15px 2px rgba(0, 0, 0, 0.2);
}
</style>
