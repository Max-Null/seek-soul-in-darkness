// SSiD 侧栏余额面板：DeepSeek / Kimi 两条账户余额（手动刷新 + 切到本 tab 时刷新）。
const balanceListEl = document.getElementById('balance-list')

function balanceCard(name, icon, result) {
  const card = document.createElement('div')
  card.className = 'state-card'

  const title = document.createElement('h2')
  const label = document.createElement('span')
  label.textContent = `${icon} ${name}`
  title.appendChild(label)

  if (result.ok) {
    const badge = document.createElement('span')
    badge.className = `level-badge ${result.isAvailable ? 'level-0' : 'level-3'}`
    badge.textContent = result.isAvailable ? '可用' : '余额不足'
    title.appendChild(badge)
  }
  card.appendChild(title)

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
  button.className = 'actions'
  button.textContent = '刷新'
  button.style.cssText = 'margin-top:10px;padding:4px 14px;font-size:12px;background:none;border:1px solid var(--border);border-radius:6px;color:var(--fg);cursor:pointer;'
  return button
}

let refreshing = false
async function render() {
  if (refreshing) return
  refreshing = true
  balanceListEl.replaceChildren()
  const loading = document.createElement('div')
  loading.className = 'empty'
  loading.textContent = '查询中…'
  balanceListEl.appendChild(loading)

  const [ds, kimi] = await Promise.all([
    window.ssid.balanceDeepseek().catch(() => ({ ok: false, message: '查询异常' })),
    window.ssid.balanceKimi().catch(() => ({ ok: false, message: '查询异常' })),
  ])

  balanceListEl.replaceChildren()
  balanceListEl.append(balanceCard('DeepSeek', '🧭', ds), balanceCard('Kimi K3', '👁️', kimi))

  const refresh = refreshButton()
  refresh.addEventListener('click', () => { void render() })
  balanceListEl.appendChild(refresh)
  refreshing = false
}

// 切到余额 tab 时自动刷新一次（复用通用切换逻辑，这里只监听按钮点击后刷新）。
const balanceTab = document.querySelector('.panel-nav button[data-panel="balance"]')
balanceTab.addEventListener('click', () => { void render() })

void render()
