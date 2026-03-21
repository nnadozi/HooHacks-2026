import os
import tempfile

import librosa
import numpy as np


def _guess_suffix(filename: str, content_type: str) -> str:
    """Pick a file suffix so librosa/ffmpeg can decode the format."""
    if filename:
        _, ext = os.path.splitext(filename)
        if ext:
            return ext
    mime_map = {
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/webm": ".webm",
    }
    return mime_map.get(content_type, ".mp3")


def detect_bpm(audio_data: bytes, filename: str = "", content_type: str = "") -> int:
    """Detect BPM from raw audio or video bytes.

    Writes bytes to a temp file, loads with librosa (which uses ffmpeg
    to extract audio from video files), and estimates tempo.
    Returns BPM as an integer.
    """
    suffix = _guess_suffix(filename, content_type)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(audio_data)
        tmp.flush()

        y, sr = librosa.load(tmp.name, sr=None)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0])

        return int(round(tempo))
