import tempfile

import cv2
import mediapipe as mp


def extract_keypoints(video_path: str) -> list[list[dict]]:
    """Extract pose keypoints from every frame of a video.

    Returns a list of frames, where each frame is a list of 33 keypoint dicts
    with {x, y, z, visibility} matching the MediaPipe Pose landmark format.
    """
    mp_pose = mp.solutions.pose
    frames: list[list[dict]] = []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
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
    return frames


def get_video_fps(video_path: str) -> float:
    """Get the FPS of a video file."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    return fps
