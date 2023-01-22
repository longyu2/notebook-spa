<template>
  <div id="Log-box">
    <h2 style="color: #ff6700">登录</h2>
    <div class="middle">
      <p class="text" style="text-align: left">用户名：</p>
      <input type="text" v-model="username" class="input" />

      <p class="text">密码：</p>

      <input type="password" v-model="userpwd" id="TextBox2" class="input" />

      <button id="BtnLogin" @click="login_click()">Login</button>

      <span>忘记密码</span>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  props: ["server_url"],
  data() {
    return {
      isloginShow: true,
      username: "",
      userpwd: "",
    };
  },
  methods: {
    login_click() {
      console.log(this.server_url);
      axios
        .post(`${this.server_url}/login`, {
          username: this.username,
          userpwd: this.userpwd,
        })
        .then((results) => {
          localStorage.setItem("token", results.data.data.token); // 将token 存储
        });
    },
  },
};
</script>

<style lang="scss">
* {
  margin: 0%;
  padding: 0%;
}
.white {
  color: white;
}

.red {
  color: red;
}

#Log-box {
  width: 380px;
  padding: 50px 30px;
  border: 1px solid black;
  margin: 100px auto;
  background: white;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  border-radius: 20px;
  h1 {
    margin: 0%;
  }
  .middle {
    margin: 0%;
    display: flex;
    flex-direction: column;
    justify-content: center;

    align-items: flex-start;

    .text {
      margin-top: 30px;
      font-size: medium;
    }
    .input {
      margin-top: 10px;
      width: 270px;
      height: 45px;
      border-radius: 15px;
      border: 1px solid slateblue;
      padding-left: 15px;
    }

    #BtnLogin {
      margin-top: 60px;
      color: white;
      background: #ff6700;
      font-size: 16px;
      border: 0px;
      width: 290px;
      height: 45px;
      border-radius: 15px;
    }

    #BtnLogin:hover {
      background: orange;
      color: whitesmoke;
    }

    span {
      margin-top: 30px;
    }
  }
}
</style>
