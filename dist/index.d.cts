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
type RuleType = "range" | "symmetry" | "stability";
type ViewType = "front" | "side";
type ComparatorType = "min" | "max" | "mean" | "std";
type PhaseType = "IDLE" | "DESCENDING" | "ASCENDING";
type EvaluationType = "PHASE" | "REP" | "FRAME";
interface ViewThresholds {
    front?: number;
    side?: number;
}
interface RuleConfig {
    id: string;
    error_type: string;
    type: RuleType;
    comparator: ComparatorType;
    targetPhase: PhaseType;
    evaluation: EvaluationType;
    feature?: string;
    thresholds?: ViewThresholds;
    maxDiff?: ViewThresholds;
    maxStd?: ViewThresholds;
    feature_left?: string;
    feature_right?: string;
}
interface ExerciseConfig {
    exercise_id: number;
    exercise_name: string;
    rules: RuleConfig[];
}
interface RepAggregates {
    [key: string]: number;
}
interface PhaseAggregates {
    IDLE: {
        [key: string]: number;
    };
    DESCENDING: {
        [key: string]: number;
    };
    ASCENDING: {
        [key: string]: number;
    };
}
interface Feedback {
    ruleId: string;
    errorType: string;
    passed: boolean;
    value: number;
    threshold: number;
    direction?: "low" | "high";
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
 * Checks if a keypoint is valid (not null/undefined and has x, y coordinates).
 */
declare function isValidKeypoint(keypoint: Keypoint | undefined | null): keypoint is Keypoint;
/**
 * Calculates the 2D angle (in degrees) at point B formed by points A-B-C.
 * Returns the interior angle at the middle point (B).
 * Returns NaN if any keypoint is invalid.
 */
declare function calculateAngle(a: Keypoint | undefined, b: Keypoint | undefined, c: Keypoint | undefined): number;
/**
 * Calculates the 3D angle (in degrees) at point B formed by points A-B-C.
 * Falls back to 2D if z coordinates are not available.
 * Returns NaN if any keypoint is invalid.
 */
declare function calculateAngle3D(a: Keypoint | undefined, b: Keypoint | undefined, c: Keypoint | undefined): number;
/**
 * Calculates the angle between a line (A-B) and the vertical axis.
 * 0° = vertical (pointing up), 90° = horizontal.
 * Returns NaN if any keypoint is invalid.
 */
declare function angleToVertical(a: Keypoint | undefined, b: Keypoint | undefined): number;
/**
 * Calculates the angle between a line (A-B) and the horizontal axis.
 * 0° = horizontal, 90° = vertical.
 * Returns NaN if any keypoint is invalid.
 */
declare function angleToHorizontal(a: Keypoint | undefined, b: Keypoint | undefined): number;
/**
 * Calculates the Euclidean distance between two keypoints (2D).
 */
declare function distance2D(a: Keypoint, b: Keypoint): number;
/**
 * Calculates the Euclidean distance between two keypoints (3D).
 */
declare function distance3D(a: Keypoint, b: Keypoint): number;
/**
 * Returns the midpoint between two keypoints.
 */
declare function midpoint(a: Keypoint, b: Keypoint): Keypoint;
/**
 * Checks if a keypoint has sufficient visibility confidence.
 */
declare function isVisible(keypoint: Keypoint, threshold?: number): boolean;
/**
 * Checks if all keypoints have sufficient visibility.
 */
declare function allVisible(keypoints: Keypoint[], threshold?: number): boolean;

declare class RepDetector {
    private state;
    private hipYHistory;
    private readonly MOVEMENT_THRESHOLD;
    private readonly HISTORY_SIZE;
    /**
     * Detects the current phase based on hip vertical position.
     * @param hipY - The Y coordinate of the hip (midpoint of left and right hip)
     */
    detect(hipY: number): {
        state: PhaseType;
        isRepFinished: boolean;
        velocity: number;
    };
    /**
     * Gets average of most recent N frames.
     */
    private getRecentAverage;
    /**
     * Gets average of frames before the most recent N frames.
     */
    private getOlderAverage;
    /**
     * Gets the current state.
     */
    getState(): PhaseType;
    /**
     * Resets the detector for a new set.
     */
    reset(): void;
}

declare class FeatureAggregator {
    private currentPhase;
    private repData;
    private phaseData;
    /**
     * Sets the current phase for aggregation.
     */
    setPhase(phase: PhaseType): void;
    /**
     * Records a feature value for the current frame.
     * Automatically aggregates at both rep and phase level.
     */
    recordFeature(featureName: string, value: number): void;
    /**
     * Convenience method to record common squat features.
     */
    processFrame(kneeFlexionLeft: number, kneeFlexionRight: number, trunkAngle: number, stanceWidth: number): void;
    /**
     * Calculates min value from an array.
     */
    private calcMin;
    /**
     * Calculates max value from an array.
     */
    private calcMax;
    /**
     * Calculates mean value from an array.
     */
    private calcMean;
    /**
     * Calculates standard deviation from an array.
     */
    private calcStd;
    /**
     * Gets rep-level aggregates with all comparator types.
     */
    getRepAggregates(): RepAggregates;
    /**
     * Gets phase-level aggregates with all comparator types.
     */
    getPhaseAggregates(): PhaseAggregates;
    /**
     * Resets all aggregated data for a new rep.
     */
    reset(): void;
}

interface FrameData {
    knee_flexion: number;
    knee_flexion_left: number;
    knee_flexion_right: number;
    trunk_angle: number;
    stance_width: number;
    [key: string]: number;
}
declare class RuleEngine {
    private config;
    private currentView;
    private frameBuffer;
    private frameFeedbacks;
    private errorCounts;
    private passCounts;
    private activeErrors;
    private readonly ERROR_TRIGGER_FRAMES;
    private readonly ERROR_CLEAR_FRAMES;
    private readonly MEAN_TOLERANCE;
    constructor(config: ExerciseConfig);
    /**
     * Sets the current camera view for threshold selection.
     */
    setView(view: ViewType): void;
    /**
     * Gets the current camera view.
     */
    getView(): ViewType;
    /**
     * Gets the threshold for a rule based on the current view.
     */
    private getThreshold;
    /**
     * Calculates standard deviation of an array of numbers.
     */
    private calcStd;
    /**
     * Evaluates if a value passes the rule based on comparator and threshold.
     */
    private evaluateComparator;
    /**
     * Updates debounce counters and returns debounced pass/fail state.
     */
    private updateDebounce;
    /**
     * Gets all currently active (debounced) errors.
     */
    getActiveErrors(): Feedback[];
    /**
     * Evaluate frame-level rules for instant feedback.
     * Call this every frame during exercise.
     */
    evaluateFrame(frameData: FrameData, currentPhase: string): Feedback[];
    /**
     * Gets the measured value for a rule from the appropriate data source.
     */
    private getMeasuredValue;
    /**
     * Evaluate rules using rep-level aggregates only.
     */
    evaluate(data: RepAggregates): Feedback[];
    /**
     * Evaluate rules using both rep-level and phase-level aggregates.
     * Call this at the end of a rep.
     */
    evaluateWithPhases(repData: RepAggregates, phaseData?: PhaseAggregates): Feedback[];
    /**
     * Resets frame-level buffers. Call this at the start of each rep.
     */
    reset(): void;
    /**
     * Full reset including debounce state. Call when starting a new exercise session.
     */
    fullReset(): void;
}

export { type ComparatorType, type EvaluationType, type ExerciseConfig, FeatureAggregator, type Feedback, type FrameData, type Keypoint, type LetterboxParams, type PhaseAggregates, type PhaseType, type PoseResult, type RepAggregates, RepDetector, type RuleConfig, RuleEngine, type RuleType, type ViewThresholds, type ViewType, allVisible, angleToHorizontal, angleToVertical, calculateAngle, calculateAngle3D, computeLetterbox, distance2D, distance3D, isValidKeypoint, isVisible, mapFromLetterbox, midpoint };
