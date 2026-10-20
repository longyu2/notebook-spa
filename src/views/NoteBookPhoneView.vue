<script setup lang="ts">
import FolderList from '../components/phone/FolderList.vue'
import { _isMobile } from '@/assets/constants/index'
import { initTheme } from '@/assets/js/theme'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()

/* 手机端这一页也要跟主题走：从阅览页切过来时 body 上可能还留着
   data-theme=semiTransparent，不显式初始化就会出现「深色底 + 白卡片」的错配。 */
initTheme()

if (!_isMobile()) {
  router.push('/notebook')
}
</script>

<template>
  <div class="phone-box">
    <FolderList></FolderList>
  </div>
</template>

<style lang="scss" scoped>
/* 走文档级滚动（路由 meta.pageScroll），所以用 min-height 而不是固定 100%，
   否则列表比屏幕长时高度被锁死。 */
.phone-box {
  width: 100%;
  min-height: 100vh;
  background-color: #f7f8fa;
}
.config-icon {
  box-sizing: border-box;
  padding: 3vw;
  display: flex;
  justify-content: flex-end;
}
</style>
