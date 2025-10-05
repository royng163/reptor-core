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

export { type Keypoint, type LetterboxParams, type PoseResult, computeLetterbox, mapFromLetterbox };
