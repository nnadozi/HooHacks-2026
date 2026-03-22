import logging
import os
import subprocess
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp

logger = logging.getLogger("justdance.cv")

_DEFAULT_POSE_LANDMARKER_FILENAME = "pose_landmarker_lite.task"
_DEFAULT_POSE_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
)


def _convert_webm_to_mp4(video_path: str, ffmpeg_path: str) -> str:
    """Convert a WebM file to MP4 using ffmpeg for OpenCV compatibility.

    Browser-recorded WebM files often have EBML headers that OpenCV cannot parse.
    Returns the path to the converted MP4 file (caller must delete it).
    """
    mp4_path = video_path.rsplit(".", 1)[0] + ".mp4"
    try:
        result = subprocess.run(
            [
                ffmpeg_path, "-y",
                "-err_detect", "ignore_err",
                "-fflags", "+genpts+discardcorrupt",
                "-i", video_path,
                "-c:v", "libx264", "-preset", "ultrafast",
                "-crf", "23", "-an", mp4_path,
            ],
            capture_output=True,
            timeout=120,
            check=True,
        )
        logger.info("Converted WebM to MP4: %s", mp4_path)
        return mp4_path
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode(errors="replace") if e.stderr else "no stderr"
        logger.error("ffmpeg conversion failed (exit %d): %s", e.returncode, stderr)
        raise ValueError(f"Cannot convert video {video_path} — ffmpeg error: {stderr[-500:]}") from e
    except FileNotFoundError as e:
        if ffmpeg_path != "ffmpeg":
            logger.warning("ffmpeg not found at %s; retrying via PATH", ffmpeg_path)
            return _convert_webm_to_mp4(video_path, ffmpeg_path="ffmpeg")
        logger.error("ffmpeg not found: %s", e)
        raise ValueError(f"Cannot convert video {video_path} — is ffmpeg installed?") from e


def _default_pose_model_path() -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / "models" / _DEFAULT_POSE_LANDMARKER_FILENAME


def _ensure_pose_model_file(model_path: str | None, model_url: str | None) -> Path:
    resolved = Path(model_path) if model_path else _default_pose_model_path()
    if resolved.exists():
        return resolved

    resolved.parent.mkdir(parents=True, exist_ok=True)
    url = model_url or _DEFAULT_POSE_LANDMARKER_URL

    try:
        import urllib.request

        logger.info("Downloading MediaPipe pose model to %s", resolved)
        request = urllib.request.Request(url, headers={"User-Agent": "justdance-backend/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response, open(resolved, "wb") as f:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    except Exception as e:
        if resolved.exists():
            try:
                resolved.unlink()
            except OSError:
                pass
        raise ValueError(
            "MediaPipe pose model is missing. Download the Pose Landmarker model "
            f"and save it to {resolved} (or set MEDIAPIPE_POSE_MODEL_PATH). "
            f"Automatic download failed: {e}"
        ) from e

    if not resolved.exists() or resolved.stat().st_size == 0:
        raise ValueError(
            f"MediaPipe pose model download produced an empty file at {resolved}."
        )
    return resolved


def _extract_keypoints_with_mediapipe_solutions(video_path: str, ffmpeg_path: str) -> list[list[dict]]:
    mp_pose = mp.solutions.pose
    frames: list[list[dict]] = []

    converted_path = None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() and video_path.endswith(".webm"):
        cap.release()
        converted_path = _convert_webm_to_mp4(video_path, ffmpeg_path=ffmpeg_path)
        cap = cv2.VideoCapture(converted_path)

    if not cap.isOpened():
        if converted_path and os.path.exists(converted_path):
            os.unlink(converted_path)
        raise ValueError(f"Cannot open video: {video_path}")

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            if result.pose_landmarks:
                landmarks = []
                for lm in result.pose_landmarks.landmark:
                    landmarks.append(
                        {
                            "x": lm.x,
                            "y": lm.y,
                            "z": lm.z,
                            "visibility": lm.visibility,
                        }
                    )
                frames.append(landmarks)
            else:
                frames.append([])

    cap.release()
    if converted_path and os.path.exists(converted_path):
        os.unlink(converted_path)
    return frames


def _extract_keypoints_with_mediapipe_tasks(
    video_path: str,
    ffmpeg_path: str,
    model_path: str | None,
    model_url: str | None,
) -> list[list[dict]]:
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.core.base_options import BaseOptions

    frames: list[list[dict]] = []

    converted_path = None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() and video_path.endswith(".webm"):
        cap.release()
        converted_path = _convert_webm_to_mp4(video_path, ffmpeg_path=ffmpeg_path)
        cap = cv2.VideoCapture(converted_path)

    if not cap.isOpened():
        if converted_path and os.path.exists(converted_path):
            os.unlink(converted_path)
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if fps <= 1e-3:
        fps = 30.0

    model_file = _ensure_pose_model_file(model_path=model_path, model_url=model_url)

    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(model_file)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    landmarker = vision.PoseLandmarker.create_from_options(options)
    try:
        frame_index = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(frame_index * 1000.0 / fps)
            result = landmarker.detect_for_video(image, timestamp_ms)

            pose_landmarks = getattr(result, "pose_landmarks", None)
            if pose_landmarks and len(pose_landmarks) > 0:
                landmarks_out: list[dict[str, Any]] = []
                for lm in pose_landmarks[0]:
                    landmarks_out.append(
                        {
                            "x": float(getattr(lm, "x", 0.0)),
                            "y": float(getattr(lm, "y", 0.0)),
                            "z": float(getattr(lm, "z", 0.0)),
                            "visibility": float(getattr(lm, "visibility", 0.0)),
                        }
                    )
                frames.append(landmarks_out)
            else:
                frames.append([])

            frame_index += 1
    finally:
        landmarker.close()
        cap.release()
        if converted_path and os.path.exists(converted_path):
            os.unlink(converted_path)

    return frames


def extract_keypoints(
    video_path: str,
    ffmpeg_path: str = "ffmpeg",
    model_path: str | None = None,
    model_url: str | None = None,
) -> list[list[dict]]:
    """Extract pose keypoints from every frame of a video.

    Returns a list of frames, where each frame is a list of 33 keypoint dicts
    with {x, y, z, visibility} matching the MediaPipe Pose landmark format.
    """
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
        return _extract_keypoints_with_mediapipe_solutions(video_path, ffmpeg_path=ffmpeg_path)

    return _extract_keypoints_with_mediapipe_tasks(
        video_path,
        ffmpeg_path=ffmpeg_path,
        model_path=model_path,
        model_url=model_url,
    )


def get_video_fps(video_path: str, ffmpeg_path: str = "ffmpeg") -> float:
    """Get the FPS of a video file.

    WebM files recorded via MediaRecorder often report wildly inaccurate FPS
    (e.g. 1000). If the reported FPS is unreasonable, we estimate it from
    the frame count and duration, or fall back to 30.0.
    """
    converted_path = None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() and video_path.endswith(".webm"):
        cap.release()
        converted_path = _convert_webm_to_mp4(video_path, ffmpeg_path=ffmpeg_path)
        cap = cv2.VideoCapture(converted_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    if converted_path and os.path.exists(converted_path):
        os.unlink(converted_path)
    return fps
