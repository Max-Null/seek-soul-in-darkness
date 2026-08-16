// SSiD 侧栏习惯面板：dsh-habit 候选（第一级人工闸门，1s 轮询刷新）。
const habitListEl = document.getElementById('habit-list')

function habitCard(candidate) {
  const card = document.createElement('div')
  card.className = 'state-card'

  const title = document.createElement('h2')
  const confidence = document.createElement('span')
  confidence.className = `level-badge level-${candidate.confidence === 'high' ? 1 : candidate.confidence === 'medium' ? 2 : 3}`
  confidence.textContent = candidate.confidence
  title.append(document.createTextNode('候选习惯 '), confidence)
  card.appendChild(title)

  const body = document.createElement('div')
  body.className = 'content'
  body.textContent = candidate.habit
  card.appendChild(body)

  const meta = document.createElement('div')
  meta.className = 'sub'
  meta.textContent = `证据 ${candidate.evidenceCount} 条`
  card.appendChild(meta)

  const actions = document.createElement('div')
  actions.className = 'actions'
  const confirm = document.createElement('button')
  confirm.textContent = '确认（写入记忆）'
  confirm.addEventListener('click', async () => {
    await window.ssid.habitConfirm(candidate.id)
    render()
  })
  const discard = document.createElement('button')
  discard.textContent = '丢弃'
  discard.addEventListener('click', async () => {
    await window.ssid.habitDiscard(candidate.id)
    render()
  })
  actions.append(confirm, discard)
  card.appendChild(actions)
  return card
}

async function render() {
  let candidates = []
  try {
    candidates = await window.ssid.habitSnapshot()
  } catch {
    candidates = []
  }
  const pending = candidates.filter(c => c.status === 'pending')
  habitListEl.replaceChildren()
  if (pending.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '黑暗中未见灵光'
    habitListEl.appendChild(empty)
    return
  }
  for (const candidate of pending) habitListEl.appendChild(habitCard(candidate))
}

setInterval(() => { void render() }, 1000)
void render()
