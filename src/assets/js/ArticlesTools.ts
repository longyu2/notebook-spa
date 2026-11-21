// 本工具模块用于存储可复用的对文章进行增删改查的函数

import axios from 'axios'

// 导出saveArticle 函数
const saveArticle = async (articleId: string, title: string, content: string) => {
  console.log('save')
  // server_url 必须现读：放模块顶层会在首次 import 时求值一次就冻住，
  // 用户在登录页切了服务器（router.push 是 SPA 跳转，不刷新页面）之后，
  // 这里还会往旧服务器保存，而且不报错，是静默存错地方。
  const server_url = localStorage.getItem('server_url')
  // 将内容保存到云
  const res = await axios.put(server_url + '/article', {
    Notebookid: articleId,
    content: content,
    title: title
  })

  if (res.data == null) {
    console.error('error')
  }
}

export { saveArticle }

/* 私密笔记的保存：body 里只有密文信封，标题已经在密文里面（库里 title 存空串）。
   单独一个函数而不是给 saveArticle 加参数：普通保存和加密保存是两条不能混的路，
   一旦混用就会出现「标着私密、躺着明文」的行。 */
const savePrivateBlob = async (articleId: string, blob: string) => {
  const server_url = localStorage.getItem('server_url')
  const res = await axios.put(server_url + '/article/private', {
    Notebookid: articleId,
    is_private: 1,
    title: '',
    content: blob
  })
  if (res.data?.status !== '200') {
    console.error('私密笔记保存失败', res.data)
  }
  return res.data
}

export { savePrivateBlob }
