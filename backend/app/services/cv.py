import logging
import os
import subprocess
import tempfile

import cv2
import mediapipe as mp

logger = logging.getLogger("justdance.cv")


def _convert_webm_to_mp4(video_path: str) -> str:
    """Convert a WebM file to MP4 using ffmpeg for OpenCV compatibility.

    Browser-recorded WebM files often have EBML headers that OpenCV cannot parse.
    Returns the path to the converted MP4 file (caller must delete it).
    """
    mp4_path = video_path.rsplit(".", 1)[0] + ".mp4"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", video_path,
                "-c:v", "libx264", "-preset", "ultrafast",
                "-crf", "23", "-an", mp4_path,
            ],
            capture_output=True,
            timeout=120,
            check=True,
        )
        logger.info("Converted WebM to MP4: %s", mp4_path)
        return mp4_path
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        logger.error("ffmpeg conversion failed: %s", e)
        raise ValueError(f"Cannot convert video {video_path} — is ffmpeg installed?") from e


def extract_keypoints(video_path: str) -> list[list[dict]]:
    """Extract pose keypoints from every frame of a video.

    Returns a list of frames, where each frame is a list of 33 keypoint dicts
    with {x, y, z, visibility} matching the MediaPipe Pose landmark format.
    """
    mp_pose = mp.solutions.pose
    frames: list[list[dict]] = []

    # Convert WebM to MP4 if OpenCV can't open it directly
    converted_path = None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() and video_path.endswith(".webm"):
        cap.release()
        converted_path = _convert_webm_to_mp4(video_path)
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
                # No pose detected — append empty frame
                frames.append([])

    cap.release()
    if converted_path and os.path.exists(converted_path):
        os.unlink(converted_path)
    return frames


def get_video_fps(video_path: str) -> float:
    """Get the FPS of a video file.

    WebM files recorded via MediaRecorder often report wildly inaccurate FPS
    (e.g. 1000). If the reported FPS is unreasonable, we estimate it from
    the frame count and duration, or fall back to 30.0.
    """
    converted_path = None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened() and video_path.endswith(".webm"):
        cap.release()
        converted_path = _convert_webm_to_mp4(video_path)
        cap = cv2.VideoCapture(converted_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    duration_ms = cap.get(cv2.CAP_PROP_POS_MSEC)

    # If FPS looks unreasonable (< 1 or > 120), try to estimate from metadata
    if fps > 120 or fps < 1:
        # Try duration-based estimation
        if frame_count > 0:
            # Seek to end to get duration
            cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 1)
            end_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if end_ms > 0:
                fps = frame_count / (end_ms / 1000.0)
                if fps > 120 or fps < 1:
                    fps = 30.0
            else:
                fps = 30.0
        else:
            fps = 30.0

    cap.release()
    if converted_path and os.path.exists(converted_path):
        os.unlink(converted_path)
    return fps
