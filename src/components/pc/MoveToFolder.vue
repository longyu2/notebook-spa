<script setup lang="ts">
import { server_url } from '@/assets/constants/index'
import axios from 'axios'
import { toRaw, ref, defineProps, onMounted } from 'vue'

const props = defineProps(['check_list'])
let folderList = ref([])
// let articleList = ref([])

const emit = defineEmits(['someEvent', 'submit'])

// 根据获取到的 目标文件夹id 和 已经选中的 文章的id。进行添加
function move(folder: any) {
  const articleList = toRaw(props.check_list)
  // 遍历所有选中的文章，有多少文章就发送多少次请求
  articleList.forEach((element: any) => {
    let jsonObj = {
      folder_id: folder.folder_id,
      article_id: element.Notebookid
    }
    axios.put(`${server_url}/FolderAddArticle`, jsonObj).then((results) => {
      emit('someEvent')
    })
  })
}

onMounted(() => {
  //获得文件夹列表
  axios.get(`${server_url}/folders`).then((res) => {
    folderList.value = res.data
  })
})
</script>
<template>
  <div class="MoveToFolder">
    <div class="header">
      <span>移动到文件夹</span>
      <button class="close-btn" @click="$emit('someEvent')">×</button>
    </div>
    <hr />

    <ul>
      <a href="#"
        ><li class="head-li" @click="move({ folder_id: -1, folder_name: '未分类' })">
          <img src="@/assets/return.svg" alt="" />
          <span>移出文件夹</span>
        </li></a
      >
      <a href="#"
        ><li v-for="item in folderList" :key="item" @click="move(item)">
          <img src="@/assets/folder.svg" alt="" />
          <span> {{ item['folder_name'] }}</span>
        </li>
      </a>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.MoveToFolder {
  width: 470px;
  height: auto;
  max-height: 55vh;
  overflow: auto;
  padding-bottom: 100px;
  z-index: 3;
  position: absolute;
  top: 22%;
  left: 38%;

  background-color: #fff;
  border-radius: 10px;
  border: 2px solid gainsboro;
  box-shadow: 3px 3px 7px gray;
  .header {
    display: flex;
    justify-content: space-between;
    span {
      font-size: 20px;
      font-weight: 500;
      margin: 10px 20px;
      font-family: 微软雅黑;
    }
  }
  .close-btn {
    background: 0%;
    border: 0px;
    font-size: 30px;
    color: grey;
    font-family: 微软雅黑;
    margin: 0px 10px;
  }
  .close-btn:hover {
    color: #000;
  }

  ul {
    margin-left: 10px;
    list-style: none;

    .head-li {
      height: 50px;
      display: flex;
      justify-content: flex-start;
      align-items: center;
      margin-left: 12px;
      img {
        width: 28px;
      }
      span {
        font-size: large;
        margin-left: 30px;
      }
    }
    a {
      color: #111;
      font-size: large;

      text-decoration: none;
      li {
        height: 50px;
        display: flex;
        justify-content: flex-start;
        align-items: center;
        img {
          width: 50px;
        }
        span {
          margin-left: 20px;
        }
      }
    }
  }
}
</style>
