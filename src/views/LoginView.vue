<script setup lang="ts">
import { server_url } from '@/assets/constants/index'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
let isloginShow = ref(true)
let username = ref('')
let userpwd = ref('')

// 回车自动提交
const keyUpEnter = () => {
  login_click()
}

const login_click = () => {
  axios
    .post(`${server_url}/session`, {
      username: username.value,
      passwd: userpwd.value
    })
    .then((results) => {
      if (results.data.status == '成功') {
        localStorage.setItem('token', results.data.data.token) // 将token 存储
        localStorage.setItem('user', JSON.stringify(results.data.data.user))

        ElMessage({
          message: '登录成功',
          type: 'success'
        })
        router.push({ path: '/' })
      } else {
        ElMessage.error('登录失败，用户名或密码错误！')
      }
    })
}
</script>

<template>
  <div @touchmove.prevent class="login-contanier">
    <div class="login-box">
      <div class="login-content">
        <h3>登录</h3>
        <p>用户名：</p>

        <el-input class="el-input" v-model="username" placeholder="Please input" />
        <p>密码：</p>

        <el-input
          class="el-input"
          v-model="userpwd"
          type="password"
          placeholder="Please input password"
          show-password
          v-on:keyup.enter="keyUpEnter"
        />
        <el-button class="login-btn" type="success" @click="login_click()">登录</el-button>
        <a class="forget" href="">忘记密码? </a>
        <router-link to="regist" class="forget">没有账号？去注册</router-link>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
* {
  margin: 0%;
  padding: 0%;
}
p,
a,
h3 {
  color: white;
}

@media screen and (min-width: 800px) {
  .login-contanier {
    height: 100vh;
    background-image: url('@/assets/images/187.jpg');
    background-size: cover;
    justify-content: center;
    display: flex;

    .login-box {
      position: relative;
      z-index: 4;
      width: 400px;
      height: 500px;
      margin-top: 200px;
      margin-left: 600px;
      .login-content {
        padding: 20px 30px;
        position: relative;
        width: 400px;
        height: 350px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-around;
        z-index: 99;

        .login-btn {
          margin-top: 10px;
          width: 70px;
        }
        .el-input {
          color: fdfs;
        }
        .forget {
          font-size: small;
          font-weight: 400;
        }
      }
    }
    .login-box::after {
      /* 必须要写的属性 content */
      content: '';
      padding: 20px 30px;
      background-color: black;
      opacity: 27%;
      width: 400px;
      height: 400px;
      z-index: 3;
      position: absolute;
      top: 0px;
      border-radius: 20px;
    }
  }
}

@media screen and (max-width: 800px) {
  .login-contanier {
    height: 100vh;
    background-image: url('@/assets/images/187.jpg');
    background-size: cover;
    justify-content: center;
    display: flex;

    .login-box {
      margin-top: 150px;
      z-index: 4;
      width: 80vw;
      height: 90vw;
      display: flex;
      justify-content: center;
      .login-content {
        width: inherit;
        height: inherit;
        padding: 20px 30px;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: space-around;
        z-index: 99;

        .login-btn {
          margin-top: 10px;
          width: 70px;
        }
        .el-input {
          color: fdfs;
        }
        .forget {
          font-size: small;
          font-weight: 400;
        }
      }
    }
    .login-box::after {
      /* 必须要写的属性 content */
      content: '';
      padding: 20px 30px;
      background-color: black;
      opacity: 27%;
      width: 80vw;
      height: 50vh;
      z-index: 3;
      position: absolute;
      top: 10vh;
      border-radius: 20px;
    }
  }
}
</style>
