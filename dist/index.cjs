'use strict';

// src/utils/preprocess.ts
function computeLetterbox(srcW, srcH, inputSize) {
  const s = Math.min(inputSize / srcW, inputSize / srcH);
  const newW = Math.round(srcW * s);
  const newH = Math.round(srcH * s);
  const dx = Math.floor((inputSize - newW) / 2);
  const dy = Math.floor((inputSize - newH) / 2);
  return { inputSize, scale: s, dx, dy, resized: { width: newW, height: newH } };
}
function mapFromLetterbox(x, y, srcW, srcH, p, normalized = false) {
  const px = normalized ? x * p.inputSize : x;
  const py = normalized ? y * p.inputSize : y;
  const ox = Math.max(0, Math.min(srcW, (px - p.dx) / p.scale));
  const oy = Math.max(0, Math.min(srcH, (py - p.dy) / p.scale));
  return { x: ox, y: oy };
}

// src/utils/geometry.ts
function isValidKeypoint(keypoint) {
  return keypoint !== void 0 && keypoint !== null && typeof keypoint.x === "number" && typeof keypoint.y === "number";
}
function calculateAngle(a, b, c) {
  if (!isValidKeypoint(a) || !isValidKeypoint(b) || !isValidKeypoint(c)) {
    return NaN;
  }
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dotProduct = ba.x * bc.x + ba.y * bc.y;
  const magnitudeBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magnitudeBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magnitudeBA === 0 || magnitudeBC === 0) {
    return 0;
  }
  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magnitudeBA * magnitudeBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}
function calculateAngle3D(a, b, c) {
  if (!isValidKeypoint(a) || !isValidKeypoint(b) || !isValidKeypoint(c)) {
    return NaN;
  }
  if (a.z === void 0 || b.z === void 0 || c.z === void 0) {
    return calculateAngle(a, b, c);
  }
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magnitudeBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magnitudeBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
  if (magnitudeBA === 0 || magnitudeBC === 0) {
    return 0;
  }
  const cosAngle = Math.max(-1, Math.min(1, dotProduct / (magnitudeBA * magnitudeBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}
function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z !== void 0 && b.z !== void 0 ? (a.z + b.z) / 2 : void 0,
    visibility: (a.visibility + b.visibility) / 2
  };
}

// src/analysis/repDetector.ts
var RepDetector = class {
  constructor() {
    this.state = "IDLE";
    this.hipYHistory = [];
    // Thresholds for vertical movement detection (in pixels)
    this.MOVEMENT_THRESHOLD = 7;
    // Minimum movement to detect phase change
    this.HISTORY_SIZE = 10;
  }
  // Frames to average for smoothing
  /**
   * Detects the current phase based on hip vertical position.
   * @param hipY - The Y coordinate of the hip (midpoint of left and right hip)
   */
  detect(hipY) {
    let isRepFinished = false;
    this.hipYHistory.push(hipY);
    if (this.hipYHistory.length > this.HISTORY_SIZE) {
      this.hipYHistory.shift();
    }
    if (isNaN(hipY) || hipY === void 0) {
      return {
        state: this.state,
        isRepFinished,
        velocity: 0
      };
    }
    if (this.hipYHistory.length < 3) {
      return { state: this.state, isRepFinished, velocity: 0 };
    }
    const recentAvg = this.getRecentAverage(3);
    const olderAvg = this.getOlderAverage(3);
    const velocity = recentAvg - olderAvg;
    switch (this.state) {
      case "IDLE":
        if (velocity > this.MOVEMENT_THRESHOLD) {
          this.state = "CONCENTRIC";
        }
        break;
      case "CONCENTRIC":
        if (velocity < -this.MOVEMENT_THRESHOLD) {
          this.state = "ECCENTRIC";
        }
        break;
      case "ECCENTRIC":
        if (velocity > this.MOVEMENT_THRESHOLD) {
          this.state = "CONCENTRIC";
        } else if (Math.abs(velocity) < this.MOVEMENT_THRESHOLD / 2) {
          const startY = this.hipYHistory[0];
          const currentY = hipY;
          if (Math.abs(currentY - startY) < this.MOVEMENT_THRESHOLD * 2) {
            this.state = "IDLE";
            isRepFinished = true;
          }
        }
        break;
    }
    return { state: this.state, isRepFinished, velocity };
  }
  /**
   * Gets average of most recent N frames.
   */
  getRecentAverage(n) {
    const recent = this.hipYHistory.slice(-n);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }
  /**
   * Gets average of frames before the most recent N frames.
   */
  getOlderAverage(n) {
    const older = this.hipYHistory.slice(0, -n);
    if (older.length === 0) return this.hipYHistory[0];
    return older.reduce((a, b) => a + b, 0) / older.length;
  }
  /**
   * Gets the current state.
   */
  getState() {
    return this.state;
  }
  /**
   * Resets the detector for a new set.
   */
  reset() {
    this.state = "IDLE";
    this.hipYHistory = [];
  }
};

// src/analysis/featureAggregator.ts
var FeatureAggregator = class {
  constructor() {
    this.currentPhase = "IDLE";
    // Rep-level aggregates
    this.repData = {};
    // Phase-level aggregates
    this.phaseData = {
      IDLE: {},
      CONCENTRIC: {},
      ECCENTRIC: {}
    };
  }
  /**
   * Sets the current phase for aggregation.
   */
  setPhase(phase) {
    this.currentPhase = phase;
  }
  /**
   * Calculates hip width (horizontal distance between hips).
   * Used as a reference measurement for normalization.
   */
  calcHipWidth(hipLeft, hipRight) {
    return Math.abs(hipRight.x - hipLeft.x);
  }
  /**
   * Calculates normalized stance width as ratio to hip width.
   * This is camera-distance independent.
   *
   * Typical values:
   * - Narrow stance: < 1.0 (feet closer than hips)
   * - Normal stance: 1.0 - 1.5 (feet at hip width or slightly wider)
   * - Wide stance: > 1.5 (feet wider than 1.5x hip width)
   */
  calcNormalizedStanceWidth(ankleLeft, ankleRight, hipLeft, hipRight) {
    const stanceWidth = Math.abs(ankleRight.x - ankleLeft.x);
    const hipWidth = this.calcHipWidth(hipLeft, hipRight);
    if (hipWidth === 0) return NaN;
    return stanceWidth / hipWidth;
  }
  /**
   * Records a feature value for the current frame.
   * Automatically aggregates at both rep and phase level.
   */
  recordFeature(featureName, value) {
    if (isNaN(value)) return;
    if (!this.repData[featureName]) {
      this.repData[featureName] = [];
    }
    this.repData[featureName].push(value);
    if (!this.phaseData[this.currentPhase][featureName]) {
      this.phaseData[this.currentPhase][featureName] = [];
    }
    this.phaseData[this.currentPhase][featureName].push(value);
  }
  /**
   * Convenience method to record common squat features.
   */
  processFrame(kneeFlexionLeft, kneeFlexionRight, trunkAngle, keypoints) {
    const kneeFlexion = (kneeFlexionLeft + kneeFlexionRight) / 2;
    this.recordFeature("knee_flexion", kneeFlexion);
    this.recordFeature("knee_flexion_left", kneeFlexionLeft);
    this.recordFeature("knee_flexion_right", kneeFlexionRight);
    this.recordFeature("trunk_angle", trunkAngle);
    if (keypoints) {
      const normalizedStanceWidth = this.calcNormalizedStanceWidth(
        keypoints.ankle_left,
        keypoints.ankle_right,
        keypoints.hip_left,
        keypoints.hip_right
      );
      this.recordFeature("stance_width", normalizedStanceWidth);
    }
  }
  /**
   * Calculates min value from an array.
   */
  calcMin(values) {
    return values.length > 0 ? Math.min(...values) : NaN;
  }
  /**
   * Calculates max value from an array.
   */
  calcMax(values) {
    return values.length > 0 ? Math.max(...values) : NaN;
  }
  /**
   * Calculates mean value from an array.
   */
  calcMean(values) {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  }
  /**
   * Calculates standard deviation from an array.
   */
  calcStd(values) {
    if (values.length === 0) return NaN;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
  /**
   * Gets rep-level aggregates with all comparator types.
   */
  getRepAggregates() {
    const result = {};
    for (const [feature, values] of Object.entries(this.repData)) {
      result[`${feature}_min`] = this.calcMin(values);
      result[`${feature}_max`] = this.calcMax(values);
      result[`${feature}_mean`] = this.calcMean(values);
      result[`${feature}_std`] = this.calcStd(values);
      result[feature] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return result;
  }
  /**
   * Gets phase-level aggregates with all comparator types.
   */
  getPhaseAggregates() {
    const result = {
      IDLE: {},
      CONCENTRIC: {},
      ECCENTRIC: {}
    };
    for (const phase of ["IDLE", "CONCENTRIC", "ECCENTRIC"]) {
      for (const [feature, values] of Object.entries(this.phaseData[phase])) {
        result[phase][`${feature}_min`] = this.calcMin(values);
        result[phase][`${feature}_max`] = this.calcMax(values);
        result[phase][`${feature}_mean`] = this.calcMean(values);
        result[phase][`${feature}_std`] = this.calcStd(values);
        result[phase][feature] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
      }
    }
    return result;
  }
  /**
   * Resets all aggregated data for a new rep.
   */
  reset() {
    this.currentPhase = "IDLE";
    this.repData = {};
    this.phaseData = {
      IDLE: {},
      CONCENTRIC: {},
      ECCENTRIC: {}
    };
  }
};

// src/analysis/ruleEngine.ts
var RuleEngine = class {
  constructor(config, options = {}) {
    this.config = config;
    // Buffer for frame-level stability calculations
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    // Debouncing for frame-level errors
    this.errorCounts = {};
    this.passCounts = {};
    this.activeErrors = {};
    var _a, _b, _c, _d;
    this.currentView = (_a = options.view) != null ? _a : "front";
    this.thresholds = options.thresholds;
    this.ERROR_TRIGGER_FRAMES = (_b = options.errorTriggerFrames) != null ? _b : 5;
    this.ERROR_CLEAR_FRAMES = (_c = options.errorClearFrames) != null ? _c : 10;
    this.MEAN_TOLERANCE = (_d = options.meanTolerance) != null ? _d : 0.2;
  }
  /**
   * Sets the current camera view for threshold selection.
   */
  setView(view) {
    this.currentView = view;
  }
  /**
   * Gets the current camera view.
   */
  getView() {
    return this.currentView;
  }
  getRuleId(rule, index) {
    var _a;
    return (_a = rule.id) != null ? _a : `${rule.error_type}_${rule.template}_${rule.interval}_${index}`;
  }
  getComparator(rule) {
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
  getInterval(rule) {
    var _a;
    return (_a = rule.interval) != null ? _a : "REP";
  }
  getPhases(rule) {
    var _a;
    if ((_a = rule.phases) == null ? void 0 : _a.length) return rule.phases;
    return [];
  }
  /**
   * Gets the threshold for a rule based on the current view.
   */
  getThreshold(rule) {
    var _a;
    return (_a = rule.thresholds) == null ? void 0 : _a[this.currentView];
  }
  /**
   * Calculates standard deviation of an array of numbers.
   */
  calcStd(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }
  /**
   * Evaluates if a value passes the rule based on comparator and threshold.
   */
  evaluateComparator(comparator, value, threshold) {
    switch (comparator) {
      case "ABOVE":
        return { passed: value >= threshold };
      case "BELOW":
        return { passed: value <= threshold };
      case "MEAN":
        const lowerBound = threshold * (1 - this.MEAN_TOLERANCE);
        const upperBound = threshold * (1 + this.MEAN_TOLERANCE);
        if (value < lowerBound) return { passed: false, direction: "low" };
        if (value > upperBound) return { passed: false, direction: "high" };
        return { passed: true };
      case "STD":
        return { passed: value <= threshold };
      default:
        return { passed: true };
    }
  }
  /**
   * Updates debounce counters and returns debounced pass/fail state.
   */
  updateDebounce(ruleId, instantPassed) {
    if (this.errorCounts[ruleId] === void 0) {
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId] = 0;
      this.activeErrors[ruleId] = false;
    }
    if (instantPassed) {
      this.errorCounts[ruleId] = 0;
      this.passCounts[ruleId]++;
      if (this.activeErrors[ruleId] && this.passCounts[ruleId] >= this.ERROR_CLEAR_FRAMES) {
        this.activeErrors[ruleId] = false;
      }
    } else {
      this.passCounts[ruleId] = 0;
      this.errorCounts[ruleId]++;
      if (this.errorCounts[ruleId] >= this.ERROR_TRIGGER_FRAMES) {
        this.activeErrors[ruleId] = true;
      }
    }
    return !this.activeErrors[ruleId];
  }
  /**
   * Evaluate frame-level rules for instant feedback.
   * Call this every frame during exercise.
   */
  evaluateFrame(frameData, currentPhase) {
    const feedbacks = [];
    this.config.rules.forEach((rule, index) => {
      var _a, _b, _c, _d;
      if (rule.interval !== "FRAME") return;
      const phases = this.getPhases(rule);
      if (phases.length > 0 && !phases.includes(currentPhase)) {
        this.updateDebounce(rule.id, true);
        return;
      }
      const threshold = this.getThreshold(rule);
      if (threshold === void 0) return;
      const ruleId = this.getRuleId(rule, index);
      const comparator = this.getComparator(rule);
      let measuredValue;
      let evalResult;
      if (rule.template === "symmetry") {
        const left = (_a = frameData[rule.feature_left]) != null ? _a : NaN;
        const right = (_b = frameData[rule.feature_right]) != null ? _b : NaN;
        if (Number.isNaN(left) || Number.isNaN(right)) return;
        measuredValue = Math.abs(left - right);
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      } else if (rule.template === "stability") {
        const feature = rule.feature;
        if (!feature) return;
        const value = (_c = frameData[feature]) != null ? _c : NaN;
        if (Number.isNaN(value)) return;
        if (!this.frameBuffer[ruleId]) this.frameBuffer[ruleId] = [];
        this.frameBuffer[ruleId].push(value);
        if (this.frameBuffer[ruleId].length < 10) return;
        measuredValue = this.calcStd(this.frameBuffer[ruleId]);
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      } else {
        const feature = rule.feature;
        if (!feature) return;
        measuredValue = (_d = frameData[feature]) != null ? _d : NaN;
        if (Number.isNaN(measuredValue)) return;
        evalResult = this.evaluateComparator(comparator, measuredValue, threshold);
      }
      const debouncedPassed = this.updateDebounce(rule.id, evalResult.passed);
      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: debouncedPassed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
        weight: rule.weight
      });
    });
    this.frameFeedbacks = feedbacks;
    return feedbacks;
  }
  /**
   * Gets the measured value for a rule from the appropriate data source.
   */
  getMeasuredValue(rule, index, repData, phaseData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const comparator = this.getComparator(rule);
    const interval = this.getInterval(rule);
    const dataSource = interval === "PHASE" && phaseData ? phaseData[this.getPhases(rule)[0]] : repData;
    if (!dataSource) return NaN;
    if (rule.template === "symmetry") {
      const left = (_b = dataSource[(_a = rule.feature_left) != null ? _a : ""]) != null ? _b : NaN;
      const right = (_d = dataSource[(_c = rule.feature_right) != null ? _c : ""]) != null ? _d : NaN;
      return left - right;
    }
    const feature = rule.feature;
    if (!feature) return NaN;
    if (comparator === "ABOVE") return (_f = (_e = dataSource[`${feature}_above`]) != null ? _e : dataSource[feature]) != null ? _f : NaN;
    if (comparator === "BELOW") return (_h = (_g = dataSource[`${feature}_below`]) != null ? _g : dataSource[feature]) != null ? _h : NaN;
    if (comparator === "MEAN") return (_j = (_i = dataSource[`${feature}_mean`]) != null ? _i : dataSource[feature]) != null ? _j : NaN;
    if (comparator === "STD") return (_k = dataSource[`${feature}_std`]) != null ? _k : NaN;
    return (_l = dataSource[feature]) != null ? _l : NaN;
  }
  /**
   * Evaluate rules using both rep-level and phase-level aggregates.
   */
  evaluateWithPhases(repData, phaseData) {
    const feedbacks = [];
    this.config.rules.forEach((rule, index) => {
      const interval = this.getInterval(rule);
      const ruleId = this.getRuleId(rule, index);
      const threshold = this.getThreshold(rule);
      if (threshold === void 0) return;
      if (interval === "FRAME") {
        const frameFeedback = this.frameFeedbacks.find((f) => f.ruleId === ruleId);
        if (frameFeedback) feedbacks.push(frameFeedback);
        return;
      }
      if (interval === "PHASE" && !phaseData) return;
      const measuredValue = this.getMeasuredValue(rule, index, repData, phaseData);
      if (Number.isNaN(measuredValue)) return;
      const valueToCompare = rule.template === "symmetry" ? Math.abs(measuredValue) : measuredValue;
      const evalResult = this.evaluateComparator(this.getComparator(rule), valueToCompare, threshold);
      feedbacks.push({
        ruleId,
        errorType: rule.error_type,
        passed: evalResult.passed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction,
        weight: rule.weight
      });
    });
    return feedbacks;
  }
  /**
   * Resets frame-level buffers. Call this at the start of each rep.
   */
  reset() {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
  }
  /**
   * Full reset including debounce state. Call when starting a new exercise session.
   */
  fullReset() {
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    this.errorCounts = {};
    this.passCounts = {};
    this.activeErrors = {};
  }
};

exports.FeatureAggregator = FeatureAggregator;
exports.RepDetector = RepDetector;
exports.RuleEngine = RuleEngine;
exports.calculateAngle = calculateAngle;
exports.calculateAngle3D = calculateAngle3D;
exports.computeLetterbox = computeLetterbox;
exports.isValidKeypoint = isValidKeypoint;
exports.mapFromLetterbox = mapFromLetterbox;
exports.midpoint = midpoint;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map