// SSiD 侧栏记忆面板：通过 window.ssid（preload 暴露）读写 host 的 memory。
const listEl = document.getElementById('list')
const queryEl = document.getElementById('query')
const tabs = document.querySelectorAll('.tabs button')
const toggleEl = document.getElementById('toggle')

let activeStatus = 'auto'

// 收起/展开：主进程改布局，这里同步 UI 形态。
// 侧栏在窗口右缘：展开态按钮指向右（收起方向），收起态指向左（展开方向）。
toggleEl.addEventListener('click', () => { window.ssid.toggleRail() })
window.ssid.onRailState((collapsed) => {
  document.body.classList.toggle('collapsed', collapsed)
  toggleEl.textContent = collapsed ? '«' : '»'
  if (!collapsed) render()
})

function recordCard(record) {
  const li = document.createElement('li')
  const content = document.createElement('div')
  content.className = 'content'
  content.textContent = record.content

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.textContent = `${record.namespace} · ${record.status} · ${record.keywords.join(', ') || '(无关键词)'}`

  const actions = document.createElement('div')
  actions.className = 'actions'
  if (record.status === 'suggested') {
    const confirm = document.createElement('button')
    confirm.textContent = '确认'
    confirm.addEventListener('click', async () => {
      await window.ssid.confirmMemory(record.id)
      render()
    })
    actions.appendChild(confirm)
  }
  const forget = document.createElement('button')
  forget.textContent = '删除'
  forget.addEventListener('click', async () => {
    await window.ssid.forgetMemory(record.id)
    render()
  })
  actions.appendChild(forget)

  li.append(content, meta, actions)
  return li
}

async function render() {
  const records = await window.ssid.listMemories()
  const filtered = records
    .filter(r => r.status === activeStatus)
    .filter(r => {
      const q = queryEl.value.trim().toLowerCase()
      if (q === '') return true
      return r.content.toLowerCase().includes(q) || r.keywords.some(k => k.includes(q))
    })

  listEl.replaceChildren()
  if (filtered.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '黑暗中未见灵光'
    listEl.appendChild(empty)
    return
  }
  for (const record of filtered) listEl.appendChild(recordCard(record))
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    for (const t of tabs) t.classList.remove('active')
    tab.classList.add('active')
    activeStatus = tab.dataset.status
    render()
  })
}
queryEl.addEventListener('input', render)
render()
