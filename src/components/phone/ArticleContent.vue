<script setup>
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
</script>

<template>
   <div id="NoteBook-Content" v-show="is_Content_Show">
   
    <van-icon name="arrow-left" @click="router.push('/')"/>
    <input
      type="text"
      placeholder="标题"
      id="TextBoxTitle"
      v-model="notebookTitle"
    />
    <hr />
    <textarea
      name="reworkmes"
      placeholder="开始书写"
      id="txtContent"
      style="overflow: auto"
      v-model="notebookContent"
    ></textarea>
  </div>

 
</template>