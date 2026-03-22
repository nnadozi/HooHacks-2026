import unittest
import sys
from pathlib import Path


# Allow running from repo root: `python -m unittest backend.tests.test_gemini`
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class TestGeminiDeltas(unittest.TestCase):
    def test_build_joint_deltas_keeps_some_joints_even_below_threshold(self):
        # Import inside the test so the module path is resolved in typical test runners.
        from app.services.gemini import build_joint_deltas

        # 33 visible joints with a small but real per-joint pose change.
        ref = []
        perf = []
        for i in range(33):
            # Give the frame a non-degenerate bounding box.
            x = 0.30 + (i / 100.0)
            y = 0.40 + (i / 120.0)
            ref.append({"x": x, "y": y, "z": 0.0, "visibility": 0.99})
            perf.append({"x": x, "y": y, "z": 0.0, "visibility": 0.99})

        # Left wrist is index 15 in MediaPipe Pose.
        perf[15]["y"] = perf[15]["y"] + 0.02  # below the 0.05 threshold

        deltas = build_joint_deltas(ref, perf)
        self.assertGreater(len(deltas), 0)
        self.assertTrue(any(d["joint"] == "left_wrist" for d in deltas))

    def test_build_joint_deltas_returns_empty_when_not_visible(self):
        from app.services.gemini import build_joint_deltas

        ref = [{"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.1} for _ in range(33)]
        perf = [{"x": 0.6, "y": 0.6, "z": 0.0, "visibility": 0.1} for _ in range(33)]

        self.assertEqual(build_joint_deltas(ref, perf), [])


if __name__ == "__main__":
    unittest.main()
