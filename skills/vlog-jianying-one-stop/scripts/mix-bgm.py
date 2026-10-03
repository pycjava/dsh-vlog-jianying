#!/usr/bin/env python3
"""把本地 BGM 与无 BGM 母版混音为最终成片（mix-bgm.ps1 的跨平台 Python 版）。

声音区间表（--sound-intervals-csv）是默认主控：dialogue/key_interaction 区间
降低 BGM，scenery_montage 区间提高 BGM，ambience 保持默认。只有无法可靠建立
区间表时才退回 sidechain 降级模式——它分不清“人物在说话”和“环境很响”。

安全约束：输出不得覆盖母版或音乐原件；输出已存在时必须显式 --force；
写临时文件成功后再原子替换，失败不留假成片。

退出码约定（全技能脚本统一）：
  0  成功
  2  环境、输入或参数错误，或 ffmpeg 混音失败
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

SOUND_ROLES = ("dialogue", "key_interaction", "ambience", "scenery_montage")


def fail(message: str) -> "SystemExit":
    print(message, file=sys.stderr)
    return SystemExit(2)


def fnum(value: float) -> str:
    """等价于上游的 ToString('0.######')：最多 6 位小数，无尾随零。"""
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text else "0"


def probe(ffprobe: str, path: Path) -> dict:
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type",
         "-of", "json", "--", str(path)],
        capture_output=True, text=True, timeout=60, check=False,
    )
    if result.returncode != 0:
        raise fail(f"ffprobe 无法解析文件: {path}")
    return json.loads(result.stdout)


def probe_duration_and_audio(ffprobe: str, path: Path) -> tuple[float, bool]:
    data = probe(ffprobe, path)
    duration = float((data.get("format") or {}).get("duration") or 0.0)
    has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams") or [])
    return duration, has_audio


def gain_envelope(start: float, end: float, base: float, target: float, ramp: float, duration: float) -> str:
    """生成 ffmpeg volume 表达式：区间内从 base 渐变到 target，区间外恢复 base。"""
    start_ramp = max(0.0, start - ramp)
    end_ramp = min(duration, end + ramp)
    base_t, target_t = fnum(base), fnum(target)
    start_t, end_t = fnum(start), fnum(end)
    start_ramp_t, end_ramp_t = fnum(start_ramp), fnum(end_ramp)

    if end_ramp > end:
        after = (
            f"if(lte(t,{end_t}),{target_t},"
            f"if(lt(t,{end_ramp_t}),{target_t}+({base_t}-{target_t})*(t-{end_t})/({end_ramp_t}-{end_t}),{base_t}))"
        )
    else:
        after = f"if(lte(t,{end_t}),{target_t},{base_t})"

    if start > start_ramp:
        return (
            f"if(lt(t,{start_ramp_t}),{base_t},"
            f"if(lt(t,{start_t}),{base_t}+({target_t}-{base_t})*(t-{start_ramp_t})/({start_t}-{start_ramp_t}),{after}))"
        )
    return after


def load_sound_intervals(csv_path: Path, video_duration: float) -> list[dict[str, float | str]]:
    intervals: list[dict[str, float | str]] = []
    try:
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                role = (row.get("sound_role") or row.get("type") or "").strip().casefold()
                if role not in SOUND_ROLES:
                    raise ValueError(f"不支持的 sound_role '{role}'（允许值: {', '.join(SOUND_ROLES)}）")
                start = float(str(row.get("start") or "").strip())
                end = float(str(row.get("end") or "").strip())
                if start < 0 or end <= start or end > video_duration + 0.05:
                    raise ValueError(f"非法区间 {start}-{end}（{role}），成片时长 {video_duration:.3f}s")
                intervals.append({
                    "start": max(0.0, start),
                    "end": min(video_duration, end),
                    "role": role,
                })
    except (OSError, ValueError, csv.Error) as exc:
        raise fail(f"声音区间 CSV 无效: {exc}")
    return intervals


def update_music_index(index_csv: Path, bgm: Path) -> None:
    """命中曲目时 use_count +1 并记录 last_used；临时文件原子替换。"""
    if not index_csv.is_file():
        return
    index_path = index_csv.resolve()
    with index_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    matched = False
    for row in rows:
        file_value = (row.get("file") or "").strip()
        if file_value and Path(file_value).expanduser().resolve() == bgm:
            try:
                row["use_count"] = str(int(row.get("use_count") or 0) + 1)
            except ValueError:
                row["use_count"] = "1"
            row["last_used"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            matched = True

    if not matched:
        return
    temp = index_path.with_name(index_path.name + ".tmp")
    with temp.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    temp.replace(index_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-path", required=True, type=Path, help="无 BGM 母版")
    parser.add_argument("--bgm-path", required=True, type=Path, help="本地音乐文件")
    parser.add_argument("--output-path", required=True, type=Path, help="输出成片路径")
    parser.add_argument("--start-seconds", type=float, default=0, help="音乐入点（秒）")
    parser.add_argument("--bgm-volume", type=float, default=0.35, help="BGM 基准音量（默认 0.35）")
    parser.add_argument("--sound-intervals-csv", type=Path, default=None, help="声音区间表 CSV")
    parser.add_argument("--duck-volume", type=float, default=0.10, help="人声区间 BGM 音量（默认 0.10）")
    parser.add_argument("--music-lead-volume", type=float, default=0.45, help="纯景色区间 BGM 音量（默认 0.45）")
    parser.add_argument("--transition-seconds", type=float, default=0.18, help="区间边缘过渡秒数（默认 0.18）")
    parser.add_argument("--sidechain-threshold", type=float, default=0.03)
    parser.add_argument("--sidechain-ratio", type=float, default=8)
    parser.add_argument("--attack-ms", type=float, default=200)
    parser.add_argument("--release-ms", type=float, default=600)
    parser.add_argument("--fade-out-seconds", type=float, default=1.8, help="片尾 BGM 淡出秒数（默认 1.8）")
    parser.add_argument("--index-csv", type=Path, default=None, help="曲库索引 CSV（命中时更新使用计数）")
    parser.add_argument("--force", action="store_true", help="允许覆盖已存在的输出文件")
    args = parser.parse_args()

    ranges = [
        ("--start-seconds", args.start_seconds, 0, 86400),
        ("--bgm-volume", args.bgm_volume, 0.01, 2.0),
        ("--duck-volume", args.duck_volume, 0.0, 2.0),
        ("--music-lead-volume", args.music_lead_volume, 0.01, 2.0),
        ("--transition-seconds", args.transition_seconds, 0.01, 2.0),
        ("--sidechain-threshold", args.sidechain_threshold, 0.001, 1.0),
        ("--sidechain-ratio", args.sidechain_ratio, 1, 20),
        ("--attack-ms", args.attack_ms, 1, 2000),
        ("--release-ms", args.release_ms, 1, 5000),
        ("--fade-out-seconds", args.fade_out_seconds, 0.1, 10),
    ]
    for name, value, low, high in ranges:
        if not low <= value <= high:
            raise fail(f"{name} 必须在 {low}..{high} 之间，当前为 {value}")

    video = args.video_path.expanduser().resolve()
    bgm = args.bgm_path.expanduser().resolve()
    if not video.is_file() or not bgm.is_file():
        raise fail(f"输入文件不存在: {'' if video.is_file() else video} {'' if bgm.is_file() else bgm}".strip())

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise fail("未找到 ffmpeg/ffprobe。请先安装 FFmpeg（macOS: brew install ffmpeg）。")

    output = args.output_path.expanduser().resolve()
    if output == video or output == bgm:
        raise fail("OutputPath 不得覆盖无 BGM 母版或音乐原件。")
    if output.exists() and not args.force:
        raise fail("OutputPath 已存在。请使用递增版本名，或显式传入 --force。")
    output.parent.mkdir(parents=True, exist_ok=True)

    video_duration, video_has_audio = probe_duration_and_audio(ffprobe, video)
    bgm_duration, bgm_has_audio = probe_duration_and_audio(ffprobe, bgm)

    if not bgm_has_audio:
        raise fail("BGM 文件没有音频流。")
    if (bgm_duration - args.start_seconds) + 0.05 < video_duration:
        raise fail(
            f"BGM 剩余时长不足: 需要 {video_duration:.3f}s，"
            f"从入点起可用 {bgm_duration - args.start_seconds:.3f}s。"
        )
    if args.music_lead_volume < args.bgm_volume:
        raise fail("--music-lead-volume 必须大于等于 --bgm-volume。")

    intervals: list[dict[str, float | str]] = []
    if args.sound_intervals_csv is not None:
        interval_path = args.sound_intervals_csv.expanduser().resolve()
        if not interval_path.is_file():
            raise fail(f"声音区间 CSV 不存在: {interval_path}")
        intervals = load_sound_intervals(interval_path, video_duration)

    trim_duration = fnum(video_duration)
    start_text = fnum(args.start_seconds)
    fade_duration = min(args.fade_out_seconds, video_duration)
    fade_start = fnum(max(0.0, video_duration - fade_duration))
    fade_duration_text = fnum(fade_duration)
    volume_text = fnum(args.bgm_volume)

    if video_has_audio:
        if intervals:
            gain_expression = volume_text
            for interval in [i for i in intervals if i["role"] == "scenery_montage"]:
                envelope = gain_envelope(
                    float(interval["start"]), float(interval["end"]),
                    args.bgm_volume, args.music_lead_volume,
                    args.transition_seconds, video_duration,
                )
                gain_expression = f"max({gain_expression},{envelope})"
            for interval in [i for i in intervals if i["role"] in ("dialogue", "key_interaction")]:
                # min() 一侧在区间外必须给出最大可能增益，否则会压低别处的 scenery_montage
                envelope = gain_envelope(
                    float(interval["start"]), float(interval["end"]),
                    args.music_lead_volume, args.duck_volume,
                    args.transition_seconds, video_duration,
                )
                gain_expression = f"min({gain_expression},{envelope})"

            filter_complex = (
                "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[base];"
                f"[1:a]atrim=start={start_text}:duration={trim_duration},asetpts=PTS-STARTPTS,"
                f"aformat=sample_rates=48000:channel_layouts=stereo,"
                f"volume='{gain_expression}':eval=frame,"
                f"afade=t=out:st={fade_start}:d={fade_duration_text}[bgm];"
                "[base][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
                "alimiter=limit=0.95[outa]"
            )
            mix_mode = "semantic-intervals"
        else:
            filter_complex = (
                "[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[base][side];"
                f"[1:a]atrim=start={start_text}:duration={trim_duration},asetpts=PTS-STARTPTS,"
                f"aformat=sample_rates=48000:channel_layouts=stereo,"
                f"volume={volume_text},afade=t=out:st={fade_start}:d={fade_duration_text}[bgm];"
                f"[bgm][side]sidechaincompress=threshold={fnum(args.sidechain_threshold)}"
                f":ratio={fnum(args.sidechain_ratio)}:attack={fnum(args.attack_ms)}"
                f":release={fnum(args.release_ms)}[ducked];"
                "[base][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
                "alimiter=limit=0.95[outa]"
            )
            mix_mode = "sidechain-fallback"
    else:
        if intervals:
            raise fail("提供了声音区间表，但无 BGM 母版没有音频流。")
        filter_complex = (
            f"[1:a]atrim=start={start_text}:duration={trim_duration},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo,"
            f"volume={volume_text},afade=t=out:st={fade_start}:d={fade_duration_text},"
            "alimiter=limit=0.95[outa]"
        )
        mix_mode = "bgm-only"

    temporary = output.parent / f"{output.stem}.tmp.{uuid.uuid4().hex}.mp4"
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(video), "-i", str(bgm),
        "-filter_complex", filter_complex,
        "-map", "0:v:0", "-map", "[outa]",
        "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
        "-movflags", "+faststart",
        str(temporary),
    ]

    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=1800, check=False)
        if result.returncode != 0 or not temporary.is_file() or temporary.stat().st_size <= 0:
            raise fail(f"ffmpeg 混音失败（exit {result.returncode}）: {result.stderr.strip()[:500]}")
        if output.exists() and args.force:
            output.unlink()
        temporary.replace(output)
    except SystemExit:
        temporary.unlink(missing_ok=True)
        raise
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    if args.index_csv is not None:
        update_music_index(args.index_csv.expanduser(), bgm)

    print(json.dumps({
        "output_path": str(output),
        "duration_sec": round(video_duration, 3),
        "bgm_path": str(bgm),
        "start_seconds": args.start_seconds,
        "mix_mode": mix_mode,
        "sound_interval_count": len(intervals),
        "sidechain_applied": mix_mode == "sidechain-fallback",
        "originals_modified": False,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
