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

let addFolderDialogForm = ref({
  Visible: false, // 用于控制新增文件夹的对话框的显示与否
  newFolderName: "", // 输入的新文件夹名
});

// 新建文件夹
function createFolder() {
  addFolderDialogForm.value.Visible = true;
}
// 新建文件夹确认
function confirmClick() {
  addFolderDialogForm.value.Visible = false;
  let name = addFolderDialogForm.value.newFolderName;
  axios
    .post(`${server_url}/folders`, {
      folder_name: name,
    })
    .then((res) => {
      folders.value.push(res.data[0]);
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
    <h4>
      {{
        folderChecked.folderName.length > 9
          ? folderChecked.folderName.substring(0, 8) + "..."
          : folderChecked.folderName
      }}
    </h4>

    <ul>
      <li
        @click="changeFolder(-2, '全部笔记')"
        :class="{ buttonchecked: -2 === folderChecked.folderId }"
        style="font-size: small"
      >
        全部笔记
      </li>
      <li
        @click="changeFolder(-1, '未分类')"
        :class="{ buttonchecked: -1 === folderChecked.folderId }"
        style="font-size: small"
      >
        未分类
      </li>

      <div class="my-folder">
        <span>我的文件夹</span>
        <el-icon @click="createFolder"><Plus /></el-icon>
      </div>

      <li
        class="folder-item"
        v-for="(item, index) in folders"
        :key="index"
        @click="changeFolder(item.folder_id, item.folder_name)"
        :class="{ buttonchecked: folderChecked.folderId === item.folder_id }"
      >
        {{
          item.folder_name.length > 9
            ? item.folder_name.substring(0, 8) + "..."
            : item.folder_name
        }}

        <el-dropdown placement="bottom" trigger="click" class="dropdown">
          <el-icon class="el-icon--right">
            <arrow-down />
          </el-icon>
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
      </li>
    </ul>

    <!-- 删除对话框 -->
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

    <!-- 新增对话框 -->
    <el-dialog v-model="addFolderDialogForm.Visible" title="新建文件夹">
      <el-form>
        <el-form-item label="请输入文件夹名" :label-width="formLabelWidth">
          <el-input
            v-model="addFolderDialogForm.newFolderName"
            autocomplete="off"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addFolderDialogForm.Visible = false"
            >取消</el-button
          >
          <el-button type="primary" @click="confirmClick()"> 确认 </el-button>
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
  width: 10vw;
  height: 90vh;
  background-color: white;
  border-radius: $radius;
  padding: 20px 15px;
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  .addFolderBtn:hover {
    background-color: #a0cfff;
  }
  ul {
    width: inherit;
    list-style: none;
    display: flex;
    flex-flow: column nowrap;

    .my-folder {
      font-weight: 600;
      width: 95%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      span {
        font-size: small;
      }
    }
    .folder-item {
      margin-left: 10px;
    }
    li {
      cursor: pointer;
      font-size: small;
      border-radius: 8px;
      padding: 0px 6px;
      border: 0px;
      line-height: 36px;
      height: 36px;
      width: 90%;
      display: flex;
      justify-content: space-between;
      button {
        background: 0%;
        border: 0px;
      }
      .dropdown {
        .el-icon--right {
          border-radius: 50%;
          float: right;
          width: 36px;
          height: 36px;
          line-height: 30px;
          display: flex;
          justify-content: center;
        }
        .el-icon--right:hover {
          background-color: #a0cfff;
        }
      }
    }
  }
}

.buttonchecked {
  background-color: #c6e2ff;
}
</style>
