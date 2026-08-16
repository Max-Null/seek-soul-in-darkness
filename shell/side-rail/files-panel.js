// SSiD 侧栏文件面板：会话产出文件列表 + 多格式预览（md/html/图片/docx/xlsx/pdf）。
const filesListEl = document.getElementById('files-list')
const filesPreviewEl = document.getElementById('files-preview')

const extOf = (path) => {
  const match = path.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}
const basenameOf = (path) => {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
const escapeHtml = (text) => text
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;')

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const MARKDOWN_EXTS = new Set(['md', 'markdown'])

function previewTitle(text) {
  const title = document.createElement('div')
  title.className = 'files-title'
  title.textContent = text
  return title
}

function previewButton(label, onClick) {
  const button = document.createElement('button')
  button.className = 'files-action'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

/** 文本类预览：md 走 marked，其余转义后 pre。 */
function renderText(path, ext, text) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
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
function renderHtml(path, text) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
  const frame = document.createElement('iframe')
  frame.className = 'files-iframe'
  frame.sandbox = ''
  frame.srcdoc = text
  filesPreviewEl.appendChild(frame)
}

/** 图片：data URL。 */
function renderImage(path, ext, bytes) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
  const img = document.createElement('img')
  img.className = 'files-image'
  img.src = URL.createObjectURL(new Blob([bytes], { type: `image/${ext === 'svg' ? 'svg+xml' : ext}` }))
  filesPreviewEl.appendChild(img)
}

/** docx → mammoth 转 HTML。 */
async function renderDocx(path, bytes) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
  const result = await window.mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
  const html = document.createElement('div')
  html.className = 'files-md'
  html.innerHTML = result.value
  filesPreviewEl.appendChild(html)
}

/** xlsx → 第一个工作表转表格。 */
function renderXlsx(path, bytes) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
  const workbook = window.XLSX.read(bytes, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (sheetName === undefined) {
    const empty = document.createElement('div')
    empty.className = 'files-note'
    empty.textContent = '工作簿没有工作表'
    filesPreviewEl.appendChild(empty)
    return
  }
  const sheet = workbook.Sheets[sheetName]
  const htmlText = window.XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' })
  const table = document.createElement('div')
  table.className = 'files-md files-table'
  table.innerHTML = htmlText
  filesPreviewEl.appendChild(table)
}

/** pdf → pdf.js 首屏渲染。 */
async function renderPdf(path, bytes) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
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

/** 未知格式：元信息 + 系统打开。 */
function renderUnknown(path, size) {
  filesPreviewEl.append(previewTitle(basenameOf(path)))
  const note = document.createElement('div')
  note.className = 'files-note'
  note.textContent = `不支持内嵌预览（${size} 字节），用系统默认程序打开：`
  filesPreviewEl.appendChild(note)
  filesPreviewEl.appendChild(previewButton('系统打开', () => { void window.ssid.fileOpen(path) }))
}

async function renderPreview(path) {
  const result = await window.ssid.fileRead(path)
  filesPreviewEl.replaceChildren(backButton)
  if (!result.ok) {
    filesPreviewEl.append(previewTitle(basenameOf(path)))
    const error = document.createElement('div')
    error.className = 'files-note'
    error.textContent = result.message
    filesPreviewEl.appendChild(error)
    return
  }
  const bytes = result.buffer instanceof Uint8Array ? result.buffer : new Uint8Array(result.buffer ?? [])
  const ext = extOf(path)
  if (IMAGE_EXTS.has(ext)) { renderImage(path, ext, bytes); return }
  if (ext === 'html' || ext === 'htm') { renderHtml(path, new TextDecoder().decode(bytes)); return }
  if (ext === 'docx') { await renderDocx(path, bytes); return }
  if (ext === 'xlsx' || ext === 'xls') { renderXlsx(path, bytes); return }
  if (ext === 'pdf') { await renderPdf(path, bytes); return }
  const text = new TextDecoder().decode(bytes)
  const printable = !bytes.some((byte, index) => index > 1024 ? false : byte === 0)
  if (printable) { renderText(path, ext, text); return }
  renderUnknown(path, result.size)
}

function fileRow(entry) {
  const row = document.createElement('div')
  row.className = 'file-row'
  const name = document.createElement('div')
  name.className = 'file-name'
  name.textContent = basenameOf(entry.path)
  name.title = entry.path
  const path = document.createElement('div')
  path.className = 'file-path'
  path.textContent = entry.path
  path.title = entry.path
  const actions = document.createElement('div')
  actions.className = 'file-actions'
  const preview = previewButton('预览', () => {
    filesPreviewEl.hidden = false
    filesListEl.hidden = true
    void renderPreview(entry.path)
  })
  const open = previewButton('打开', () => { void window.ssid.fileOpen(entry.path) })
  actions.append(preview, open)
  row.append(name, path, actions)
  return row
}

async function renderList() {
  filesPreviewEl.hidden = true
  filesListEl.hidden = false
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
  for (const entry of files) filesListEl.appendChild(fileRow(entry))
}

const backButton = previewButton('← 返回列表', () => { void renderList() })
backButton.className = 'files-action files-back'

const filesTab = document.querySelector('.panel-nav button[data-panel="files"]')
filesTab.addEventListener('click', () => { void renderList() })

void renderList()
