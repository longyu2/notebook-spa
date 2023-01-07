<template>
  <router-view></router-view>
</template>

<script>
export default {
  data() {
    return {};
  },
  methods: {
    _isMobile: function () {
      let flag = navigator.userAgent.match(
        /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
      );
      return flag;
    },
  },
  mounted() {
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
  background-color: #225577;
}
</style>
