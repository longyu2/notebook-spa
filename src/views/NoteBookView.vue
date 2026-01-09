<script setup lang="ts">
import FolderList from '@/components/pc/FolderList.vue'
import { _isMobile } from '@/assets/constants/index'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()

if (_isMobile()) {
  router.push('/notebook_phone')
}
</script>

<template>
  <div id="notebook-box">
    <FolderList></FolderList>
  </div>
</template>

<script lang="ts">
import axios from 'axios'
</script>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;
#notebook-box {
  height: 100vh;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0px 20px;
  position: relative;
  z-index: 1;
}

.buttonchecked {
  background-color: #c0c0c0;
}
</style>
