// 提取「用户点名」轮次的用户原文 + 全部 skill 描述，写到文件供人工评估
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { zstdDecompressSync } from "node:zlib"
import { join } from "node:path"

const root = process.argv[process.argv.indexOf("--root")+1]
const out  = process.argv[process.argv.indexOf("--out")+1]
function readEvents(file) {
  const bytes = readFileSync(file)
  const M=[0x28,0xb5,0x2f,0xfd]; const st=[]
  for(let i=0;i+4<=bytes.length;i++) if(bytes[i]===M[0]&&bytes[i+1]===M[1]&&bytes[i+2]===M[2]&&bytes[i+3]===M[3]) st.push(i)
  st.push(bytes.length)
  let t=""; for(let k=0;k<st.length-1;k++){ try{ t+=zstdDecompressSync(bytes.subarray(st[k],st[k+1])).toString("utf8") }catch{} }
  return t.split("\n").filter(l=>l.trim()).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)
}
function walk(dir,out2=[]){ for(const e of readdirSync(dir,{withFileTypes:true})){ const p=join(dir,e.name); if(e.isDirectory()) walk(p,out2); else if(e.name.endsWith(".jsonl.zstd")) out2.push(p) } return out2 }

const TRIGGERS = [/提交|commit|推送/i, /日报|周报/, /设计文档|设计方案|写方案|原型/, /代码审查|review|审查/, /拉取|pull|同步代码/i, /整理代码|加注释/,
  /更新文档|更新 ?AGENTS|同步文档/i, /pptx|ppt|幻灯片|演示/, /做成图片|发群里|导出 ?PDF|做成 ?PDF/i, /架构图|活点地图|链路图/, /剧本杀/, /台账|判据|能发吗|能交付/]

const namedRounds = []   // {text, calledSkill, skillNames[], file}
for (const file of walk(root)) {
  let size=0; try{ size=statSync(file).size }catch{ continue }
  if (size < 300000) continue
  let evs; try{ evs=readEvents(file) }catch{ continue }
  const turnStarts=[]
  for(const e of evs) if(e.type==="turn/start") turnStarts.push({turn:e.data.turn, seq:e.seq})
  if (turnStarts.length < 5) continue
  const turnOfSeq=(seq)=>{ let t=null; for(const ts of turnStarts){ if(ts.seq<seq) t=ts.turn; else break } return t }
  const calls=new Map()
  for(const e of evs) if(e.type==="tool/call"){ if(!calls.has(e.data.turn)) calls.set(e.data.turn,[]); calls.get(e.data.turn).push(e.data) }
  for(const e of evs) {
    if(e.type!=="user/message" || e.data?.source?.kind!=="user") continue
    const txt=(Array.isArray(e.data.content)?e.data.content:[]).map(c=>c.text??"").join(" ").trim()
    if(!txt) continue
    if(!TRIGGERS.some(re=>re.test(txt))) continue
    const t=turnOfSeq(e.seq)
    const cs=(calls.get(t)??[]).filter(c=>c.name==="skill").map(c=>{ try{ return JSON.parse(c.arguments).name }catch{ return "?" } })
    namedRounds.push({ file: file.split("\\").slice(-2)[0], text: txt.slice(0,220), calledSkill: cs.length>0, skillNames: cs })
  }
}
console.log(`用户点名轮次共 ${namedRounds.length}，其中调用了 skill 的 ${namedRounds.filter(r=>r.calledSkill).length}`)
const lines = []
for (const r of namedRounds) {
  lines.push(`### ${r.calledSkill ? "✓ 调用了 " + r.skillNames.join(",") : "✗ 未调用"}  〔${r.file}〕`)
  lines.push(r.text.replace(/\n/g," ").slice(0,200))
  lines.push("")
}
writeFileSync(out, lines.join("\n"), "utf8")
console.log("已写入 " + out)
