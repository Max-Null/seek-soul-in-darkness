#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""pptx-slim —— 压缩 PowerPoint 文件体积。

压什么：
  1. 位图  超过 --max-edge 的等比缩小，然后重新编码（JPEG 有损 / PNG 无损优化）
  2. GIF   用 ffmpeg 重编码：缩尺寸 + 降帧 + 减色（GIF 无帧间压缩，这三个旋钮最有效）
  3. 视频  H.264 转码（可选，需要 ffmpeg）
  4. 字体  **不修改**，但会在报告里点名哪些是系统自带、可安全移除

不改文件名与扩展名 —— 这是不动 rels / [Content_Types].xml 的前提，也就不存在把文件改坏的风险。
输出永远是**新文件**，原始文件不动。

用法：
    python pptx-slim.py 大文件.pptx                      # 输出 大文件-slim.pptx
    python pptx-slim.py 大文件.pptx -o 小文件.pptx
    python pptx-slim.py 大文件.pptx --report             # 只看构成，不写文件
    python pptx-slim.py 大文件.pptx --gif-fps 6 --gif-colors 64
    python pptx-slim.py 大文件.pptx --ffmpeg "C:/path/to/ffmpeg.exe"
"""
import argparse
import io
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：python -m pip install Pillow")

# Windows 下管道/重定向默认走 GBK，中文字体名会全变成乱码，强制 UTF-8 输出
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

IMG_EXT = (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp")
VID_EXT = (".mp4", ".avi", ".mov", ".wmv", ".m4v", ".mkv")
AUD_EXT = (".mp3", ".wav", ".m4a", ".aac", ".wma")

# 系统自带、删了不影响放映的字体（Windows）。命中这些的嵌入可以安全移除。
SYSTEM_FONTS = {
    "calibri", "宋体", "simsun", "微软雅黑", "microsoft yahei", "黑体", "simhei",
    "仿宋", "fangsong", "楷体", "kaiti", "arial", "times new roman", "courier new",
    "segoe ui", "tahoma", "verdana", "宋体-简", "等线", "dengxian",
}

FFMPEG_CANDIDATES = [
    "ffmpeg",
    r"H:\MaxNull\WorkStation\.build\ffmpeg\ffmpeg-9.0.1-essentials_build\bin\ffmpeg.exe",
    r"C:\ffmpeg\bin\ffmpeg.exe",
]


def find_ffmpeg(explicit=None):
    if explicit:
        return explicit if Path(explicit).exists() else None
    for c in FFMPEG_CANDIDATES:
        p = shutil.which(c) if "/" not in c and "\\" not in c else (c if Path(c).exists() else None)
        if p:
            return p
    return None


def human(n):
    return f"{n / 1048576:.1f} MB"


# ---------------------------------------------------------------- 分析
def analyze(src):
    """报告体积构成。返回 (总字节, {类别: [个数, 字节]}, 媒体明细, 字体明细)"""
    buckets = defaultdict(lambda: [0, 0])
    media, fonts = [], []
    with zipfile.ZipFile(src) as z:
        for it in z.infolist():
            if it.is_dir():
                continue
            n, low, size = it.filename, it.filename.lower(), it.file_size
            if "/media/" in n:
                if low.endswith(VID_EXT):
                    cat = "视频"
                elif low.endswith(AUD_EXT):
                    cat = "音频"
                elif low.endswith(IMG_EXT):
                    cat = "图片"
                elif low.endswith(".gif"):
                    cat = "GIF"
                elif low.endswith(".svg"):
                    cat = "SVG"
                else:
                    cat = "媒体·其他"
                media.append((size, n))
            elif "/fonts/" in n or low.endswith(".fntdata"):
                cat = "嵌入字体"
                fonts.append((size, n))
            elif low.endswith(".xml"):
                cat = "XML"
            else:
                cat = "其他"
            buckets[cat][0] += 1
            buckets[cat][1] += size
    return sum(v[1] for v in buckets.values()), buckets, media, fonts


def font_names(src):
    """从 presentation.xml 的 embeddedFontLst 读字体名（fntdata 是混淆格式，PIL 打不开）。"""
    NS = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main"}
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    out = []
    try:
        from lxml import etree
    except ImportError:
        return out
    with zipfile.ZipFile(src) as z:
        try:
            pres = etree.fromstring(z.read("ppt/presentation.xml"))
            rels = etree.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
        except KeyError:
            return out
        rid2t = {r.get("Id"): r.get("Target") for r in rels}
        lst = pres.find("p:embeddedFontLst", NS)
        if lst is None:
            return out
        for ef in lst.findall("p:embeddedFont", NS):
            face = ef.find("p:font", NS).get("typeface")
            for tag in ("regular", "bold", "italic", "boldItalic"):
                e = ef.find("p:" + tag, NS)
                if e is None:
                    continue
                rid = e.get(R)
                path = "ppt/" + rid2t.get(rid, "").replace("../", "")
                try:
                    size = z.getinfo(path).file_size
                except KeyError:
                    size = -1
                out.append((size, face, tag, path.split("/")[-1]))
    return sorted(out, reverse=True)


# ---------------------------------------------------------------- 压缩
def shrink_image(blob, ext, max_edge, quality):
    try:
        with Image.open(io.BytesIO(blob)) as im:
            im.load()
            src = im.size
            resized = False
            if max(src) > max_edge:
                r = max_edge / max(src)
                im = im.resize((max(1, round(src[0] * r)), max(1, round(src[1] * r))), Image.LANCZOS)
                resized = True
            buf = io.BytesIO()
            if ext in (".jpg", ".jpeg"):
                im.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
            elif im.mode in ("RGBA", "LA", "P"):
                im.save(buf, "PNG", optimize=True)
            else:
                im.convert("RGB").save(buf, "PNG", optimize=True)
            out = buf.getvalue()
            if len(out) >= len(blob):
                return None, "重压后未变小，保留原图"
            note = f"{src[0]}x{src[1]}" + (f" -> {im.size[0]}x{im.size[1]}" if resized else " 仅重压")
            return out, note
    except Exception as e:
        return None, f"PIL 无法处理（{type(e).__name__}）—— 保留原样"


def shrink_gif(blob, ffmpeg, max_edge, fps, colors, timeout):
    if not ffmpeg:
        return None, "无 ffmpeg"
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "in.gif", Path(td) / "out.gif"
        a.write_bytes(blob)
        try:
            with Image.open(io.BytesIO(blob)) as im:
                w, h = im.size
                frames = getattr(im, "n_frames", 1)
        except Exception as e:
            return None, f"PIL 无法读取（{e}）"
        scale = min(1.0, max_edge / max(w, h))
        nw, nh = (int(w * scale), int(h * scale)) if scale < 1 else (w, h)
        vf = (f"fps={fps},scale={nw}:{nh}:flags=lanczos,"
              f"split[c][d];[c]palettegen=max_colors={colors}[p];[d][p]paletteuse=dither=bayer")
        try:
            r = subprocess.run([ffmpeg, "-y", "-i", str(a), "-vf", vf, "-loop", "0", str(b)],
                               capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return None, f"ffmpeg 超时（>{timeout}s）—— 调大 --gif-timeout 或减小 --gif-fps"
        if r.returncode != 0 or not b.exists():
            return None, "ffmpeg 失败：" + r.stderr.decode("utf-8", "ignore")[-200:]
        out = b.read_bytes()
        if len(out) >= len(blob):
            return None, "重编码后未变小，保留原 GIF"
        return out, f"{w}x{h}/{frames}帧 -> {nw}x{nh}/{fps}fps/{colors}色"


def shrink_video(blob, ffmpeg, max_edge, crf, timeout):
    if not ffmpeg:
        return None, "无 ffmpeg"
    with tempfile.TemporaryDirectory() as td:
        a, b = Path(td) / "in.mp4", Path(td) / "out.mp4"
        a.write_bytes(blob)
        vf = f"scale='min({max_edge},iw)':-2"
        try:
            r = subprocess.run(
                [ffmpeg, "-y", "-i", str(a), "-c:v", "libx264", "-profile:v", "main",
                 "-pix_fmt", "yuv420p", "-crf", str(crf), "-vf", vf,
                 "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(b)],
                capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return None, f"ffmpeg 超时（>{timeout}s）"
        if r.returncode != 0 or not b.exists():
            return None, "ffmpeg 失败"
        out = b.read_bytes()
        if len(out) >= len(blob):
            return None, "转码后未变小"
        return out, f"CRF {crf}，长边 <= {max_edge}"


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser(description="PPTX 瘦身（只缩尺寸/重编码，不改格式与文件名）")
    ap.add_argument("src")
    ap.add_argument("-o", "--output")
    ap.add_argument("--report", action="store_true", help="只分析构成，不产出文件")
    ap.add_argument("--max-edge", type=int, default=1920, help="位图长边上限（默认 1920）")
    ap.add_argument("--quality", type=int, default=82, help="JPEG 质量（默认 82）")
    ap.add_argument("--gif-max-edge", type=int, default=720)
    ap.add_argument("--gif-fps", type=int, default=8)
    ap.add_argument("--gif-colors", type=int, default=128)
    ap.add_argument("--gif-timeout", type=int, default=3000, help="单个 GIF 的 ffmpeg 超时秒数")
    ap.add_argument("--gif-min-mb", type=float, default=1.0, help="只处理大于该体积的 GIF")
    ap.add_argument("--video-crf", type=int, default=26)
    ap.add_argument("--video-timeout", type=int, default=1800)
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--no-gif", action="store_true")
    ap.add_argument("--no-image", action="store_true")
    ap.add_argument("--ffmpeg", help="手动指定 ffmpeg 路径")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.exists():
        sys.exit(f"文件不存在：{src}")
    ffmpeg = find_ffmpeg(args.ffmpeg)

    total, buckets, media, fonts = analyze(src)
    print(f"输入：{src.name}   {human(src.stat().st_size)}")
    print(f"\n{'类别':<12}{'个数':>6}{'合计':>12}{'占比':>8}")
    for cat, (n, size) in sorted(buckets.items(), key=lambda x: -x[1][1]):
        print(f"{cat:<12}{n:>6}{human(size):>12}{size / total * 100:>7.1f}%")

    print("\n最大的 8 个媒体：")
    for size, n in sorted(media, reverse=True)[:8]:
        print(f"  {human(size):>10}  {n.split('/')[-1]}")

    fnames = font_names(src)
    if fnames:
        print(f"\n嵌入字体 {len(fnames)} 份，{human(sum(s for s, *_ in fnames if s > 0))}"
              f"（本工具不修改字体）：")
        removable = 0
        for size, face, tag, fn in fnames:
            sysf = "  ← 系统自带，可考虑移除" if face.strip().lower() in SYSTEM_FONTS else ""
            if sysf:
                removable += max(0, size)
            print(f"  {human(size):>10}  {fn:<20} {tag:<11} {face}{sysf}")
        if removable:
            print(f"  提示：其中系统自带的约占 {human(removable)}，若确认放映机装了这些字体，"
                  f"可在 PowerPoint 里取消嵌入以减小体积。")

    if args.report:
        print("\n（--report 模式，未产出文件）")
        return

    out = Path(args.output) if args.output else src.with_name(src.stem + "-slim" + src.suffix)
    print(f"\nffmpeg：{ffmpeg or '未找到（跳过 GIF / 视频）'}")
    print(f"开始处理 -> {out.name}\n")

    stats = defaultdict(lambda: [0, 0])   # 类别 -> [个数, 省下的字节]
    skipped = []                          # **失败必须记录**，否则会像"悄悄跳过 56MB"那样漏掉大头

    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zout:
        for it in zin.infolist():
            if it.is_dir():
                continue
            n, low, size = it.filename, it.filename.lower(), it.file_size
            data = zin.read(n)
            new = note = None
            kind = None

            if "/media/" in n:
                if low.endswith(".gif") and not args.no_gif and size > args.gif_min_mb * 1048576:
                    kind = "GIF"
                    new, note = shrink_gif(data, ffmpeg, args.gif_max_edge, args.gif_fps,
                                           args.gif_colors, args.gif_timeout)
                elif low.endswith(VID_EXT) and not args.no_video:
                    kind = "视频"
                    new, note = shrink_video(data, ffmpeg, args.max_edge, args.video_crf,
                                             args.video_timeout)
                elif low.endswith(IMG_EXT) and not args.no_image:
                    kind = "图片"
                    new, note = shrink_image(data, "." + low.rsplit(".", 1)[-1],
                                             args.max_edge, args.quality)

            if new is not None:
                stats[kind][0] += 1
                stats[kind][1] += size - len(new)
                print(f"  [{kind}] {n.split('/')[-1]:<24} {human(size):>10} -> {human(len(new)):>10}   {note}")
                zout.writestr(it, new)
            else:
                if kind:
                    skipped.append((kind, n, size, note))
                zout.writestr(it, data)

    print("\n" + "=" * 60)
    for kind, (cnt, saved) in sorted(stats.items(), key=lambda x: -x[1][1]):
        print(f"{kind}：压缩 {cnt} 个，省 {human(saved)}")
    if skipped:
        print(f"\n跳过 {len(skipped)} 项（**这里是体积大头常藏的地方，务必过目**）：")
        for kind, n, size, note in sorted(skipped, reverse=True)[:15]:
            print(f"  [{kind}] {n.split('/')[-1]:<24} {human(size):>10}   {note}")
    final = out.stat().st_size
    print(f"\n输出：{out}   {human(final)}  (原 {human(src.stat().st_size)}，省 "
          f"{(1 - final / src.stat().st_size) * 100:.0f}%)")


if __name__ == "__main__":
    main()
