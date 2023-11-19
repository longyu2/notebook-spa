<script setup lang="ts">
import { server_url } from '@/assets/constants/index'
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
let second = ref('60s 后重发')

// 发送验证码后倒计时才可发送第二次
function Countdown() {
  second.value = '60s 后重发' // 每点击一次重发按钮则开始计时
  regstEnable.value = false

  let interval = setInterval(() => {
    second.value = (parseInt(second.value) - 1).toString() + 's 后重发'
    if (second.value == '0s 后重发') {
      regstEnable.value = true
      second.value = '重新发送'
      clearInterval(interval)
    }
  }, 1000)
}

const router = useRouter()
let regstEnable = ref(true)
let username = ref('')
let userpwd = ref('')
let verify_passwd = ref('')
let email = ref('')
let IsPasswordVerify = true // 表示两次输入密码是否一致
let verify_code_input = ref('')
let show_input_verify_code = ref(false)

watch(verify_passwd, (newValue, oldValue) => {
  if (newValue == userpwd.value) {
    IsPasswordVerify = true
  } else {
    IsPasswordVerify = false
  }
})

function regist() {
  const obj = {
    username: username.value,
    userpwd: userpwd.value,
    email: email.value,
    verify: ''
  }

  if (username.value == '') {
    ElMessage.error('用户名不能为空')
    return
  }

  if (userpwd.value == '') {
    ElMessage.error('密码不能为空')
    return
  }
  if (verify_passwd.value == '') {
    ElMessage.error('请确认密码')
    return
  }

  if (email.value == '') {
    ElMessage.error('邮箱不能为空')
    return
  }

  // 显示输入验证码的框，开始倒计时
  Countdown()
  show_input_verify_code.value = true
  ElMessage({
    message: '验证码已发送，请前往邮箱查看',
    type: 'success'
  })

  axios.post(`${server_url}/user`, obj).then(() => {})
}
function verify_regist() {
  const obj = {
    username: username.value,
    userpwd: userpwd.value,
    email: email.value,
    verify: verify_code_input.value
  }

  axios.post(`${server_url}/user`, obj).then((data) => {
    ElMessage({
      message: '注册成功！',
      type: 'success'
    })
    router.push('/login')
  })
}
</script>

<template>
  <div @touchmove.prevent class="login-contanier">
    <div class="login-box">
      <div class="login-content">
        <h3>注册用户</h3>
        <p>用户名：</p>

        <el-input class="el-input" v-model="username" placeholder="Please input" />
        <p>密码：</p>

        <el-input
          class="el-input"
          v-model="userpwd"
          type="password"
          placeholder="Please input password"
          show-password
        />

        <p>确认密码：</p>

        <el-input
          class="el-input"
          v-model="verify_passwd"
          type="password"
          placeholder="Please input"
        />
        <p style="color: red" v-if="!IsPasswordVerify">两次输入密码不一致</p>

        <p>请输入电子邮箱</p>
        <el-input class="el-input" v-model="email" placeholder="Please input" />

        <el-button class="login-btn" type="success" :disabled="!regstEnable" @click="regist()"
          >注册</el-button
        >

        <div v-if="show_input_verify_code">
          <span> 请输入验证码 </span>
          <el-input v-model="verify_code_input"></el-input>
          <el-button @click="verify_regist"> 确认 </el-button>
          <el-button @click="regist" :disabled="!regstEnable"> {{ second }} </el-button>
        </div>
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
h3,
span {
  color: white;
}

@media screen and (min-width: 600px) {
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
      height: 900px;
      margin-top: 150px;
      margin-left: 600px;
      .login-content {
        padding: 20px 30px;
        position: relative;
        width: 400px;
        height: 450px;
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
      height: 500px;
      z-index: 3;
      position: absolute;
      top: 0px;
      border-radius: 20px;
    }
  }
}

@media screen and (max-width: 600px) {
  .login-contanier {
    height: 100vh;
    background-image: url('@/assets/images/187.jpg');
    background-size: cover;
    justify-content: center;
    display: flex;
    .login-box {
      margin-top: 50px;
      z-index: 4;
      width: 80vw;
      height: 110vw;
      display: flex;
      justify-content: center;
      &::after {
        /* 必须要写的属性 content */
        content: '';
        padding: 20px 30px;
        background-color: black;
        opacity: 27%;
        width: 80vw;
        height: 70vh;
        z-index: 3;
        position: absolute;
        top: 5vh;
        border-radius: 20px;
      }
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
  }
}
</style>
