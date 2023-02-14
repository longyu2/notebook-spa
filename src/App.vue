<template>
  <router-view :server_url="server_url"></router-view>
</template>

<script>
export default {
  data() {
    return {
      server_url: "http://127.0.0.1:9999/v1",
      // server_url: "https://note.misaka-mikoto.cn:9999/v1",
    };
  },
  methods: {
    _isMobile: function () {
      let flag = navigator.userAgent.match(
        /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
      );
      return flag;
    },
  },
  created() {
    if (this._isMobile()) {
      this.$router.replace("/notebook_phone");
    } else {
      this.$router.replace("/notebook");
    }
  },
};
</script>

<style>
body {
  margin: 0px;
  padding: 0px;
}
</style>
