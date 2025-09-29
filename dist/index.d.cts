type Platform = "web" | "ios" | "android";
interface Keypoint {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
    name?: string;
}
interface PoseResult {
    keypoints: Keypoint[];
    keypoints3D?: Keypoint[];
    timestamp?: number;
}
interface FrameInfo {
    width: number;
    height: number;
    timestamp?: number;
}

interface LetterboxParams {
    inputSize: number;
    scale: number;
    dx: number;
    dy: number;
    resized: {
        width: number;
        height: number;
    };
}
/**
 * Compute centered letterbox to fit src into a square inputSize.
 * Returns scale and padding for accurate coordinate unprojection.
 */
declare function computeLetterbox(srcW: number, srcH: number, inputSize: number): LetterboxParams;
/**
 * Map point from model input space back to original source pixel space.
 * If model outputs normalized coords [0..1], set normalized=true.
 */
declare function mapFromLetterbox(x: number, y: number, srcW: number, srcH: number, p: LetterboxParams, normalized?: boolean): {
    x: number;
    y: number;
};
/**
 * Per-channel mean/std normalization into Float32Array.
 * Assumes packed RGB byte data (no alpha).
 */
declare function normalizeUint8ToFloat32(src: Uint8Array, mean?: [number, number, number], std?: [number, number, number]): Float32Array;

/**
 * Percentage of Correct Keypoints relative to bbox diagonal threshold.
 */
declare function pck(pred: Keypoint[], gt: Keypoint[], bboxDiagPixels: number, alpha?: number): number;

export { type FrameInfo, type Keypoint, type LetterboxParams, type Platform, type PoseResult, computeLetterbox, mapFromLetterbox, normalizeUint8ToFloat32, pck };
