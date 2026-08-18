---
name: mxy-pptx-slim
description: 压缩 PowerPoint (.pptx) 文件中的视频、GIF 和 PNG 图片，显著减小文件体积。当用户提到 PPTX 太大、压缩 PPT、PPT 瘦身、PowerPoint 文件优化时触发。
---

## 功能

自动压缩 `.pptx` 文件中的媒体资源：
- **视频 (.mp4)** → H.264 Main Profile + yuv420p，以 PPT 全尺寸 1080p（1920px）为上限，按幻灯片中实际占比自适应分辨率
- **动图 (.gif)** → 1080p 上限 + 15fps + 256 色调色板 + 自适应分辨率 + 高质量抖动
- **图片 (.png)** → Pillow 无损优化 + 超大图缩放

脚本运行时显示实时进度条和最终压缩报告。

## 调用方式

脚本位于 `D:\Project\tools\pptx-slim\pptx-slim.py`，跨项目通用：

```bash
python D:\Project\tools\pptx-slim\pptx-slim.py <input.pptx> [-o <output.pptx>] [选项]
```

## 执行流程

### 第一步：确认输入文件

向用户确认要压缩的 PPTX 文件路径。如果用户提供了路径，直接使用；否则询问。

### 第二步：检查依赖

```bash
python --version
python -c "import PIL; print('Pillow:', PIL.__version__)"
python -c "import defusedxml; print('defusedxml: OK')"
```

- Python 3.9+ 必须
- Pillow 未安装时执行 `python -m pip install Pillow`
- defusedxml 未安装时执行 `python -m pip install defusedxml`
- FFmpeg 可选（脚本自动检测，找不到时仅跳过视频/GIF 压缩）

### 第三步：给出命令

将完整的压缩命令输出给用户，**由用户在终端中自行执行**。

```bash
python "D:\Project\tools\pptx-slim\pptx-slim.py" "<文件路径>" -o "<输出路径>"
```

用户在终端中可看到实时进度条和最终压缩报告。CLI 工具无法流式输出，因此不代为执行。

## 选项参考

| 选项 | 说明 |
|------|------|
| `-o, --output` | 输出路径（默认: `xxx-slim.pptx`） |
| `--dry-run` | 仅分析不修改 |
| `--no-video` | 跳过视频压缩 |
| `--no-gif` | 跳过 GIF 优化 |
| `--no-png` | 跳过 PNG 压缩 |
| `--ffmpeg` | 手动指定 ffmpeg 路径 |

## 共享给同事

本工具是独立脚本，同事无需任何额外工具也可直接使用。复制 `D:\Project\tools\pptx-slim\` 目录给对方即可：

```bash
python pptx-slim.py big.pptx -o small.pptx
```

## 后续工具约定

`D:\Project\tools\` 为共享工具目录，后续新建的通用工具统一放在此目录下，每个工具一个子目录。
