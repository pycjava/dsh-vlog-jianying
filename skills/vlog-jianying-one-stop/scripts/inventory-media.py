#!/usr/bin/env python3
"""盘点素材目录，输出素材清单 CSV（inventory-media.ps1 的跨平台 Python 版）。

退出码约定（全技能脚本统一）：
  0  成功
  2  环境或输入错误（SourceDir 不存在、OutputCsv 位于素材目录内等）

ffprobe 缺失时降级：仍输出文件清单，探测字段留空、ProbeStatus 记为
ffprobe-unavailable，并向 stderr 打印醒目警告（不再静默降级）。
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MEDIA_EXTENSIONS = {
    ".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm",
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
    ".jpg", ".jpeg", ".png", ".heic", ".webp",
    ".srt", ".ass", ".vtt",
}
# 不对图片和字幕做 ffprobe 探测（与上游行为一致）
NON_PROBE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".webp", ".srt", ".ass", ".vtt"}

CSV_FIELDS = [
    "FileName", "RelativePath", "Extension", "SizeMB", "Modified",
    "creation_time", "creation_time_source", "DurationSec",
    "Width", "Height", "Orientation", "Fps",
    "VideoCodec", "AudioStreams", "AudioCodec", "AudioChannels", "AudioSampleHz",
    "ProbeStatus", "OriginalPath",
]

PROBE_ENTRIES = (
    "format=duration:format_tags=creation_time:"
    "stream=codec_type,codec_name,width,height,avg_frame_rate,channels,sample_rate"
)


def fail(message: str) -> "SystemExit":
    print(message, file=sys.stderr)
    return SystemExit(2)


def parse_creation_time(raw: object) -> datetime | None:
    if not raw:
        return None
    text = str(raw).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)  # 与上游 AssumeUniversal 一致
    return parsed.astimezone(timezone.utc)


def parse_fps(value: object) -> float | None:
    text = str(value or "")
    if "/" in text:
        num, _, den = text.partition("/")
        try:
            denominator = float(den)
            if denominator != 0:
                return round(float(num) / denominator, 3)
        except ValueError:
            return None
    return None


def probe_file(ffprobe: str, path: Path) -> tuple[dict[str, object], str]:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", PROBE_ENTRIES, "-of", "json", "--", str(path)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe exit {result.returncode}: {result.stderr.strip()[:200]}")
    probe = json.loads(result.stdout)

    info: dict[str, object] = {}
    fmt = probe.get("format") or {}
    duration = fmt.get("duration")
    if duration is not None:
        info["DurationSec"] = round(float(duration), 3)

    creation = parse_creation_time((fmt.get("tags") or {}).get("creation_time"))
    if creation is not None:
        info["creation_time"] = creation.isoformat().replace("+00:00", "Z")
        info["creation_time_source"] = "metadata"

    streams = probe.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    if video:
        info["Width"] = video.get("width")
        info["Height"] = video.get("height")
        info["VideoCodec"] = video.get("codec_name")
        info["Fps"] = parse_fps(video.get("avg_frame_rate"))
    info["AudioStreams"] = len(audio)
    if audio:
        info["AudioCodec"] = audio[0].get("codec_name")
        info["AudioChannels"] = audio[0].get("channels")
        info["AudioSampleHz"] = audio[0].get("sample_rate")
    return info, "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path, help="素材目录（递归扫描）")
    parser.add_argument("--output-csv", required=True, type=Path, help="输出 CSV 路径")
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个文件（0 = 不限制）")
    args = parser.parse_args()

    source = args.source_dir.expanduser().resolve()
    if not source.is_dir():
        raise fail(f"SourceDir 不存在或不是目录: {source}")

    output = args.output_csv.expanduser().resolve()
    if output == source or source in output.parents:
        raise fail("OutputCsv 必须位于素材目录之外；脚本绝不向素材目录写入。")
    output.parent.mkdir(parents=True, exist_ok=True)

    files = sorted(
        (p for p in source.rglob("*") if p.is_file() and p.suffix.casefold() in MEDIA_EXTENSIONS),
        key=lambda p: str(p).casefold(),
    )
    if args.limit > 0:
        files = files[: args.limit]

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        print(
            "警告: 未找到 ffprobe，输出仅包含文件级信息，无时长/画幅/拍摄时间。"
            "请先安装 FFmpeg（macOS: brew install ffmpeg）。",
            file=sys.stderr,
        )

    rows: list[dict[str, object]] = []
    for path in files:
        stat = path.stat()
        row: dict[str, object] = {
            "FileName": path.name,
            "RelativePath": path.relative_to(source).as_posix(),
            "Extension": path.suffix.casefold(),
            "SizeMB": round(stat.st_size / 1048576, 2),
            "Modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "creation_time": None,
            "creation_time_source": "none",
            "DurationSec": None,
            "Width": None,
            "Height": None,
            "Orientation": None,
            "Fps": None,
            "VideoCodec": None,
            "AudioStreams": 0,
            "AudioCodec": None,
            "AudioChannels": None,
            "AudioSampleHz": None,
            "ProbeStatus": "not-probed" if ffprobe else "ffprobe-unavailable",
            "OriginalPath": str(path),
        }
        if ffprobe and path.suffix.casefold() not in NON_PROBE_EXTENSIONS:
            try:
                info, status = probe_file(ffprobe, path)
                row.update(info)
                row["ProbeStatus"] = status
            except Exception as exc:  # 单文件失败不阻塞整体盘点
                row["ProbeStatus"] = f"error: {exc}"

        width, height = row["Width"], row["Height"]
        if isinstance(width, int) and isinstance(height, int) and width and height:
            row["Orientation"] = (
                "landscape" if width > height else "portrait" if height > width else "square"
            )
        rows.append(row)

    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(json.dumps({
        "source_dir": str(source),
        "output_csv": str(output),
        "media_count": len(rows),
        "ffprobe_available": ffprobe is not None,
        "originals_modified": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
