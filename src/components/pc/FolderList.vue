<script setup>
import { ref } from "vue";
import { server_url } from "@/assets/constants/index.js";
import ArticleList from "@/components/pc/ArticleList.vue";
import axios from "axios";
// 请求拦截, 给axios 添加请求头，设置token
axios.interceptors.request.use(
  (config) => {
    // 添加自定义token
    config.headers.authorization = localStorage.getItem("token");
    return config;
  },
  (error) => {
    return Promise.error(error);
  }
);

let folders = ref([]); // 定义响应式文件夹

//初始化，填充文件夹
axios
  .get(`${server_url}/QueryFolder`)
  .then((res) => (folders.value = res.data));

// 新建文件夹
function createFolder() {
  const name = prompt("请输入文件夹名");
  axios
    .post(`${server_url}/folders`, {
      folder_name: name,
    })
    .then((res) => {
      folders.value.push(res.data[0]);
      console.log(this.folders);
    });
}
// 文件夹更名
function folderRename(folder_id, index) {
  const newName = prompt("请输入新文件夹名");
  axios.put(`${server_url}/folders`, { folder_id, newName }).then((result) => {
    console.log(result.data);
    folders.value[index].folder_name = newName;
  });
}

let foldeDelDialogVisible = ref(false); // 控制删除对话框的出现
let delFolder = { id: 0, index: 0 }; // 定义一个将要确认删除的文件夹的id 以及在数组中的索引
let folderChecked = ref({ folderId: -2, folderName: "所有笔记" }); // 指示当前选中的folder

// 切换文件夹 ，根据输入的folderid 来进行视图的切换
function changeFolder(folderId, folderName) {
  if (folderName == "全部笔记") {
    folderChecked.value = { folderId: -2, folderName: "全部笔记" };
    // this.getAllArticle();
    return;
  }
  if (folderName == "未分类") {
    folderChecked.value = { folderId: -1, folderName: "未分类" };
    return;
  }

  folderChecked.value = { folderId: folderId, folderName: folderName };
  console.log(folderChecked.value);
}
// 文件夹删除
function deleteFolder(folder_id, index) {
  foldeDelDialogVisible.value = true;
  delFolder = { folder_id, index };
  console.log(delFolder);
}
// 确认删除
function confirmDelFolder() {
  foldeDelDialogVisible.value = false;
  console.log(delFolder.id);
  const folder_id = delFolder.id;
  axios
    .delete(`${server_url}/folders`, {
      params: { folder_id: delFolder.folder_id },
    })
    .then((restults) => console.log(restults.data));
  folders.value.splice(delFolder.index, 1);
}
</script>

<template>
  <div id="folder">
    <h2>
      {{ folderChecked.folderName }}
    </h2>

    <el-button type="primary" size="large" @click="createFolder"
      >新建文件夹</el-button
    >
    <ul>
      <li
        @click="changeFolder(-2, '全部笔记')"
        :class="{ buttonchecked: -2 === folderChecked.folderId }"
      >
        全部笔记
      </li>
      <li
        @click="changeFolder(-1, '未分类')"
        :class="{ buttonchecked: -1 === folderChecked.folderId }"
      >
        未分类
      </li>
      <h3>我的文件夹</h3>

      <el-dropdown
        v-for="(item, index) in folders"
        :key="index"
        split-button
        type="primary"
        @click="changeFolder(item.folder_id, item.folder_name)"
        :class="{ buttonchecked: folderChecked.folderId === item.folder_id }"
      >
        {{ item.folder_name }}
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="deleteFolder(item.folder_id, index)"
              >删除</el-dropdown-item
            >
            <el-dropdown-item @click="folderRename(item.folder_id, index)"
              >重命名</el-dropdown-item
            >
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </ul>

    <el-dialog
      v-model="foldeDelDialogVisible"
      title="Tips"
      width="30%"
      :before-close="handleClose"
    >
      <span> 你确定要删除这个文件夹吗？ </span>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="foldeDelDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmDelFolder()">
            确认
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>

  <ArticleList :folderId="folderChecked.folderId"> </ArticleList>
</template>

<style lang="scss" scoped>
$black-border: 1px solid black;
$radius: 10px;
$box-height: 905px;
$left-width: 300px;
#folder {
  flex-shrink: 0;
  width: 200px;
  height: 865px;
  background-color: white;
  border-radius: $radius;
  padding: 20px 20px;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  .addFolderBtn:hover {
    background-color: #55a6fb;
  }
  ul {
    width: 100%;
    list-style: none;
    display: flex;
    flex-flow: column nowrap;

    li {
      border: 0px;
      line-height: 40px;
      width: 100%;

      button {
        background: 0%;
        border: 0px;
      }
    }
  }
}

.buttonchecked {
  background-color: #c0c0c0;
}
</style>
