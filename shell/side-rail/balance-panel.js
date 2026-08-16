(() => {
// SSiD 侧栏余额面板：DeepSeek / Kimi 两条账户余额。
// 刷新节奏：切到本 tab 自动刷 + 面板可见时 30s 轮询 + 手动刷新按钮 + 最后更新时间。
const balanceListEl = document.getElementById('balance-list')

let lastUpdated = null
let lastResults = { ds: null, kimi: null }
let refreshing = false

function balanceCard(name, icon, result) {
  const card = document.createElement('div')
  card.className = 'state-card'

  const title = document.createElement('h2')
  const label = document.createElement('span')
  label.textContent = `${icon} ${name}`
  title.appendChild(label)

  if (result !== null && result.ok) {
    const badge = document.createElement('span')
    badge.className = `level-badge ${result.isAvailable ? 'level-0' : 'level-3'}`
    badge.textContent = result.isAvailable ? '可用' : '余额不足'
    title.appendChild(badge)
  }
  card.appendChild(title)

  if (result === null) {
    const pending = document.createElement('div')
    pending.className = 'sub'
    pending.textContent = '查询中…'
    card.appendChild(pending)
    return card
  }
  if (!result.ok) {
    const error = document.createElement('div')
    error.className = 'sub'
    error.textContent = result.message ?? '查询失败'
    card.appendChild(error)
    return card
  }
  for (const info of result.balanceInfos) {
    const big = document.createElement('div')
    big.className = 'big'
    big.textContent = `¥ ${Number(info.totalBalance).toFixed(2)}`
    card.appendChild(big)
    const sub = document.createElement('div')
    sub.className = 'sub'
    sub.textContent = info.currency
    card.appendChild(sub)
  }
  return card
}

function refreshButton() {
  const button = document.createElement('button')
  button.className = 'files-action'
  button.textContent = '刷新'
  button.addEventListener('click', () => { void refresh() })
  return button
}

async function refresh() {
  if (refreshing) return
  refreshing = true
  const [ds, kimi] = await Promise.all([
    window.ssid.balanceDeepseek().catch(() => ({ ok: false, message: '查询异常' })),
    window.ssid.balanceKimi().catch(() => ({ ok: false, message: '查询异常' })),
  ])
  lastResults = { ds, kimi }
  lastUpdated = new Date()
  refreshing = false
  render()
}

function render() {
  balanceListEl.replaceChildren()
  balanceListEl.append(balanceCard('DeepSeek', '🧭', lastResults.ds), balanceCard('Kimi K3', '👁️', lastResults.kimi))

  const foot = document.createElement('div')
  foot.className = 'balance-foot'
  foot.appendChild(refreshButton())
  const updated = document.createElement('div')
  updated.className = 'balance-updated'
  updated.textContent = lastUpdated === null
    ? '尚未查询'
    : `上次更新 ${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })} · 面板可见时每 30s 自动刷新`
  foot.appendChild(updated)
  balanceListEl.appendChild(foot)
}

// 切到余额 tab 时立即刷新（通用切换在 state-panel.js，这里只监听按钮点击）。
const balanceTab = document.querySelector('.nav button[data-panel="balance"]')
balanceTab.addEventListener('click', () => { void refresh() })

// 面板可见时 30s 轮询；不可见时不动（省 API 调用）。
setInterval(() => {
  const panel = document.getElementById('panel-balance')
  if (panel.classList.contains('active')) void refresh()
}, 30_000)

void refresh()
})()
