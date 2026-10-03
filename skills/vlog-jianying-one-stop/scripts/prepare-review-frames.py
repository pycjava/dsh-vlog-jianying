#!/usr/bin/env python3
"""为每个视频均匀抽取预览帧，供逐镜查看素材内容（prepare-review-frames.ps1 的跨平台 Python 版）。

退出码约定（全技能脚本统一）：
  0  成功（单个视频抽帧失败不阻塞，manifest 中记 frame-failed）
  2  环境或输入错误（ffmpeg/ffprobe 缺失、SourceDir 不存在）
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
CSV_FIELDS = ["MediaId", "RelativePath", "CaptureTime", "DurationSec", "FramePath", "TimestampSec", "FrameZone", "Status"]


def fail(message: str) -> "SystemExit":
    print(message, file=sys.stderr)
    return SystemExit(2)


def safe_cell(value: object) -> object:
    """CSV 公式注入防护：= + - @ 或控制符开头的单元格加 ' 前缀，防止 Excel/Numbers 执行公式。"""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def probe_duration(ffprobe: str, path: Path) -> float | None:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", "--", str(path)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip().splitlines()[0])
    except (ValueError, IndexError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path, help="素材目录（递归扫描）")
    parser.add_argument("--output-dir", required=True, type=Path, help="预览帧输出目录")
    parser.add_argument("--frames-per-video", type=int, default=10, help="每个视频抽帧数（3-30，默认 10）")
    parser.add_argument("--max-videos", type=int, default=0, help="只处理前 N 个视频（0 = 不限制）")
    args = parser.parse_args()

    if not 3 <= args.frames_per_video <= 30:
        raise fail("--frames-per-video 必须在 3..30 之间")

    source = args.source_dir.expanduser().resolve()
    if not source.is_dir():
        raise fail(f"SourceDir 不存在或不是目录: {source}")

    output = args.output_dir.expanduser().resolve()
    if output == source or source in output.parents:
        raise fail("OutputDir 必须位于素材目录之外；脚本绝不向素材目录写入。")

    ffprobe = shutil.which("ffprobe")
    ffmpeg = shutil.which("ffmpeg")
    if not ffprobe or not ffmpeg:
        raise fail("未找到 ffmpeg/ffprobe。请先安装 FFmpeg（macOS: brew install ffmpeg）。")

    output.mkdir(parents=True, exist_ok=True)

    videos = sorted(
        (p for p in source.rglob("*") if p.is_file() and p.suffix.casefold() in VIDEO_EXTENSIONS),
        key=lambda p: (p.stat().st_mtime, str(p).casefold()),
    )
    if args.max_videos > 0:
        videos = videos[: args.max_videos]

    manifest: list[dict[str, object]] = []
    for video_index, video in enumerate(videos, start=1):
        media_id = f"V{video_index:04d}"
        media_dir = output / media_id
        media_dir.mkdir(parents=True, exist_ok=True)
        capture_time = datetime.fromtimestamp(video.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        relative = video.relative_to(source).as_posix()

        duration = probe_duration(ffprobe, video)
        if duration is None or duration <= 0:
            manifest.append({
                "MediaId": media_id, "RelativePath": relative, "CaptureTime": capture_time,
                "DurationSec": None, "FramePath": None, "TimestampSec": None,
                "FrameZone": None, "Status": "duration-unavailable",
            })
            continue

        for frame_index in range(1, args.frames_per_video + 1):
            position = duration * frame_index / (args.frames_per_video + 1)
            ratio = position / duration
            zone = "start" if ratio <= 0.2 else "end" if ratio >= 0.8 else "middle"
            position_text = f"{position:.3f}".rstrip("0").rstrip(".") or "0"
            frame_path = media_dir / f"{media_id}_F{frame_index:02d}_{position_text.replace('.', '_')}s.jpg"

            subprocess.run(
                [ffmpeg, "-hide_banner", "-loglevel", "error",
                 "-ss", f"{position:.3f}", "-i", str(video),
                 "-frames:v", "1",
                 "-vf", "scale=720:-2:force_original_aspect_ratio=decrease",
                 "-q:v", "3", "-y", str(frame_path)],
                capture_output=True, text=True, check=False,
            )
            manifest.append({
                "MediaId": media_id,
                "RelativePath": relative,
                "CaptureTime": capture_time,
                "DurationSec": round(duration, 3),
                "FramePath": str(frame_path),
                "TimestampSec": round(position, 3),
                "FrameZone": zone,
                "Status": "ok" if frame_path.is_file() else "frame-failed",
            })

    manifest_path = output / "review-manifest.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows([{key: safe_cell(value) for key, value in row.items()} for row in manifest])

    print(json.dumps({
        "source_dir": str(source),
        "output_dir": str(output),
        "manifest": str(manifest_path),
        "video_count": len(videos),
        "frame_count": sum(1 for row in manifest if row["Status"] == "ok"),
        "originals_modified": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
