#!/usr/bin/env python3
"""Build a non-destructive local BGM index with optional librosa analysis."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path


FIELDS = [
    "file",
    "duration",
    "bpm",
    "energy_peak_time",
    "has_vocals",
    "mood_tags",
    "beat_times_file",
    "last_used",
    "use_count",
    "analysis_status",
]

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}

MOOD_KEYWORDS = {
    "压抑": ("压抑", "dark", "sad", "moody"),
    "紧张": ("紧张", "tense", "suspense"),
    "期待": ("期待", "hope", "build", "anticipation"),
    "放松": ("放松", "relax", "chill", "lofi"),
    "温暖": ("温暖", "warm", "cozy"),
    "欢快": ("欢快", "happy", "upbeat", "cheerful"),
    "爽快": ("爽快", "energetic", "energy", "power"),
    "怅然": ("怅然", "nostalgia", "nostalgic"),
    "空灵": ("空灵", "ambient", "ethereal"),
    "荒诞": ("荒诞", "funny", "comic", "quirky"),
    "旅行": ("旅行", "travel", "journey", "roadtrip"),
}


def safe_cell(value: object) -> object:
    """CSV 公式注入防护（本地适配补丁）：= + - @ 或控制符开头的单元格加 ' 前缀。"""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a local Vlog music index.")
    parser.add_argument("library", help="Local music library directory")
    parser.add_argument("--output", required=True, help="Output music-index.csv")
    return parser.parse_args()


def load_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    rows: dict[str, dict[str, str]] = {}
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get("file"):
                    rows[str(Path(row["file"]).resolve()).casefold()] = row
    except (OSError, csv.Error):
        return {}
    return rows


def probe_duration(ffprobe: str, media: Path) -> float | None:
    command = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(media),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return None


def infer_moods(name: str) -> str:
    lowered = name.casefold()
    tags = [tag for tag, keywords in MOOD_KEYWORDS.items() if any(k.casefold() in lowered for k in keywords)]
    return "|".join(tags)


def infer_vocals(name: str) -> str:
    lowered = name.casefold()
    instrumental = ("instrumental", "inst.", "伴奏", "纯音乐", "无人声", "no vocal")
    vocal = ("vocal", "人声版", "演唱版")
    if any(token in lowered for token in instrumental):
        return "no"
    if any(token in lowered for token in vocal):
        return "yes"
    return "unknown"


def analyze_with_librosa(media: Path, beats_dir: Path) -> tuple[str, str, str, str]:
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return "", "", "", "degraded:no-librosa"

    try:
        signal, sample_rate = librosa.load(str(media), sr=22050, mono=True)
        if signal.size == 0:
            return "", "", "", "degraded:empty-audio"

        tempo, beat_frames = librosa.beat.beat_track(y=signal, sr=sample_rate)
        tempo_value = float(np.asarray(tempo).reshape(-1)[0]) if np.asarray(tempo).size else 0.0
        beat_times = [round(float(value), 6) for value in librosa.frames_to_time(beat_frames, sr=sample_rate)]

        rms = librosa.feature.rms(y=signal)[0]
        peak_time = ""
        if rms.size:
            peak_frame = int(np.argmax(rms))
            peak_time = f"{float(librosa.frames_to_time(peak_frame, sr=sample_rate)):.3f}"

        digest_source = f"{media.resolve()}|{media.stat().st_size}|{media.stat().st_mtime_ns}"
        digest = hashlib.sha1(digest_source.encode("utf-8")).hexdigest()[:16]
        beats_dir.mkdir(parents=True, exist_ok=True)
        beat_path = beats_dir / f"{digest}.beats.json"
        payload = {
            "source": str(media.resolve()),
            "bpm": round(tempo_value, 3) if tempo_value > 0 else None,
            "beat_times": beat_times,
        }
        beat_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        bpm = f"{tempo_value:.3f}" if tempo_value > 0 else ""
        return bpm, peak_time, str(beat_path.resolve()), "ok"
    except Exception as exc:
        return "", "", "", f"degraded:librosa-error:{type(exc).__name__}"


def write_status(output: Path, payload: dict[str, object]) -> None:
    status_path = output.with_suffix(".status.json")
    status_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    args = parse_args()
    library = Path(args.library).expanduser()
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        print("ffprobe unavailable", file=sys.stderr)
        return 2

    existing = load_existing(output)
    if library.exists() and library.is_dir():
        media_files = sorted(
            (path for path in library.rglob("*") if path.is_file() and path.suffix.casefold() in AUDIO_EXTENSIONS),
            key=lambda path: str(path).casefold(),
        )
    else:
        media_files = []

    rows: list[dict[str, str]] = []
    beats_dir = output.parent / "beats"

    for media in media_files:
        resolved = media.resolve()
        old = existing.get(str(resolved).casefold(), {})
        duration = probe_duration(ffprobe, resolved)
        bpm, energy_peak, beat_file, analysis_status = analyze_with_librosa(resolved, beats_dir)

        if not beat_file and old.get("beat_times_file") and Path(old["beat_times_file"]).exists():
            beat_file = old["beat_times_file"]
        if not bpm:
            bpm = old.get("bpm", "")
        if not energy_peak:
            energy_peak = old.get("energy_peak_time", "")

        rows.append(
            {
                "file": str(resolved),
                "duration": "" if duration is None else f"{duration:.3f}",
                "bpm": bpm,
                "energy_peak_time": energy_peak,
                "has_vocals": old.get("has_vocals") or infer_vocals(resolved.stem),
                "mood_tags": old.get("mood_tags") or infer_moods(resolved.stem),
                "beat_times_file": beat_file,
                "last_used": old.get("last_used", ""),
                "use_count": old.get("use_count", "0") or "0",
                "analysis_status": analysis_status,
            }
        )

    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows([{key: safe_cell(value) for key, value in row.items()} for row in rows])

    degraded = sum(1 for row in rows if row["analysis_status"] != "ok")
    write_status(
        output,
        {
            "library": str(library.resolve()),
            "library_exists": library.is_dir(),
            "track_count": len(rows),
            "degraded_count": degraded,
            "originals_modified": False,
        },
    )
    print(json.dumps({"output": str(output), "track_count": len(rows), "degraded_count": degraded}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
