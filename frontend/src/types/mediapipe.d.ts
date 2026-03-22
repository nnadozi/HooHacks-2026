declare module "@mediapipe/tasks-vision" {
  export interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility: number;
  }

  export interface PoseLandmarkerResult {
    landmarks: Landmark[][];
    worldLandmarks: Landmark[][];
  }

  export interface PoseLandmarkerOptions {
    baseOptions: {
      modelAssetPath: string;
      delegate?: "GPU" | "CPU";
    };
    runningMode: "IMAGE" | "VIDEO";
    numPoses?: number;
  }

  export class PoseLandmarker {
    static createFromOptions(
      vision: WasmFileset,
      options: PoseLandmarkerOptions
    ): Promise<PoseLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult;
    close(): void;
  }

  export type WasmFileset = Record<string, unknown>;

  export class FilesetResolver {
    static forVisionTasks(wasmPath: string): Promise<WasmFileset>;
  }
}
