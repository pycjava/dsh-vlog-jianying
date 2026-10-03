#!/usr/bin/env python3
"""环境自检：报告本技能运行所需的工具与可选依赖状态。

退出码约定（全技能脚本统一）：
  0  必需依赖全部就绪
  2  必需依赖缺失或使用方式错误（可选依赖缺失不导致失败）

必需：Python、ffmpeg、ffprobe（阶段 2/4/5/6 的媒体处理依赖）。
可选：faster-whisper（本地备用转写）、librosa（曲库节拍分析）。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import subprocess
import sys

REQUIRED_TOOLS = ("ffmpeg", "ffprobe")
OPTIONAL_PY_MODULES = {
    "faster_whisper": "本地备用转写 transcribe-dialogue.py（pip install faster-whisper）",
    "librosa": "曲库节拍分析 build-music-index.py（pip install librosa；缺失时自动降级）",
}


def tool_version(name: str) -> str | None:
    path = shutil.which(name)
    if not path:
        return None
    try:
        result = subprocess.run(
            [path, "-version"], capture_output=True, text=True, timeout=15, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return "unknown"
    first_line = (result.stdout or result.stderr).splitlines()
    return first_line[0].strip() if first_line else "unknown"


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="只输出 JSON 结果")
    args = parser.parse_args()

    report: dict[str, object] = {"python": sys.version.split()[0], "required": {}, "optional": {}}
    missing_required: list[str] = []

    for tool in REQUIRED_TOOLS:
        version = tool_version(tool)
        report["required"][tool] = {"available": version is not None, "version": version}
        if version is None:
            missing_required.append(tool)

    for module, purpose in OPTIONAL_PY_MODULES.items():
        report["optional"][module] = {"available": module_available(module), "purpose": purpose}

    ok = not missing_required
    report["ok"] = ok

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"Python: {report['python']}")
        for tool, info in report["required"].items():
            mark = "OK" if info["available"] else "缺失"
            detail = f"（{info['version']}）" if info["version"] else ""
            print(f"[必需] {tool}: {mark}{detail}")
        for module, info in report["optional"].items():
            mark = "OK" if info["available"] else "缺失（功能降级，不阻塞）"
            print(f"[可选] {module}: {mark} — {info['purpose']}")
        if not ok:
            hint = "brew install ffmpeg" if sys.platform == "darwin" else "安装 FFmpeg 并加入 PATH"
            print(f"\n缺少必需工具: {', '.join(missing_required)}。安装建议：{hint}", file=sys.stderr)

    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
