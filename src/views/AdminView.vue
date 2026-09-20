<script setup lang="ts">
const server_url = localStorage.getItem('server_url')

import headImg from '../assets/images/head.png'
import { ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

let passwdText = ref('')

const back = () => history.back() // 返回按钮，返回前一个页面

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

const theme = ref(localStorage.getItem('theme') || 'light') // 获取本地存储的主题，默认是light
function updateTheme() {
  localStorage.setItem('theme', theme.value)
  console.log('主题已更改为：' + theme.value)

  location.reload()
}

function quit() {
  localStorage.setItem('token', '')
  router.push('/login')
}
</script>

<template>
  <div class="main-box">
    <div class="return" @click="back">
      <el-icon size="25"><ArrowLeft /></el-icon>
    </div>
    <el-avatar :size="50" :src="headImg" />

    <div class="reset-passwd-box">
      <span> 输入新密码：</span>
      <el-input class="el-input" type="text" v-model="passwdText" />
      <el-button @click="updatePasswd">修改密码</el-button>
    </div>

    <div class="select-theme-box">
      <span> 主题选择：</span>
      <el-select v-model="theme" @change="updateTheme">
        <el-option value="semiTransparent" label="半透明"></el-option>
        <el-option value="dark" label="浅色"></el-option>
        <el-option value="no" label="vditor默认"></el-option>
      </el-select>
    </div>

    <br />

    <div class="space"></div>
    <el-button @click="quit">退出登录</el-button>
  </div>
</template>

<style lang="scss" scoped>
.main-box {
  box-sizing: border-box;
  padding: 23px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-width: 300px;
  max-width: 450px;
  height: 600px;
  margin: 100px auto;
  box-shadow: 0px 0px 15px 2px rgba(0, 0, 0, 0.2);

  .reset-passwd-box {
    width: 100%;
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-input {
      width: 48%;
      height: 28px;
    }
  }

  .select-theme-box {
    width: 100%;
    margin-top: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-select {
      width: 74%;
      height: 28px;
    }
  }

  .return {
    width: 100%;
    display: flex;
    justify-content: flex-start;
    &:hover {
      cursor: hand;
    }
  }

  p,
  h3 {
    width: 100%;
    color: rgb(72, 65, 94);
    margin-top: 15px;
  }
  .space {
    flex: 1 1 auto; //可放大 可缩小
  }
}
</style>
