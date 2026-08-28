#!/bin/bash
#
# ═══════════════════════════════════════════════════════════════════
#  思灵（SSiD）Mac 版 · 诊断启动器
#  用途：一键自检 + 自动修复 + 生成诊断报告
#  小白操作：双击本文件 → 等它跑完 → 把窗口里的「诊断报告」整段复制
#             （或直接把桌面上的 ssid-diag-*.txt 文件）发给开发者
# ═══════════════════════════════════════════════════════════════════
#  输出约定：诊断报告以 [SSID-DIAG-BEGIN] / [SSID-DIAG-END] 包裹，
#  开发者只需看这两行之间内容即可定位问题。
#
set -u
# 不 set -e：自检要收集所有失败点，单个失败不能中断

APP_NAMES=("思灵.app" "SSiD.app" "Electron.app")
DIAG_FILE="${HOME}/Desktop/ssid-diag-$(date +%Y%m%d-%H%M%S).txt"
LOG_DIR="${HOME}/.ssid"

# ── 输出工具 ────────────────────────────────────────────────────────
RESULT=""
note()  { echo "$1"; }
ok()    { echo " [OK]   $1"; RESULT="${RESULT}[OK]   $1\n"; }
warn()  { echo " [WARN] $1"; RESULT="${RESULT}[WARN] $1\n"; }
fail()  { echo " [FAIL] $1"; RESULT="${RESULT}[FAIL] $1\n"; }

# ── 1. 系统信息 ─────────────────────────────────────────────────────
echo "════════ 1. 系统信息 ════════"
MAC_VER=$(sw_vers -productVersion 2>/dev/null || echo "未知")
CHIP=$(uname -m 2>/dev/null || echo "未知")
CPU_BRAND=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "未知")
echo " macOS: $MAC_VER"
echo " 芯片:  $CHIP （$CPU_BRAND）"
RESULT="${RESULT}系统: macOS $MAC_VER, 芯片 $CHIP ($CPU_BRAND)\n"

# ── 2. 定位 app ─────────────────────────────────────────────────────
echo ""
echo "════════ 2. 定位思灵.app ════════"
APP=""
for name in "${APP_NAMES[@]}"; do
  for dir in "/Applications" "${HOME}/Applications" "${HOME}/Desktop" "${HOME}/Downloads" "${HOME}/Documents" "${HOME}/tmp"; do
    if [ -d "${dir}/${name}" ]; then APP="${dir}/${name}"; break 2; fi
  done
done
if [ -z "$APP" ]; then
  warn "未找到 思灵.app —— 请先把 app 拖入「应用程序」文件夹后重试"
  RESULT="${RESULT}[WARN] 未找到 app（检查了 /Applications、~/Applications、桌面、下载）\n"
fi

# ── 3. 结构与资源完整性 ─────────────────────────────────────────────
echo ""
echo "════════ 3. 结构与资源检查 ════════"
if [ -n "$APP" ]; then
  for f in "Contents/Info.plist" "Contents/MacOS" "Contents/Frameworks" "Contents/Resources/app.asar" "Contents/Resources/dsh-runtime.tar.gz" "Contents/Resources/node/node" "Contents/Resources/node/node.exe"; do
    if [ -e "${APP}/${f}" ]; then
      ok "${f}"
    else
      warn "缺失/未找到: ${f}（node 有无扩展名或 exe 名均属正常）"
    fi
  done
  echo " Contents 大小: $(du -sh "${APP}/Contents" 2>/dev/null | cut -f1)"
  ARCH=$(lipo -archs "${APP}/Contents/MacOS/"* 2>/dev/null | head -1)
  echo " 可执行架构: ${ARCH:-未知}"
  if [ -n "$ARCH" ] && [ "$CHIP" != "$ARCH" ] && [ "$CHIP" != "x86_64" ]; then
    warn "架构不匹配：app 为 $ARCH，本机为 $CHIP —— 需要对应架构的安装包"
  fi
  RESULT="${RESULT}结构: 可执行架构 ${ARCH:-未知}, app 位置 ${APP}\n"
fi

# ── 4. 签名与隔离 ───────────────────────────────────────────────────
echo ""
echo "════════ 4. 签名与隔离检查 ════════"
if [ -n "$APP" ]; then
  SIGN_INFO=$(codesign -dv "$APP" 2>&1 | grep -E "Signature|Authority" | head -3)
  echo "当前签名: ${SIGN_INFO:-（无签名信息 / 读取失败）}"
  RESULT="${RESULT}签名: ${SIGN_INFO:-无}\n"
  if codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    ok "签名校验通过"
  else
    warn "签名校验未通过（常见：下载后旧签名失效）"
  fi
  # 隔离标记
  if xattr -p com.apple.quarantine "$APP" >/dev/null 2>&1; then
    warn "存在浏览器隔离标记（quarantine）—— 会自动清除"
  else
    ok "无隔离标记"
  fi
  # Gatekeeper 评估
  SPCTL=$(spctl -a -vv "$APP" 2>&1 | head -2)
  echo " Gatekeeper 评估: ${SPCTL:-（无输出）}"
  RESULT="${RESULT}Gatekeeper: ${SPCTL:-n/a}\n"
fi

# ── 5. 日志收集 ─────────────────────────────────────────────────────
echo ""
echo "════════ 5. 运行日志（最近 40 行）════════"
for lg in "${LOG_DIR}/ssid.log" "${LOG_DIR}/heartbeat.log" "${LOG_DIR}/updater.log"; do
  if [ -f "$lg" ]; then
    echo "  --- ${lg} ---"
    tail -40 "$lg" 2>/dev/null | sed 's/^/    /'
  else
    echo "  （无日志: $lg）"
  fi
done

# ── 6. 自动修复（幂等）─────────────────────────────────────────────
echo ""
echo "════════ 6. 自动修复 ════════"
if [ -n "$APP" ]; then
  xattr -cr "$APP" 2>/dev/null
  ok "已清除隔离标记"
  if ! codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    if codesign --force --deep --sign - "$APP" >/dev/null 2>&1; then
      ok "已重新 ad-hoc 签名（--sign -）"
    else
      fail "自动重签失败（codesign 报错，见上方输出）"
    fi
  fi
  # 第二次验证
  if codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then
    ok "修复后签名校验通过"
  else
    fail "修复后签名校验仍不通过 —— 请把本报告发给开发者"
  fi
fi

# ── 7. 报告落盘 ─────────────────────────────────────────────────────
REPORT="[SSID-DIAG-BEGIN]
日期: $(date '+%Y-%m-%d %H:%M:%S')
${RESULT}[DONE]
[SSID-DIAG-END]"
printf "%b" "$REPORT" > "$DIAG_FILE" 2>/dev/null || DIAG_FILE="${HOME}/.ssid-diag.txt"

# ── 8. 启动 ─────────────────────────────────────────────────────────
echo ""
echo "════════ 7. 启动思灵 ════════"
if [ -n "$APP" ]; then open "$APP" && ok "已发起启动（首次请右键 app → 打开放行）"; fi
echo ""
echo "════════ 诊断报告（请复制从 [SSID-DIAG-BEGIN] 到 [SSID-DIAG-END] 的全部内容发给开发者）════════"
printf "%b\n" "$REPORT"
echo ""
echo " 报告已保存: $DIAG_FILE"
echo "（也可以直接把桌面上的这个 txt 文件发给开发者）"
read -r -p "按回车关闭窗口…" _ </dev/tty 2>/dev/null || true
