from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_video", type=Path)
    parser.add_argument("output_srt", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("--model", default="small")
    parser.add_argument("--min-logprob", type=float, default=-1.0)
    parser.add_argument("--max-no-speech-prob", type=float, default=0.60)
    parser.add_argument("--min-duration", type=float, default=0.20)
    args = parser.parse_args()

    args.output_srt.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.model_dir.mkdir(parents=True, exist_ok=True)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "缺少依赖 faster-whisper，本地备用转写不可用。\n"
            "安装：python3 -m pip install -r scripts/requirements.txt\n"
            "（推荐使用独立虚拟环境：python3 -m venv .venv && source .venv/bin/activate）",
            file=sys.stderr,
        )
        raise SystemExit(2)

    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        download_root=str(args.model_dir),
    )
    segments, info = model.transcribe(
        str(args.input_video),
        language="zh",
        beam_size=5,
        temperature=0,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 350},
        condition_on_previous_text=False,
        word_timestamps=True,
    )

    rows: list[dict[str, object]] = []
    for segment in segments:
        text = segment.text.strip()
        duration = segment.end - segment.start
        if (
            not text
            or duration < args.min_duration
            or segment.avg_logprob < args.min_logprob
            or segment.no_speech_prob > args.max_no_speech_prob
        ):
            continue
        rows.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
                "avg_logprob": round(segment.avg_logprob, 4),
                "no_speech_prob": round(segment.no_speech_prob, 4),
                "words": [
                    {
                        "start": None if word.start is None else round(word.start, 3),
                        "end": None if word.end is None else round(word.end, 3),
                        "word": word.word,
                        "probability": round(word.probability, 4),
                    }
                    for word in (segment.words or [])
                ],
            }
        )

    srt_blocks = []
    for index, row in enumerate(rows, start=1):
        srt_blocks.append(
            f"{index}\n{srt_time(float(row['start']))} --> {srt_time(float(row['end']))}\n{row['text']}"
        )
    args.output_srt.write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8-sig")
    args.output_json.write_text(
        json.dumps(
            {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "segments": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"language={info.language} probability={info.language_probability:.4f}")
    print(f"segments={len(rows)} duration={info.duration:.3f}")
    print(args.output_srt)


if __name__ == "__main__":
    main()
