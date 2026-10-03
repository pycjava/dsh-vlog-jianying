#!/usr/bin/env python3
"""技能脚本的最小冒烟测试（纯标准库，无第三方依赖）。

运行：python3 tests/smoke_test.py

不依赖 ffmpeg 的用例始终执行；需要 ffmpeg/ffprobe 的端到端用例在检测到
工具缺失时自动跳过（输出 skips 计数）。所有素材均为临时生成的合成文件，
绝不触碰真实素材目录。
"""

from __future__ import annotations

import csv
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def run_script(name: str, *args: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPTS / name), *[str(a) for a in args]],
        capture_output=True, text=True, timeout=300, check=False,
    )


def load_module(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_test_video(path: Path, duration: int = 2, size: str = "320x576") -> None:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"testsrc=duration={duration}:size={size}:rate=30",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0:  # 部分 ffmpeg 构建没有 libx264，退回内置 mpeg4
        command[command.index("libx264")] = "mpeg4"
        result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0 or not path.is_file():
        raise RuntimeError(f"无法生成测试视频: {result.stderr.strip()[:300]}")


def make_test_audio(path: Path, duration: int = 6) -> None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"sine=frequency=220:duration={duration}",
         str(path)],
        capture_output=True, text=True, timeout=120, check=False,
    )
    if result.returncode != 0 or not path.is_file():
        raise RuntimeError(f"无法生成测试音频: {result.stderr.strip()[:300]}")


class PureLogicTest(unittest.TestCase):
    """不需要 ffmpeg 的逻辑与安全保护用例。"""

    def test_fnum_formatting(self) -> None:
        mix = load_module("mix-bgm.py")
        self.assertEqual(mix.fnum(0.35), "0.35")
        self.assertEqual(mix.fnum(0.0), "0")
        self.assertEqual(mix.fnum(1.8), "1.8")
        self.assertEqual(mix.fnum(100.0), "100")

    def test_gain_envelope_structure(self) -> None:
        mix = load_module("mix-bgm.py")
        expr = mix.gain_envelope(10.0, 20.0, 0.35, 0.10, 0.18, 100.0)
        self.assertIn("if(lt(t,9.82)", expr)       # 提前 transition 秒开始淡入
        self.assertIn("lte(t,20)", expr)           # 区间内保持目标音量
        self.assertIn("0.1", expr)                 # duck 目标
        expr_no_ramp = mix.gain_envelope(0.0, 100.0, 0.35, 0.45, 0.18, 100.0)
        self.assertFalse(expr_no_ramp.startswith("if(lt(t,0)"))  # 边界处不产生无效斜坡

    def test_check_env_reports(self) -> None:
        result = run_script("check-env.py", "--json")
        self.assertIn(result.returncode, (0, 2))
        report = json.loads(result.stdout)
        self.assertIn("required", report)
        self.assertEqual(set(report["required"]), {"ffmpeg", "ffprobe"})
        self.assertEqual(report["ok"], result.returncode == 0)

    def test_inventory_rejects_missing_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = run_script("inventory-media.py", "--source-dir", Path(tmp) / "nope",
                                "--output-csv", Path(tmp) / "out.csv")
        self.assertEqual(result.returncode, 2)
        self.assertIn("SourceDir", result.stderr)

    def test_inventory_refuses_output_inside_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "media"
            source.mkdir()
            result = run_script("inventory-media.py", "--source-dir", source,
                                "--output-csv", source / "盘点.csv")
        self.assertEqual(result.returncode, 2)
        self.assertIn("素材目录之外", result.stderr)

    def test_inventory_handles_garbage_media_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "素材 目录"   # 含中文与空格
            source.mkdir()
            (source / "坏文件.mp4").write_bytes(b"not a real video")
            output = Path(tmp) / "out.csv"
            result = run_script("inventory-media.py", "--source-dir", source, "--output-csv", output)
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open("r", encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["FileName"], "坏文件.mp4")
            # 有 ffprobe 时探测失败记 error，无 ffprobe 时记 unavailable；都不得崩溃
            self.assertTrue(rows[0]["ProbeStatus"].startswith(("error", "ffprobe-unavailable")))

    def test_timeline_refuses_output_inside_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "media"
            source.mkdir()
            result = run_script("build-real-timeline.py", "--source-dir", source,
                                "--output-csv", source / "时间线.csv")
        self.assertEqual(result.returncode, 2)

    def test_mix_rejects_missing_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = run_script("mix-bgm.py", "--video-path", Path(tmp) / "a.mp4",
                                "--bgm-path", Path(tmp) / "b.mp3",
                                "--output-path", Path(tmp) / "out.mp4")
        self.assertEqual(result.returncode, 2)

    def test_inventory_escapes_formula_filenames(self) -> None:
        """CSV 公式注入防护:= + - @ 开头的文件名写入 CSV 前必须加 ' 前缀。"""
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "media"
            source.mkdir()
            (source / '=HYPERLINK("evil.example","点我").mp4').write_bytes(b"x")
            (source / "+加号开头.mp4").write_bytes(b"x")
            (source / "普通文件.mp4").write_bytes(b"x")
            output = Path(tmp) / "out.csv"
            result = run_script("inventory-media.py", "--source-dir", source, "--output-csv", output)
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open("r", encoding="utf-8-sig", newline="") as handle:
                names = {row["FileName"] for row in csv.DictReader(handle)}
            self.assertIn("'=HYPERLINK(\"evil.example\",\"点我\").mp4", names)
            self.assertIn("'+加号开头.mp4", names)
            self.assertIn("普通文件.mp4", names)  # 正常文件名不受影响

    def test_frames_refuses_output_inside_source(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "media"
            source.mkdir()
            result = run_script("prepare-review-frames.py", "--source-dir", source,
                                "--output-dir", source / "预览")
        self.assertEqual(result.returncode, 2)
        self.assertIn("素材目录之外", result.stderr)

    def test_verify_rejects_missing_file(self) -> None:
        result = run_script("verify-export.py", "--video-path", "/nonexistent/final.mp4")
        self.assertEqual(result.returncode, 2)

    def test_transcribe_reports_missing_dependency_or_runs(self) -> None:
        # 不调用模型下载，仅验证缺依赖时是友好报错而非裸 ImportError
        spec = importlib.util.find_spec("faster_whisper")
        if spec is not None:
            self.skipTest("faster_whisper 已安装，无法验证缺失分支")
        with tempfile.TemporaryDirectory() as tmp:
            result = run_script("transcribe-dialogue.py", "in.mp4",
                                Path(tmp) / "out.srt", Path(tmp) / "diag.json", Path(tmp) / "model")
        self.assertEqual(result.returncode, 2)
        self.assertIn("faster-whisper", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


@unittest.skipUnless(FFMPEG_AVAILABLE, "需要 ffmpeg/ffprobe")
class EndToEndTest(unittest.TestCase):
    """使用 ffmpeg 合成素材的端到端用例。"""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.source = self.work / "素材"
        self.source.mkdir()
        make_test_video(self.source / "片段A.mp4", duration=2)
        make_test_audio(self.work / "bgm.wav", duration=6)

    def test_full_pipeline(self) -> None:
        inventory_csv = self.work / "盘点.csv"
        result = run_script("inventory-media.py", "--source-dir", self.source, "--output-csv", inventory_csv)
        self.assertEqual(result.returncode, 0, result.stderr)
        with inventory_csv.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ProbeStatus"], "ok")
        self.assertEqual(rows[0]["Orientation"], "portrait")
        self.assertGreaterEqual(int(rows[0]["AudioStreams"]), 1)

        timeline_csv = self.work / "时间线.csv"
        result = run_script("build-real-timeline.py", "--source-dir", self.source, "--output-csv", timeline_csv)
        self.assertEqual(result.returncode, 0, result.stderr)
        with timeline_csv.open("r", encoding="utf-8-sig", newline="") as handle:
            timeline = list(csv.DictReader(handle))
        self.assertEqual(len(timeline), 1)
        self.assertEqual(timeline[0]["seq"], "1")
        self.assertIn(timeline[0]["ts_source"], ("creation_time", "mtime"))

        frames_dir = self.work / "预览"
        result = run_script("prepare-review-frames.py", "--source-dir", self.source,
                            "--output-dir", frames_dir, "--frames-per-video", 3)
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual(summary["frame_count"], 3)
        self.assertTrue((frames_dir / "V0001").is_dir())

        master = self.source / "片段A.mp4"
        intervals_csv = self.work / "声音区间.csv"
        intervals_csv.write_text("start,end,sound_role,note\n0,1,dialogue,测试对白\n", encoding="utf-8")
        final = self.work / "交付" / "final.mp4"
        result = run_script("mix-bgm.py", "--video-path", master, "--bgm-path", self.work / "bgm.wav",
                            "--output-path", final, "--sound-intervals-csv", intervals_csv)
        self.assertEqual(result.returncode, 0, result.stderr)
        mix_summary = json.loads(result.stdout)
        self.assertEqual(mix_summary["mix_mode"], "semantic-intervals")
        self.assertFalse(mix_summary["originals_modified"])

        result = run_script("verify-export.py", "--video-path", final,
                            "--target-seconds", 2, "--expected-width", 320,
                            "--expected-height", 576, "--expected-fps", 30)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertTrue(json.loads(result.stdout)["passed"])

    def test_mix_protects_existing_output(self) -> None:
        final = self.work / "final.mp4"
        make_test_video(final, duration=1)
        result = run_script("mix-bgm.py", "--video-path", self.source / "片段A.mp4",
                            "--bgm-path", self.work / "bgm.wav", "--output-path", final)
        self.assertEqual(result.returncode, 2)
        self.assertIn("--force", result.stderr)

    def test_mix_refuses_to_overwrite_input(self) -> None:
        master = self.source / "片段A.mp4"
        result = run_script("mix-bgm.py", "--video-path", master,
                            "--bgm-path", self.work / "bgm.wav", "--output-path", master)
        self.assertEqual(result.returncode, 2)
        self.assertIn("不得覆盖", result.stderr)

    def test_mix_rejects_invalid_interval_role(self) -> None:
        bad_csv = self.work / "bad.csv"
        bad_csv.write_text("start,end,sound_role\n0,1,music\n", encoding="utf-8")
        result = run_script("mix-bgm.py", "--video-path", self.source / "片段A.mp4",
                            "--bgm-path", self.work / "bgm.wav",
                            "--output-path", self.work / "out.mp4",
                            "--sound-intervals-csv", bad_csv)
        self.assertEqual(result.returncode, 2)
        self.assertIn("sound_role", result.stderr)

    def test_verify_detects_wrong_width(self) -> None:
        result = run_script("verify-export.py", "--video-path", self.source / "片段A.mp4",
                            "--expected-width", 9999)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(json.loads(result.stdout)["checks"]["width_ok"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
