<script setup lang="ts">
import { server_url } from '../assets/constants/server_url'
import headImg from '../assets/images/head.png'
import { ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

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
      ElMessage({
        message: '密码修改成功，请重新登陆',
        type: 'success'
      })

      // 修改密码后必须重新登陆
      quit()
    })
}

function quit() {
  localStorage.setItem('token', '')
  router.push('/login')
}

function output() {}
</script>

<template>
  <div class="main-box">
    <el-avatar :size="50" :src="headImg" />

    <h3>修改密码</h3>
    <p>
      <span> 输入新密码：</span>
      <el-input class="input" type="text" v-model="passwdText" />
      <el-button @click="updatePasswd">修改</el-button>
    </p>

    <p>
      <el-button @click="output"> 批量导出 </el-button>
    </p>

    <div class="space"></div>
    <el-button @click="quit">退出登录</el-button>
  </div>
</template>

<style lang="scss" scoped>
.main-box {
  box-sizing: border-box;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 25vw;
  height: 600px;
  margin: 100px auto;
  box-shadow: 0px 0px 15px 2px rgba(0, 0, 0, 0.2);

  p,
  h3 {
    color: rgb(72, 65, 94);
    margin-top: 20px;
  }
  .space {
    flex: 1 1 auto; //可放大 可缩小
  }
  .input {
    width: 50%;
  }
}
</style>
