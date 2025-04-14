<script setup lang="ts">
import FolderList from '../components/phone/FolderList.vue'
</script>

<template>
  <div class="phone-box">
    <FolderList></FolderList>
  </div>
</template>

<style lang="scss" scoped>
.phone-box {
  width: 100%;
  height: 100%;
}
.config-icon {
  box-sizing: border-box;
  padding: 3vw;
  display: flex;
  justify-content: flex-end;
}
</style>
