#!/usr/bin/env python3
"""校验最终成片文件（verify-export.ps1 的跨平台 Python 版）。

只确认文件可播放、时长、画幅、帧率和音视频流，不替代完整审片。
结果以 JSON 输出到 stdout。

退出码约定（全技能脚本统一）：
  0  全部检查通过
  2  任一检查失败，或环境/输入错误（ffprobe 缺失、文件不存在）
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

PROBE_ENTRIES = (
    "format=duration,format_name,size:"
    "stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels"
)


def fail(message: str) -> "SystemExit":
    print(message, file=sys.stderr)
    return SystemExit(2)


def parse_fps(value: object) -> float:
    text = str(value or "")
    if "/" in text:
        num, _, den = text.partition("/")
        try:
            denominator = float(den)
            if denominator != 0:
                return float(num) / denominator
        except ValueError:
            pass
    return 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-path", required=True, type=Path, help="待校验的成片文件")
    parser.add_argument("--target-seconds", type=float, default=0, help="目标时长（秒，0 = 不校验）")
    parser.add_argument("--expected-width", type=int, default=0, help="期望宽度（0 = 不校验）")
    parser.add_argument("--expected-height", type=int, default=0, help="期望高度（0 = 不校验）")
    parser.add_argument("--expected-fps", type=float, default=0, help="期望帧率（0 = 不校验）")
    parser.add_argument("--duration-tolerance", type=float, default=1.0, help="时长容差秒数，默认 1.0")
    args = parser.parse_args()

    video_path = args.video_path.expanduser().resolve()
    if not video_path.is_file():
        raise fail(f"文件不存在: {video_path}")

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise fail("未找到 ffprobe。请先安装 FFmpeg（macOS: brew install ffmpeg）。")

    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", PROBE_ENTRIES, "-of", "json", "--", str(video_path)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise fail(f"ffprobe 无法解析文件: {result.stderr.strip()[:300]}")

    probe = json.loads(result.stdout)
    streams = probe.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    duration = float((probe.get("format") or {}).get("duration") or 0.0)
    fps = parse_fps(video.get("avg_frame_rate")) if video else 0.0

    checks = {
        "file_exists": True,
        "file_non_empty": video_path.stat().st_size > 0,
        "has_video_stream": video is not None,
        "has_audio_stream": len(audio) > 0,
        "duration_ok": abs(duration - args.target_seconds) <= args.duration_tolerance
        if args.target_seconds > 0 else True,
        "width_ok": (video or {}).get("width") == args.expected_width if args.expected_width > 0 else True,
        "height_ok": (video or {}).get("height") == args.expected_height if args.expected_height > 0 else True,
        "fps_ok": abs(fps - args.expected_fps) < 0.05 if args.expected_fps > 0 else True,
    }
    passed = all(checks.values())

    print(json.dumps({
        "passed": passed,
        "path": str(video_path),
        "size_mb": round(video_path.stat().st_size / 1048576, 2),
        "duration_sec": round(duration, 3),
        "video_codec": (video or {}).get("codec_name"),
        "width": (video or {}).get("width"),
        "height": (video or {}).get("height"),
        "fps": round(fps, 3),
        "audio_streams": len(audio),
        "audio_codec": audio[0].get("codec_name") if audio else None,
        "audio_sample_hz": audio[0].get("sample_rate") if audio else None,
        "audio_channels": audio[0].get("channels") if audio else None,
        "checks": checks,
    }, ensure_ascii=False, indent=2))
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
