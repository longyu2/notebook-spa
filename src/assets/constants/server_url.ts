// 将APIurl作为常量输出提供给其他

let server_url: string = ''

// if (localStorage.getItem('server_url') === null) {
//   server_url = 'http://home.misaka-mikoto.cn:9997/v1'
//   localStorage.setItem('server_url', server_url)
// } else {
//   server_url = localStorage.getItem('server_url')!
// }

server_url = 'http://home.misaka-mikoto.cn:9999/v1'
// server_url = 'http://localhost:9999/v1'

export { server_url }
