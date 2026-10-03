#!/usr/bin/env python3
"""按事实时间重建视频素材时间线（build-real-timeline.ps1 的跨平台 Python 版）。

优先使用媒体元数据 creation_time（高可信），缺失时退回文件 mtime（低可信，
仅作参考，不得单独硬否决用户明确的故事顺序）。超过阈值的间隔只标记为
场景边界候选，需结合 beat 地点或画面语义确认。

退出码约定（全技能脚本统一）：
  0  成功
  2  环境或输入错误（ffprobe 缺失、SourceDir 不存在、OutputCsv 位于素材目录内）
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

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
CSV_FIELDS = ["seq", "file", "start_ts", "duration", "gap_sec", "scene_break", "ts_source", "time_confidence"]


def fail(message: str) -> "SystemExit":
    print(message, file=sys.stderr)
    return SystemExit(2)


def safe_cell(value: object) -> object:
    """CSV 公式注入防护：= + - @ 或控制符开头的单元格加 ' 前缀，防止 Excel/Numbers 执行公式。"""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def parse_creation_time(raw: object) -> datetime | None:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)  # 与上游 AssumeUniversal 一致
    return parsed.astimezone(timezone.utc)


def probe_video(ffprobe: str, path: Path) -> tuple[float, datetime | None]:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration:format_tags=creation_time",
         "-of", "json", "--", str(path)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe exit {result.returncode}")
    probe = json.loads(result.stdout)
    fmt = probe.get("format") or {}
    duration = float(fmt.get("duration") or 0.0)
    creation = parse_creation_time((fmt.get("tags") or {}).get("creation_time"))
    return duration, creation


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path, help="素材目录（递归扫描）")
    parser.add_argument("--output-csv", required=True, type=Path, help="输出 CSV 路径")
    parser.add_argument("--scene-break-threshold", type=int, default=600, metavar="SECONDS",
                        help="场景边界候选间隔阈值，默认 600 秒")
    args = parser.parse_args()

    if not 1 <= args.scene_break_threshold <= 86400:
        raise fail("--scene-break-threshold 必须在 1..86400 之间")

    source = args.source_dir.expanduser().resolve()
    if not source.is_dir():
        raise fail(f"SourceDir 不存在或不是目录: {source}")

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise fail("未找到 ffprobe。请先安装 FFmpeg（macOS: brew install ffmpeg）。")

    output = args.output_csv.expanduser().resolve()
    if output == source or source in output.parents:
        raise fail("OutputCsv 必须位于素材目录之外；脚本绝不向素材目录写入。")
    output.parent.mkdir(parents=True, exist_ok=True)

    videos = [p for p in source.rglob("*") if p.is_file() and p.suffix.casefold() in VIDEO_EXTENSIONS]

    items: list[dict[str, object]] = []
    for video in videos:
        duration = 0.0
        start: datetime | None = None
        ts_source = "mtime"
        confidence = "low"
        try:
            duration, creation = probe_video(ffprobe, video)
            if creation is not None:
                start = creation
                ts_source = "creation_time"
                confidence = "high"
        except Exception as exc:
            print(f"警告: 无法读取 {video.name} 的媒体时间，退回 mtime: {exc}", file=sys.stderr)
        if start is None:
            start = datetime.fromtimestamp(video.stat().st_mtime, tz=timezone.utc)

        items.append({
            "file": video.relative_to(source).as_posix(),
            "start": start,
            "duration": max(0.0, duration),
            "ts_source": ts_source,
            "time_confidence": confidence,
        })

    items.sort(key=lambda item: (item["start"], item["file"]))

    rows: list[dict[str, object]] = []
    for index, item in enumerate(items):
        gap: float | None = None
        scene_break = 0
        if index > 0:
            previous = items[index - 1]
            previous_end = previous["start"].timestamp() + previous["duration"]
            gap = item["start"].timestamp() - previous_end
            if gap > args.scene_break_threshold:
                scene_break = 1
        rows.append({
            "seq": index + 1,
            "file": item["file"],
            "start_ts": item["start"].isoformat().replace("+00:00", "Z"),
            "duration": round(item["duration"], 3),
            "gap_sec": None if gap is None else round(gap, 3),
            "scene_break": scene_break,
            "ts_source": item["ts_source"],
            "time_confidence": item["time_confidence"],
        })

    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows([{key: safe_cell(value) for key, value in row.items()} for row in rows])

    print(json.dumps({
        "source_dir": str(source),
        "output_csv": str(output),
        "video_count": len(rows),
        "scene_break_candidates": sum(1 for row in rows if row["scene_break"] == 1),
        "originals_modified": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
