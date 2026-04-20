interface Keypoint {
    x: number;
    y: number;
    z?: number;
    visibility: number;
    presence?: number;
    name?: string;
}
interface PoseResult {
    keypoints: Keypoint[];
    keypoints3D?: Keypoint[];
    timestamp: number;
}
interface FrameKeypoints {
    hip_left: Keypoint;
    hip_right: Keypoint;
    ankle_left: Keypoint;
    ankle_right: Keypoint;
}
type ErrorType = "INSUFFICIENT_RANGE" | "BAD_ALIGNMENT" | "BAD_SETUP" | "ASYMMETRY" | "INSTABILITY" | "MOMENTUM_CHEAT" | "BAD_TEMPO";
type RuleType = "range" | "alignment" | "symmetry" | "stability" | "tempo" | "duration";
type ViewType = "front" | "side" | "incline";
type ComparatorType = "above" | "below" | "mean" | "std" | "sum" | "min" | "max";
type PhaseType = "CONCENTRIC" | "ECCENTRIC" | "IDLE";
type IntervalType = "FRAME" | "PHASE" | "REP";
interface ViewThresholds {
    front?: number;
    side?: number;
    incline?: number;
}
interface RuleConfig {
    id: string;
    error_type: string;
    type: string;
    comparator?: string;
    targetPhase?: string;
    evaluation: string;
    feature?: string;
    feature_left?: string;
    feature_right?: string;
    thresholds?: ViewThresholds;
    maxDiff?: ViewThresholds;
    max?: ViewThresholds;
    minSeconds?: ViewThresholds;
    maxSeconds?: ViewThresholds;
    maxStd?: ViewThresholds;
    maxVelocity?: ViewThresholds;
    description?: string;
    weight?: number;
}
interface ExerciseConfig {
    exercise_id: string;
    exercise_name: string;
    rules: RuleConfig[];
}
interface RuleEngineOptions {
    view?: ViewType;
    thresholds?: ViewThresholds;
    errorTriggerFrames?: number;
    errorClearFrames?: number;
    meanTolerance?: number;
}
interface RepAggregates {
    [key: string]: number;
}
interface PhaseAggregates {
    CONCENTRIC: {
        [key: string]: number;
    };
    ECCENTRIC: {
        [key: string]: number;
    };
    IDLE: {
        [key: string]: number;
    };
}
interface Feedback {
    ruleId: string;
    errorType: ErrorType;
    passed: boolean;
    value: number;
    threshold: number;
    direction?: "low" | "high";
    weight?: number;
    errors?: string[];
    quality?: number;
}
interface FrameData {
    knee_flexion: number;
    knee_flexion_left: number;
    knee_flexion_right: number;
    trunk_angle: number;
    stance_width: number;
    [key: string]: number;
}
type ExerciseId = "squat" | "bicep_curl" | "shoulder_press" | "bench_press" | "lat_pulldown";

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
 * Returns the midpoint between two keypoints.
 */
declare function midpoint(a: Keypoint, b: Keypoint): Keypoint;

declare class FpsNormalizer {
    private readonly targetIntervalMs;
    private state;
    constructor(targetFps?: number);
    private createEmptyState;
    reset(): void;
    getInputFps(): number;
    getNormalizedFps(): number;
    private updateInputFps;
    private updateNormalizedFps;
    push(keypoints: Keypoint[], sourceTimestampMs: number): PoseResult[];
}

declare const EXERCISE_IDS: ExerciseId[];
declare class RepDetector {
    private readonly exerciseId;
    private state;
    private valueHistory;
    private readonly historySize;
    private readonly minRepFrames;
    private pendingStart;
    private startValue;
    constructor(exerciseId: ExerciseId);
    /**
     * Extracts the primary value for rep detection based on exercise type.
     * Returns the angle value used to detect reps.
     */
    private getPrimaryValue;
    /**
     * Get threshold for this exercise
     */
    private getThreshold;
    /**
     * Get completion tolerance to consider "back to start"
     */
    private getCompletionTolerance;
    /**
     * Gets average of most recent N frames.
     */
    private getRecentAverage;
    /**
     * Gets average of frames before the most recent N frames.
     */
    private getOlderAverage;
    /**
     * Detects the current phase based on primary value.
     * @param features - Frame features with flexion angles
     * @param frameIdx - Current frame index
     */
    detect(features: {
        knee_flexion_left?: number;
        knee_flexion_right?: number;
        elbow_flexion_left?: number;
        elbow_flexion_right?: number;
    }, frameIdx: number): {
        state: PhaseType;
        isRepFinished: boolean;
        velocity: number;
    };
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
    /**
     * Extracts features from keypoints for a given exercise and records them.
     */
    extractFeatures(keypoints: Map<string, Keypoint>, exerciseId: ExerciseId): FrameData;
}

declare class RuleEngine {
    private config;
    private currentView;
    private readonly thresholds?;
    private readonly ERROR_TRIGGER_FRAMES;
    private readonly ERROR_CLEAR_FRAMES;
    private readonly MEAN_TOLERANCE;
    private frameBuffer;
    private frameFeedbacks;
    private errorCounts;
    private passCounts;
    private activeErrors;
    constructor(config: ExerciseConfig, options?: RuleEngineOptions);
    /**
     * Sets the current camera view for threshold selection.
     */
    setView(view: ViewType): void;
    /**
     * Gets the current camera view.
     */
    getView(): ViewType;
    private getRuleId;
    private getComparator;
    private getInterval;
    private getPhases;
    /**
     * Gets the threshold for a rule based on the current view.
     */
    private getThreshold;
    private getTemplate;
    private getEvaluation;
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
     * Evaluate frame-level rules for instant feedback.
     * Call this every frame during exercise.
     */
    evaluateFrame(frameData: FrameData, currentPhase: PhaseType): Feedback[];
    /**
     * Gets the measured value for a rule from the appropriate data source.
     */
    private getMeasuredValue;
    /**
     * Evaluate rules using both rep-level and phase-level aggregates.
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

export { type ComparatorType, EXERCISE_IDS, type ErrorType, type ExerciseConfig, type ExerciseId, FeatureAggregator, type Feedback, FpsNormalizer, type FrameData, type FrameKeypoints, type IntervalType, type Keypoint, type LetterboxParams, type PhaseAggregates, type PhaseType, type PoseResult, type RepAggregates, RepDetector, type RuleConfig, RuleEngine, type RuleEngineOptions, type RuleType, type ViewThresholds, type ViewType, calculateAngle, calculateAngle3D, computeLetterbox, isValidKeypoint, mapFromLetterbox, midpoint };
