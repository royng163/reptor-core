import {
  ExerciseConfig,
  RepAggregates,
  PhaseAggregates,
  Feedback,
  ViewType,
  RuleConfig,
  FrameData,
  ViewThresholds,
  ComparatorType,
  PhaseType,
  RuleEngineOptions,
} from "../types";

export class RuleEngine {
  private currentView: ViewType;
  private readonly thresholds?: ViewThresholds;

  private readonly ERROR_TRIGGER_FRAMES: number;
  private readonly ERROR_CLEAR_FRAMES: number;
  private readonly MEAN_TOLERANCE: number;

  // Buffer for frame-level stability calculations
  private frameBuffer: { [ruleId: string]: number[] } = {};
  private frameFeedbacks: Feedback[] = [];

  // Debouncing for frame-level errors
  private errorCounts: { [ruleId: string]: number } = {};
  private passCounts: { [ruleId: string]: number } = {};
  private activeErrors: { [ruleId: string]: boolean } = {};

  constructor(
    private config: ExerciseConfig,
    options: RuleEngineOptions = {},
  ) {
    this.currentView = options.view ?? "front";
    this.thresholds = options.thresholds;
    this.ERROR_TRIGGER_FRAMES = options.errorTriggerFrames ?? 5;
    this.ERROR_CLEAR_FRAMES = options.errorClearFrames ?? 10;
    this.MEAN_TOLERANCE = options.meanTolerance ?? 0.2;
  }

  /**
   * Sets the current camera view for threshold selection.
   */
  setView(view: ViewType): void {
    this.currentView = view;
  }

  /**
   * Gets the current camera view.
   */
  getView(): ViewType {
    return this.currentView;
  }

  private getRuleId(rule: RuleConfig, index: number): string {
    return rule.id ?? `${rule.error_type}_${rule.template}_${rule.interval}_${index}`;
  }

  private getComparator(rule: RuleConfig): ComparatorType {
    if (rule.comparator) return rule.comparator;

    switch (rule.template) {
      case "stability":
        return "STD";
      case "symmetry":
        return "BELOW";
      case "range":
      case "alignment":
      case "tempo":
      case "duration":
      default:
        return "BELOW";
    }
  }

  private getInterval(rule: RuleConfig): "FRAME" | "PHASE" | "REP" {
    return rule.interval ?? "REP";
  }

  private getPhases(rule: RuleConfig): string[] {
    if (rule.phases?.length) return rule.phases;
    return [];
  }

  /**
   * Gets the threshold for a rule based on the current view.
   */
  private getThreshold(rule: RuleConfig): number | undefined {
    return rule.thresholds?.[this.currentView];
  }

  /**
   * Calculates standard deviation of an array of numbers.
   */
  private calcStd(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Evaluates if a value passes the rule based on comparator and threshold.
   */
  private evaluateComparator(
    comparator: ComparatorType,
    value: number,
    threshold: number,
  ): { passed: boolean; direction?: "low" | "high" } {
    switch (comparator) {
      case "ABOVE":
        // For "ABOVE" comparator, value should be >= threshold (e.g., depth check)
        return { passed: value >= threshold };
      case "BELOW":
        // For "BELOW" comparator, value should be <= threshold (e.g., lockout, forward lean)
        return { passed: value <= threshold };
      case "MEAN":
        // For "MEAN" comparator, allow some tolerance around the threshold
        const lowerBound = threshold * (1 - this.MEAN_TOLERANCE);
        const upperBound = threshold * (1 + this.MEAN_TOLERANCE);
        if (value < lowerBound) return { passed: false, direction: "low" };
        if (value > upperBound) return { passed: false, direction: "high" };
        return { passed: true };
      case "STD":
        // For "STD" comparator, standard deviation should be <= threshold
        return { passed: value <= threshold };
      default:
        return { passed: true };
    }
  }

  /**
   * Updates debounce counters and returns debounced pass/fail state.
   */
  private updateDebounce(ruleId: string, instantPassed: boolean): boolean {
    // Initialize counters if needed
    if (this.errorCounts[ruleId] === undefined) {
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId] = 0;
      this.activeErrors[ruleId] = false;
    }

    if (instantPassed) {
      // Reset error count, increment pass count
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId]++;

      // Clear active error after enough consecutive passes
      if (this.activeErrors[ruleId] && this.passCounts[ruleId] >= this.ERROR_CLEAR_FRAMES) {
        this.activeErrors[ruleId] = false;
      }
    } else {
      // Reset pass count, increment error count
      this.passCounts[ruleId] = 0;
      this.errorCounts[ruleId]++;

      // Trigger error after enough consecutive failures
      if (this.errorCounts[ruleId] >= this.ERROR_TRIGGER_FRAMES) {
        this.activeErrors[ruleId] = true;
      }
    }

    // Return debounced state: error is active only after debounce threshold
    return !this.activeErrors[ruleId];
  }

  /**
   * Evaluate frame-level rules for instant feedback.
   * Call this every frame during exercise.
   */
  evaluateFrame(frameData: FrameData, currentPhase: PhaseType): Feedback[] {
    const feedbacks: Feedback[] = [];

    this.config.rules.forEach((rule, index) => {
      // Only process frame-level rules
      if (rule.interval !== "FRAME") return;

      // Skip if not in target phase
      const phases = this.getPhases(rule);
      if (phases.length > 0 && !phases.includes(currentPhase)) {
        // Also update debounce to clear errors when not in target phase
        this.updateDebounce(rule.id, true);
        return;
      }

      const threshold = this.getThreshold(rule);
      if (threshold === undefined) return;

      const ruleId = this.getRuleId(rule, index);
      const comparator = this.getComparator(rule);

      let measuredValue: number;
      let evalResult: { passed: boolean; direction?: "low" | "high" };

      if (rule.template === "symmetry") {
        // Symmetry check: compare left vs right
        const left = frameData[rule.feature_left!] ?? NaN;
        const right = frameData[rule.feature_right!] ?? NaN;
        if (Number.isNaN(left) || Number.isNaN(right)) return;
        measuredValue = Math.abs(left - right);
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      } else if (rule.template === "stability") {
        // Stability check: accumulate values and check std dev
        const feature = rule.feature;
        if (!feature) return;
        const value = frameData[feature] ?? NaN;
        if (Number.isNaN(value)) return;

        if (!this.frameBuffer[ruleId]) this.frameBuffer[ruleId] = [];
        this.frameBuffer[ruleId].push(value);

        // Only evaluate if we have enough samples
        if (this.frameBuffer[ruleId].length < 10) return;

        measuredValue = this.calcStd(this.frameBuffer[ruleId]);
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      } else {
        const feature = rule.feature;
        if (!feature) return;
        measuredValue = frameData[feature] ?? NaN;
        if (Number.isNaN(measuredValue)) return;
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      }

      // Apply debouncing
      const debouncedPassed = this.updateDebounce(rule.id, evalResult.passed);

      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: debouncedPassed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
        weight: rule.weight,
      });
    });

    // Store for final rep evaluation
    this.frameFeedbacks = feedbacks;
    return feedbacks;
  }

  /**
   * Gets the measured value for a rule from the appropriate data source.
   */
  private getMeasuredValue(
    rule: RuleConfig,
    index: number,
    repData: RepAggregates,
    phaseData?: PhaseAggregates,
  ): number {
    const comparator = this.getComparator(rule);
    const interval = this.getInterval(rule);

    const dataSource =
      interval === "PHASE" && phaseData ? phaseData[this.getPhases(rule)[0] as keyof PhaseAggregates] : repData;

    if (!dataSource) return NaN;

    // rep-level evaluation
    if (rule.template === "symmetry") {
      const left = dataSource[rule.feature_left ?? ""] ?? NaN;
      const right = dataSource[rule.feature_right ?? ""] ?? NaN;
      return left - right;
    }

    const feature = rule.feature;
    if (!feature) return NaN;

    if (comparator === "ABOVE") return dataSource[`${feature}_above`] ?? dataSource[feature] ?? NaN;
    if (comparator === "BELOW") return dataSource[`${feature}_below`] ?? dataSource[feature] ?? NaN;
    if (comparator === "MEAN") return dataSource[`${feature}_mean`] ?? dataSource[feature] ?? NaN;
    if (comparator === "STD") return dataSource[`${feature}_std`] ?? NaN;

    return dataSource[feature] ?? NaN;
  }

  /**
   * Evaluate rules using both rep-level and phase-level aggregates.
   */
  evaluateWithPhases(repData: RepAggregates, phaseData?: PhaseAggregates): Feedback[] {
    const feedbacks: Feedback[] = [];

    this.config.rules.forEach((rule, index) => {
      const interval = this.getInterval(rule);
      const ruleId = this.getRuleId(rule, index);

      const threshold = this.getThreshold(rule);

      // Skip rule if no threshold for current view
      if (threshold === undefined) return;
      // Handle frame-level rules from accumulated data
      if (interval === "FRAME") {
        const frameFeedback = this.frameFeedbacks.find((f) => f.ruleId === ruleId);
        if (frameFeedback) feedbacks.push(frameFeedback);
        return;
      }

      // Skip phase-evaluation rules if no phase data provided
      if (interval === "PHASE" && !phaseData) return;

      const measuredValue = this.getMeasuredValue(rule, index, repData, phaseData);

      // Skip if value couldn't be calculated
      if (Number.isNaN(measuredValue)) return;

      // For symmetry rules, compare absolute difference
      const valueToCompare = rule.template === "symmetry" ? Math.abs(measuredValue) : measuredValue;
      const evalResult = this.evaluateComparator(this.getComparator(rule), valueToCompare, threshold);

      feedbacks.push({
        ruleId,
        errorType: rule.error_type,
        passed: evalResult.passed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
        weight: rule.weight,
      });
    });

    return feedbacks;
  }

  /**
   * Resets frame-level buffers. Call this at the start of each rep.
   */
  reset(): void {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    // Keep debounce state across reps for continuous feedback
  }

  /**
   * Full reset including debounce state. Call when starting a new exercise session.
   */
  fullReset(): void {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    this.errorCounts = {};
    this.passCounts = {};
    this.activeErrors = {};
  }
}
