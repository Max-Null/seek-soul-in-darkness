// 假 worker:验证 IPC 链路用。发 done 后 disconnect 退出,不弹对话框。
const title = process.env.DSH_DIALOG_TITLE ?? ''
if (title === '') throw new Error('fake-worker: DSH_DIALOG_TITLE is required')
if (process.send === void 0) throw new Error('fake-worker: no IPC channel')
process.send({ kind: 'showing', threadId: 12345 })
setTimeout(() => {
  process.send({ kind: 'done', path: 'C:\\fake\\selected\\dir' }, () => {
    if (process.connected) process.disconnect()
  })
}, 200)
