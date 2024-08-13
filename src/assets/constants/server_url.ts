// 将APIurl作为常量输出提供给其他

let server_url: string = ''

if (localStorage.getItem('server_url') === null) {
  server_url = 'https://note.misaka-mikoto.cn:9999/v1'
  localStorage.setItem('server_url', 'https://note.misaka-mikoto.cn:9999/v1')
} else {
  server_url = localStorage.getItem('server_url')!
}
export { server_url }
