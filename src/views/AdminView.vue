<template>
  <div>
    修改密码 输入新密码：
    <input type="text" v-model="passwdText" />
    <button @click="updatePasswd">修改</button>

    <p>
      <button @click="quit">退出登录</button>
    </p>
  </div>
</template>

<script setup>
import { server_url } from "../assets/constants/server_url";
import { ref } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";
const router = useRouter();
// 请求拦截, 给axios 添加请求头，设置token
axios.interceptors.request.use(
  (config) => {
    // 添加自定义token
    config.headers.authorization = localStorage.getItem("token");
    return config;
  },
  (error) => {
    return Promise.error(error);
  }
);
let passwdText = ref("");

function updatePasswd() {
  axios
    .post(`${server_url}/passwd`, {
      username: "admin",
      passwd: passwdText.value,
    })
    .then((data) => {
      if (data.data.data == "修改成功") localStorage.setItem("token", "");
      console.log("成功");
    });
}

function quit() {
  localStorage.setItem("token", "");
  router.push("/login");
}
</script>

<style></style>
