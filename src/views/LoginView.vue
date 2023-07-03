<script setup>
import { server_url } from "@/assets/constants/index.js";
</script>

<template>
  <div @touchmove.prevent class="login-contanier">
    <div class="login-box">
      <div class="login-content">
        <h3>登录</h3>
        <p>用户名：</p>

        <el-input
          class="el-input"
          v-model="username"
          placeholder="Please input"
        />
        <p>密码：</p>

        <el-input
          class="el-input"
          v-model="userpwd"
          type="password"
          placeholder="Please input password"
          show-password
        />
        <el-button class="login-btn" type="success" @click="login_click()"
          >登录</el-button
        >
        <a class="forget" href="">忘记密码? </a>
        <router-link to="regist" class="forget">没有账号？去注册</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import axios from "axios";
export default {
  data() {
    return {
      isloginShow: true,
      username: "",
      userpwd: "",
    };
  },
  methods: {
    login_click() {
      axios
        .post(`${server_url}/session`, {
          username: this.username,
          passwd: this.userpwd,
        })
        .then((results) => {
          if (results.data.status == "成功") {
            localStorage.setItem("token", results.data.data.token); // 将token 存储
            localStorage.setItem(
              "user",
              JSON.stringify(results.data.data.user)
            );
            this.$router.push({ path: "/" });
          } else {
            alert("登录失败！");
          }
        });
    },
  },
};
</script>

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
    background-image: url("@/assets/images/187.jpg");
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
      content: "";
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

@media screen and (max-width: 400px) {
  .login-contanier {
    height: 100vh;
    background-image: url("@/assets/images/187.jpg");
    background-size: cover;
    justify-content: center;
    display: flex;
    .login-box {
      margin-top: 50px;
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
      content: "";
      padding: 20px 30px;
      background-color: black;
      opacity: 27%;
      width: 80vw;
      height: 110vw;
      z-index: 3;
      position: absolute;
      top: 5px;
      border-radius: 20px;
    }
  }
}
</style>
