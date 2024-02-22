// 本工具模块用于存储可复用的对文章进行增删改查的函数
import { server_url } from '@/assets/constants/index'
import axios from 'axios'

// 导出saveArticle 函数
export const saveArticle = function (articleId: string, title: string, content: string) {
  alert('save')
  // 将内容保存到云
  axios
    .put(server_url + '/article', {
      Notebookid: articleId,
      content: content,
      title: title
    })
    .then(function (response) {
      if (response.data == null) {
        console.error('error')
      }
    })
}
