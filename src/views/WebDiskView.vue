<template>
  <div class="list-card">
    <div class="list-header">
      <h2 class="list-title">文件列表</h2>
      <p class="list-subtitle">优雅设计，极致体验</p>

      <p>
        <el-upload
          v-model:file-list="fileList"
          class="upload-demo"
          :action="`${server_url}/filesupload`"
          :on-success="handleSuccess"
          :headers="uploadHeaders"
          multiple="true"
          limit="100"
        >
          <el-button class="btn" size="middle">上传文件</el-button>
        </el-upload>
      </p>
    </div>

    <ul class="elegant-list" role="list">
      <a v-for="i in filesList" :key="i" :href="`${disk_server_url}/upload/disk/${i}`">
        <li class="list-item">
          <div class="item-icon">✓</div>
          <nav class="item-content">
            {{ i }}
          </nav>
        </li>
      </a>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { UploadProps, UploadUserFile } from 'element-plus'

import axios from 'axios'
import { server_url } from '../assets/constants/server_url'
import { ref } from 'vue'
const filesList = ref([])
const disk_server_url = server_url.replace('v1', '')
// 获得文件列表
const getFiles = async (folderPath: string) => {
  const result = await axios.get(`${server_url}/files?folderPath=${folderPath}`)
  filesList.value = result.data
  console.log(filesList.value)
}

// 删除文件或目录
const deleteFile = (filePath: string, isFolder = false) => {
  return 0
}

// 上传一个文件
const uploadFile = (file: File, destPath: string) => {
  return 0
}

// 上传成功的回调
const handleSuccess: UploadProps['onSuccess'] = (response, uploadFile) => {
  const newImageUrl = `${server_url.replace('/v1', '')}/${response.url}`

  // 当列表里每一项的状态都是success以后才清空文件列表
  if (fileList.value.every((item) => item.status === 'success')) {
    fileList.value = [] // 清空文件列表
    getFiles('/')
  }
}

// 文件上传
const token = localStorage.getItem('token')
const uploadHeaders = { Authorization: token }
const fileList = ref<UploadUserFile[]>([])
let user = JSON.parse(localStorage.getItem('user')!)

getFiles('/')

// style 必须加scoped不然会影响全局，就比如disk不加导致返回后样式错乱
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    'Segoe UI',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.list-card {
  width: 380px;
  max-width: 90vw;
  background: white;
  border-radius: 20px;
  padding: 32px;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.05),
    0 1px 3px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin: 100px auto;
}

.list-header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f0f2f5;
}

.list-title {
  font-size: 24px;
  font-weight: 600;
  color: #2d3436;
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.list-subtitle {
  font-size: 14px;
  color: #6c757d;
  font-weight: 400;
  margin-bottom: 16px;
}

.elegant-list {
  list-style: none;
  padding: 0;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 16px 18px;
  margin-bottom: 12px;
  background: #f8f9fa;
  border-radius: 14px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.list-item:last-child {
  margin-bottom: 0;
}

.list-item:hover {
  background: #4dabf7;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(77, 171, 247, 0.25);
}

.list-item:hover .item-text {
  color: white;
}

.list-item:hover .item-icon {
  background: white;
  color: #4dabf7;
  transform: scale(1.1);
}

.list-item:hover .item-badge {
  background: white;
  color: #4dabf7;
}

.item-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #e7f5ff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  color: #4dabf7;
  font-weight: bold;
  font-size: 16px;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.item-content {
  flex-grow: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-text {
  font-size: 15px;
  font-weight: 500;
  color: #495057;
  transition: color 0.3s ease;
}

.item-badge {
  background: #e7f5ff;
  color: #4dabf7;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s ease;
}

/* 添加悬停时的装饰线条效果 */
.list-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 3px;
  background: #4dabf7;
  transform: scaleY(0);
  transition: transform 0.3s ease;
  border-radius: 0 3px 3px 0;
}

.list-item:hover::before {
  transform: scaleY(1);
}

/* 响应式调整 */
@media (max-width: 480px) {
  .list-card {
    padding: 24px;
    width: 320px;
  }

  .list-title {
    font-size: 22px;
  }

  .list-item {
    padding: 14px 16px;
  }
}
</style>
