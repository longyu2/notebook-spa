<script setup lang="ts">
import { ref } from 'vue'

const theme = ref(localStorage.getItem('theme') || 'light') // 获取本地存储的主题，默认是light
function updateTheme() {
  localStorage.setItem('theme', theme.value)
  console.log('主题已更改为：' + theme.value)

  location.reload()
}
</script>
<template>
  <div id="right">
    <div class="select-theme-box">
      <el-label>主题切换</el-label>
      <el-select v-model="theme" @change="updateTheme">
        <el-option value="semiTransparent" label="半透明"></el-option>
        <el-option value="dark" label="浅色"></el-option>
        <el-option value="no" label="vditor默认"></el-option>
      </el-select>
    </div>
  </div>
</template>

<style lang="scss" scoped>
#right {
  background-color: --all-backcolor;
  width: 600px;
  height: 99vh;
  .select-theme-box {
    color: --word-color;
  }
}
</style>
