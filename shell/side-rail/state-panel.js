// SSiD 侧栏状态面板：Guardian 三个触发线的可视化（1s 轮询刷新）。
const stateListEl = document.getElementById('state-list')
const panelNavButtons = document.querySelectorAll('.panel-nav button')

// 面板切换（记忆 / 状态）
for (const button of panelNavButtons) {
  button.addEventListener('click', () => {
    for (const b of panelNavButtons) b.classList.remove('active')
    button.classList.add('active')
    const target = button.dataset.panel
    document.getElementById('panel-memory').classList.toggle('active', target === 'memory')
    document.getElementById('panel-state').classList.toggle('active', target === 'state')
  })
}

function levelBadge(level) {
  const label = level === 0 ? '安静' : `${level} 级`
  return `<span class="level-badge level-${level}">${label}</span>`
}

function assertCard(session) {
  const count = session?.assertionCount ?? 0
  const level = session?.assertionLevel ?? 0
  const card = document.createElement('div')
  card.className = 'state-card'
  card.innerHTML = `
    <h2>断言计数 ${levelBadge(level)}</h2>
    <div class="big">${count}</div>
    <div class="sub">模型未经查证的「不支持/不存在/做不到」表述</div>`
  return card
}

function noFeedbackCard(session) {
  const turns = session?.noFeedbackTurns ?? 0
  const threshold = 3
  const card = document.createElement('div')
  card.className = `state-card${turns >= threshold ? ' warn' : ''}`
  card.innerHTML = `
    <h2>无反馈环 <span style="font-weight:400">${turns} / ${threshold}</span></h2>
    <div class="big" style="color:${turns >= threshold ? 'var(--level-3, #f76f4f)' : 'inherit'}">${turns >= threshold ? '⚠️' : '✓'}</div>
    <div class="sub">连续「改代码但没跑测试」的轮数</div>`
  return card
}

function reviewCard(queue) {
  const items = queue ?? []
  const card = document.createElement('div')
  card.className = 'state-card'
  const title = document.createElement('h2')
  title.textContent = `编辑审查队列 ${items.length} 条`
  card.appendChild(title)
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'sub'
    empty.textContent = '暂无待审查的编辑'
    card.appendChild(empty)
    return card
  }
  for (const item of items.slice(0, 8)) {
    const row = document.createElement('div')
    row.className = 'review-item'
    const turn = document.createElement('span')
    turn.textContent = `t${item.turn}`
    row.appendChild(turn)
    row.appendChild(document.createTextNode(item.filePath))
    card.appendChild(row)
  }
  if (items.length > 8) {
    const more = document.createElement('div')
    more.className = 'sub'
    more.textContent = `…另有 ${items.length - 8} 条`
    card.appendChild(more)
  }
  return card
}

async function render() {
  let snapshot
  try {
    snapshot = await window.ssid.guardianSnapshot()
  } catch {
    snapshot = { session: null, reviewQueue: [] }
  }
  const { session, reviewQueue } = snapshot
  stateListEl.replaceChildren(
    assertCard(session),
    noFeedbackCard(session),
    reviewCard(reviewQueue),
  )
}

setInterval(() => { void render() }, 1000)
void render()
