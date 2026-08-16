(() => {
// SSiD 侧栏文件面板：DSH 工作区树（懒加载）+ 最近产出平铺 + 多格式预览。
const filesListEl = document.getElementById('files-list')
const filesPreviewEl = document.getElementById('files-preview')
const workspaceSelect = document.getElementById('workspace-select')
const viewButtons = document.querySelectorAll('.files-toolbar button[data-view]')

const extOf = (path) => {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}
const basenameOf = (path) => {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
const joinPath = (base, name) => `${base.replace(/[\\/]+$/, '')}\\${name}`

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期。 */
function relativeTime(ts) {
  if (typeof ts !== 'number' || ts <= 0) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const MARKDOWN_EXTS = new Set(['md', 'markdown'])
const TEXT_EXTS = new Set(['txt', 'json', 'js', 'ts', 'mjs', 'cjs', 'css', 'html', 'htm', 'yaml', 'yml', 'csv', 'log'])

// lucide 图标 path（分形 lucide 包同款数据）。
const ICON = {
  chevron: '<svg class="tree-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  folder: '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  folderOpen: '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  file: '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/></svg>',
  fileText: '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  fileImage: '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><circle cx="10" cy="12" r="2"/><path d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"/></svg>',
}

function actionButton(label, onClick) {
  const button = document.createElement('button')
  button.className = 'files-action'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

/** 预览顶栏（sticky）：返回 + 文件名 + 系统打开。 */
function previewTopbar(path) {
  const bar = document.createElement('div')
  bar.className = 'files-topbar'
  bar.appendChild(actionButton('← 列表', () => { void showList() }))
  const name = document.createElement('div')
  name.className = 'file-name'
  name.textContent = basenameOf(path)
  name.title = path
  bar.appendChild(name)
  bar.appendChild(actionButton('打开', () => { void window.ssid.fileOpen(path) }))
  return bar
}

/** 文本类预览：md 走 marked，其余转义后 pre。 */
function renderText(ext, text) {
  if (MARKDOWN_EXTS.has(ext)) {
    const html = document.createElement('div')
    html.className = 'files-md'
    html.innerHTML = window.marked.parse(text)
    filesPreviewEl.appendChild(html)
    return
  }
  const pre = document.createElement('pre')
  pre.className = 'files-pre'
  pre.textContent = text
  filesPreviewEl.appendChild(pre)
}

/** HTML 文件：sandbox iframe 原样渲染。 */
function renderHtml(text) {
  const frame = document.createElement('iframe')
  frame.className = 'files-iframe'
  frame.sandbox = ''
  frame.srcdoc = text
  filesPreviewEl.appendChild(frame)
}

/** 图片：Blob URL。 */
function renderImage(ext, bytes) {
  const img = document.createElement('img')
  img.className = 'files-image'
  img.src = URL.createObjectURL(new Blob([bytes], { type: `image/${ext === 'svg' ? 'svg+xml' : ext}` }))
  filesPreviewEl.appendChild(img)
}

/** docx → mammoth 转 HTML。 */
async function renderDocx(bytes) {
  const result = await window.mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  const html = document.createElement('div')
  html.className = 'files-md'
  html.innerHTML = result.value
  filesPreviewEl.appendChild(html)
}

/** xlsx → 第一个工作表转表格。 */
function renderXlsx(bytes) {
  const workbook = window.XLSX.read(bytes, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (sheetName === undefined) {
    const empty = document.createElement('div')
    empty.className = 'files-note'
    empty.textContent = '工作簿没有工作表'
    filesPreviewEl.appendChild(empty)
    return
  }
  const htmlText = window.XLSX.utils.sheet_to_html(workbook.Sheets[sheetName], { header: '', footer: '' })
  const table = document.createElement('div')
  table.className = 'files-md files-table'
  table.innerHTML = htmlText
  filesPreviewEl.appendChild(table)
}

/** pdf → pdf.js 首屏渲染。 */
async function renderPdf(bytes) {
  const pdfjs = await import('./vendor/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs'
  try {
    const pdf = await pdfjs.getDocument({ data: bytes }).promise
    const note = document.createElement('div')
    note.className = 'files-note'
    note.textContent = `共 ${pdf.numPages} 页，预览第 1 页`
    filesPreviewEl.appendChild(note)
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = (filesPreviewEl.clientWidth - 24) / base.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    canvas.className = 'files-image'
    filesPreviewEl.appendChild(canvas)
  } catch (cause) {
    const error = document.createElement('div')
    error.className = 'files-note'
    error.textContent = `PDF 解析失败：${cause instanceof Error ? cause.message : String(cause)}`
    filesPreviewEl.appendChild(error)
  }
}

/** 未知格式：元信息提示（顶栏已有系统打开按钮）。 */
function renderUnknown(size) {
  const note = document.createElement('div')
  note.className = 'files-note'
  note.textContent = `不支持内嵌预览（${size} 字节），点右上角「打开」用系统默认程序查看。`
  filesPreviewEl.appendChild(note)
}

async function renderPreview(path) {
  filesPreviewEl.replaceChildren(previewTopbar(path))
  const result = await window.ssid.fileRead(path)
  if (!result.ok) {
    const error = document.createElement('div')
    error.className = 'files-note'
    error.textContent = result.message
    filesPreviewEl.appendChild(error)
    return
  }
  const bytes = result.buffer instanceof Uint8Array ? result.buffer : new Uint8Array(result.buffer ?? [])
  const ext = extOf(path)
  if (IMAGE_EXTS.has(ext)) { renderImage(ext, bytes); return }
  if (ext === 'html' || ext === 'htm') { renderHtml(new TextDecoder().decode(bytes)); return }
  if (ext === 'docx') { await renderDocx(bytes); return }
  if (ext === 'xlsx' || ext === 'xls') { renderXlsx(bytes); return }
  if (ext === 'pdf') { await renderPdf(bytes); return }
  const printable = !bytes.some((byte, index) => index > 1024 ? false : byte === 0)
  if (printable) { renderText(ext, new TextDecoder().decode(bytes)); return }
  renderUnknown(result.size)
}

function showPreview(path) {
  filesPreviewEl.hidden = false
  filesListEl.hidden = true
  void renderPreview(path)
}

function showList() {
  filesPreviewEl.hidden = true
  filesListEl.hidden = false
}

// ── 最近产出视图 ───────────────────────────────────────────────────────

function recentRow(entry) {
  const row = document.createElement('div')
  row.className = 'file-row'

  const top = document.createElement('div')
  top.className = 'file-row-top'
  const name = document.createElement('div')
  name.className = 'file-name'
  name.textContent = basenameOf(entry.path)
  name.title = entry.path
  const time = document.createElement('div')
  time.className = 'file-time'
  time.textContent = relativeTime(entry.time)
  top.append(name, time)
  row.appendChild(top)

  const path = document.createElement('div')
  path.className = 'file-path'
  path.textContent = entry.path
  path.title = entry.path
  row.appendChild(path)

  row.addEventListener('click', () => { showPreview(entry.path) })
  return row
}

async function renderRecent() {
  showList()
  let files = []
  try {
    files = await window.ssid.fileList()
  } catch {
    files = []
  }
  filesListEl.replaceChildren()
  if (files.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '还没有产出文件'
    filesListEl.appendChild(empty)
    return
  }
  for (const entry of files) filesListEl.appendChild(recentRow(entry))
}

// ── 工作区树视图 ───────────────────────────────────────────────────────

let currentWorkspacePath = null

function treeDirNode(name, absPath, depth) {
  const wrap = document.createElement('div')
  wrap.className = 'tree-node'

  const row = document.createElement('div')
  row.className = 'tree-row dir'
  row.style.paddingLeft = `${8 + depth * 14}px`
  row.innerHTML = `${ICON.chevron}${ICON.folder}`
  const label = document.createElement('span')
  label.className = 'tree-name'
  label.textContent = name
  label.title = absPath
  row.appendChild(label)
  wrap.appendChild(row)

  const children = document.createElement('div')
  children.className = 'tree-children'
  children.hidden = true
  wrap.appendChild(children)

  let loaded = false
  row.addEventListener('click', async () => {
    if (!loaded) {
      loaded = true
      const result = await window.ssid.fileReaddir(absPath)
      if (result.ok) {
        for (const entry of result.entries) {
          const childPath = joinPath(absPath, entry.name)
          children.appendChild(entry.dir
            ? treeDirNode(entry.name, childPath, depth + 1)
            : treeFileNode(entry.name, childPath, depth + 1))
        }
        if (result.truncated) {
          const note = document.createElement('div')
          note.className = 'tree-note'
          note.style.paddingLeft = `${26 + (depth + 1) * 14}px`
          note.textContent = '目录内容过多，仅显示前 200 项'
          children.appendChild(note)
        }
        if (children.childElementCount === 0) {
          const note = document.createElement('div')
          note.className = 'tree-note'
          note.style.paddingLeft = `${26 + (depth + 1) * 14}px`
          note.textContent = '（空目录）'
          children.appendChild(note)
        }
      } else {
        const note = document.createElement('div')
        note.className = 'tree-note'
        note.style.paddingLeft = `${26 + (depth + 1) * 14}px`
        note.textContent = result.message
        children.appendChild(note)
      }
    }
    children.hidden = !children.hidden
    row.classList.toggle('open', !children.hidden)
    row.querySelector('.tree-icon').outerHTML = children.hidden ? ICON.folder : ICON.folderOpen
  })
  return wrap
}

function treeFileNode(name, absPath, depth) {
  const row = document.createElement('div')
  row.className = 'tree-row'
  row.style.paddingLeft = `${8 + depth * 14}px`
  const ext = extOf(name)
  const icon = IMAGE_EXTS.has(ext) ? ICON.fileImage : TEXT_EXTS.has(ext) || MARKDOWN_EXTS.has(ext) ? ICON.fileText : ICON.file
  row.innerHTML = `<span style="width:12px;flex:none"></span>${icon}`
  const label = document.createElement('span')
  label.className = 'tree-name'
  label.textContent = name
  label.title = absPath
  row.appendChild(label)
  row.addEventListener('click', () => { showPreview(absPath) })
  return row
}

async function renderTree() {
  showList()
  filesListEl.replaceChildren()
  if (currentWorkspacePath === null) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'DSH 还没有注册工作区'
    filesListEl.appendChild(empty)
    return
  }
  const result = await window.ssid.fileReaddir(currentWorkspacePath)
  if (!result.ok) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = result.message
    filesListEl.appendChild(empty)
    return
  }
  for (const entry of result.entries) {
    const childPath = joinPath(currentWorkspacePath, entry.name)
    filesListEl.appendChild(entry.dir
      ? treeDirNode(entry.name, childPath, 0)
      : treeFileNode(entry.name, childPath, 0))
  }
  if (result.entries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '（空目录）'
    filesListEl.appendChild(empty)
  }
}

// ── 工作区选择 ─────────────────────────────────────────────────────────

async function loadWorkspaces() {
  let workspaces = []
  try {
    workspaces = await window.ssid.workspaceList()
  } catch {
    workspaces = []
  }
  workspaceSelect.replaceChildren()
  for (const workspace of workspaces) {
    const option = document.createElement('option')
    option.value = workspace.path
    option.textContent = workspace.title || basenameOf(workspace.path)
    option.title = workspace.path
    workspaceSelect.appendChild(option)
  }
  if (workspaces.length === 0) {
    currentWorkspacePath = null
    workspaceSelect.hidden = true
  } else {
    currentWorkspacePath = workspaces[0].path
    workspaceSelect.value = currentWorkspacePath
    workspaceSelect.hidden = false
  }
}

// ── 视图切换 ───────────────────────────────────────────────────────────

let currentView = 'tree'
function switchView(view) {
  currentView = view
  for (const button of viewButtons) button.classList.toggle('active', button.dataset.view === view)
  workspaceSelect.hidden = view !== 'tree' || currentWorkspacePath === null
  if (view === 'tree') void renderTree()
  else void renderRecent()
}

for (const button of viewButtons) {
  button.addEventListener('click', () => { switchView(button.dataset.view) })
}
workspaceSelect.addEventListener('change', () => {
  currentWorkspacePath = workspaceSelect.value
  void renderTree()
})

const filesTab = document.querySelector('.nav button[data-panel="files"]')
filesTab.addEventListener('click', () => {
  void loadWorkspaces().then(() => { switchView(currentView) })
})

void loadWorkspaces().then(() => { switchView(currentView) })
})()
