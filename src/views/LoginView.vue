<template>
  <div id="Log" style="width: 500px" v-show="isloginShow">
    <p class="headp" style="color: #ff6700">
      <span>登录</span>
    </p>

    <div id="reg-mid">
      <p class="text" style="text-align: left">用户名：</p>
      <p><input type="text" id="TextBox1" class="tx" /></p>

      <p class="text" style="text-align: left">密码：</p>
      <p><input type="password" id="TextBox2" class="tx" /></p>

      <p>
        <input
          type="button"
          id="BtnLogin"
          class="tx"
          value="登录"
          @click="login_click()"
        />
      </p>
      <p>
        <a>忘记密码？</a>
      </p>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  data() {
    return {
      isloginShow: true,
    };
  },
  methods: {
    login_click: () => {
      console.log("click");
    },
  },
};
</script>

<style>
.white {
  color: white;
}

.red {
  color: red;
}

h1 {
  color: #d2d2d2;
}

#shang {
  width: 100%;
  height: 100px;
}

#Log {
  border: 10px solid black;
  margin: 50px auto 0px;
  background: white;
  line-height: 80px;
}

#Log p {
  position: relative;
  top: -30px;
}

#reg {
  border: 10px solid black;
  margin: 50px auto 0px;
  background: white;
  line-height: 80px;
}

#reg-mid {
  width: 400px;
  margin-left: 50px;
}

#reg-mid p {
  margin-top: 0px;
  margin-bottom: 0px;
}

.text {
  margin-top: 0px;
  height: 40px;
  position: relative;
  top: -20px;
}
.tx {
  width: 400px;
  height: 50px;
  border: 1px solid gray;
}

#BtnLogin {
  color: white;
  background: #ff6700;
  font-size: 20px;
  border: 0px;
  text-align: center;
  margin-top: 40px;
}

#BtnLogin:hover {
  background: black;
  color: whitesmoke;
}
.headp {
  font-size: 30px;
  font-family: 微软雅黑;
  margin-bottom: 0%;
  margin-left: 43%;
}
</style>
