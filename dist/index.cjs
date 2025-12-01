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
function angleToVertical(a, b) {
  if (!isValidKeypoint(a) || !isValidKeypoint(b)) {
    return NaN;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return angleRad * (180 / Math.PI);
}
function angleToHorizontal(a, b) {
  if (!isValidKeypoint(a) || !isValidKeypoint(b)) {
    return NaN;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angleRad = Math.atan2(Math.abs(dy), Math.abs(dx));
  return angleRad * (180 / Math.PI);
}
function distance2D(a, b) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
function distance3D(a, b) {
  if (a.z === void 0 || b.z === void 0) {
    return distance2D(a, b);
  }
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
}
function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z !== void 0 && b.z !== void 0 ? (a.z + b.z) / 2 : void 0,
    visibility: a.visibility !== void 0 && b.visibility !== void 0 ? (a.visibility + b.visibility) / 2 : void 0
  };
}
function isVisible(keypoint, threshold = 0.5) {
  return keypoint.visibility !== void 0 && keypoint.visibility >= threshold;
}
function allVisible(keypoints, threshold = 0.5) {
  return keypoints.every((kp) => isVisible(kp, threshold));
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
          this.state = "DESCENDING";
        }
        break;
      case "DESCENDING":
        if (velocity < -this.MOVEMENT_THRESHOLD) {
          this.state = "ASCENDING";
        }
        break;
      case "ASCENDING":
        if (velocity > this.MOVEMENT_THRESHOLD) {
          this.state = "DESCENDING";
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
      DESCENDING: {},
      ASCENDING: {}
    };
  }
  /**
   * Sets the current phase for aggregation.
   */
  setPhase(phase) {
    this.currentPhase = phase;
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
  processFrame(kneeFlexionLeft, kneeFlexionRight, trunkAngle, stanceWidth) {
    const kneeFlexion = (kneeFlexionLeft + kneeFlexionRight) / 2;
    this.recordFeature("knee_flexion", kneeFlexion);
    this.recordFeature("knee_flexion_left", kneeFlexionLeft);
    this.recordFeature("knee_flexion_right", kneeFlexionRight);
    this.recordFeature("trunk_angle", trunkAngle);
    this.recordFeature("stance_width", stanceWidth);
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
      DESCENDING: {},
      ASCENDING: {}
    };
    for (const phase of ["IDLE", "DESCENDING", "ASCENDING"]) {
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
      DESCENDING: {},
      ASCENDING: {}
    };
  }
};

// src/analysis/ruleEngine.ts
var RuleEngine = class {
  constructor(config) {
    this.config = config;
    this.currentView = "front";
    // Buffer for frame-level stability calculations
    this.frameBuffer = {};
    this.frameFeedbacks = [];
    // Debouncing for frame-level errors
    this.errorCounts = {};
    this.passCounts = {};
    this.activeErrors = {};
    // Configuration for debouncing
    this.ERROR_TRIGGER_FRAMES = 5;
    // Consecutive error frames to trigger
    this.ERROR_CLEAR_FRAMES = 10;
    // Consecutive pass frames to clear
    // Tolerance percentage for "mean" comparator (e.g., 0.2 = 20% deviation allowed)
    this.MEAN_TOLERANCE = 0.2;
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
  /**
   * Gets the threshold for a rule based on the current view.
   */
  getThreshold(rule) {
    var _a, _b, _c;
    if (rule.type === "range") {
      return (_a = rule.thresholds) == null ? void 0 : _a[this.currentView];
    } else if (rule.type === "symmetry") {
      return (_b = rule.maxDiff) == null ? void 0 : _b[this.currentView];
    } else if (rule.type === "stability") {
      return (_c = rule.maxStd) == null ? void 0 : _c[this.currentView];
    }
    return void 0;
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
  evaluateComparator(rule, value, threshold) {
    switch (rule.comparator) {
      case "min":
        return { passed: value <= threshold };
      case "max":
        return { passed: value <= threshold };
      case "mean":
        const lowerBound = threshold * (1 - this.MEAN_TOLERANCE);
        const upperBound = threshold * (1 + this.MEAN_TOLERANCE);
        if (value < lowerBound) {
          return { passed: false, direction: "low" };
        } else if (value > upperBound) {
          return { passed: false, direction: "high" };
        }
        return { passed: true };
      case "std":
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
   * Gets all currently active (debounced) errors.
   */
  getActiveErrors() {
    return this.frameFeedbacks.filter((f) => !f.passed);
  }
  /**
   * Evaluate frame-level rules for instant feedback.
   * Call this every frame during exercise.
   */
  evaluateFrame(frameData, currentPhase) {
    var _a, _b, _c, _d;
    const feedbacks = [];
    for (const rule of this.config.rules) {
      if (rule.evaluation !== "FRAME") continue;
      if (rule.targetPhase && rule.targetPhase !== currentPhase && rule.targetPhase !== "IDLE") {
        this.updateDebounce(rule.id, true);
        continue;
      }
      const threshold = this.getThreshold(rule);
      if (threshold === void 0) continue;
      let measuredValue;
      let evalResult;
      if (rule.type === "symmetry") {
        const left = (_a = frameData[rule.feature_left]) != null ? _a : NaN;
        const right = (_b = frameData[rule.feature_right]) != null ? _b : NaN;
        measuredValue = Math.abs(left - right);
        evalResult = this.evaluateComparator(rule, measuredValue, threshold);
      } else if (rule.type === "stability") {
        const feature = rule.feature;
        const value = (_c = frameData[feature]) != null ? _c : NaN;
        if (!isNaN(value)) {
          if (!this.frameBuffer[feature]) {
            this.frameBuffer[feature] = [];
          }
          this.frameBuffer[feature].push(value);
          if (this.frameBuffer[feature].length >= 10) {
            measuredValue = this.calcStd(this.frameBuffer[feature]);
            evalResult = this.evaluateComparator(rule, measuredValue, threshold);
          } else {
            continue;
          }
        } else {
          continue;
        }
      } else if (rule.type === "range") {
        measuredValue = (_d = frameData[rule.feature]) != null ? _d : NaN;
        if (isNaN(measuredValue)) continue;
        evalResult = this.evaluateComparator(rule, measuredValue, threshold);
      } else {
        continue;
      }
      const debouncedPassed = this.updateDebounce(rule.id, evalResult.passed);
      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: debouncedPassed,
        value: measuredValue,
        threshold
      });
    }
    this.frameFeedbacks = feedbacks;
    return feedbacks;
  }
  /**
   * Gets the measured value for a rule from the appropriate data source.
   */
  getMeasuredValue(rule, repData, phaseData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    if (rule.evaluation === "PHASE" && phaseData) {
      const phaseValues = phaseData[rule.targetPhase];
      if (!phaseValues) return NaN;
      if (rule.type === "symmetry") {
        const left = (_a = phaseValues[rule.feature_left]) != null ? _a : NaN;
        const right = (_b = phaseValues[rule.feature_right]) != null ? _b : NaN;
        return left - right;
      }
      const feature2 = rule.feature;
      if (rule.comparator === "min") {
        return (_d = (_c = phaseValues[`${feature2}_min`]) != null ? _c : phaseValues[feature2]) != null ? _d : NaN;
      } else if (rule.comparator === "max") {
        return (_f = (_e = phaseValues[`${feature2}_max`]) != null ? _e : phaseValues[feature2]) != null ? _f : NaN;
      } else if (rule.comparator === "mean") {
        return (_h = (_g = phaseValues[`${feature2}_mean`]) != null ? _g : phaseValues[feature2]) != null ? _h : NaN;
      } else if (rule.comparator === "std") {
        return (_i = phaseValues[`${feature2}_std`]) != null ? _i : NaN;
      }
      return (_j = phaseValues[feature2]) != null ? _j : NaN;
    }
    if (rule.type === "symmetry") {
      const left = (_k = repData[rule.feature_left]) != null ? _k : NaN;
      const right = (_l = repData[rule.feature_right]) != null ? _l : NaN;
      return left - right;
    }
    const feature = rule.feature;
    if (rule.comparator === "min") {
      return (_n = (_m = repData[`${feature}_min`]) != null ? _m : repData[feature]) != null ? _n : NaN;
    } else if (rule.comparator === "max") {
      return (_p = (_o = repData[`${feature}_max`]) != null ? _o : repData[feature]) != null ? _p : NaN;
    } else if (rule.comparator === "mean") {
      return (_r = (_q = repData[`${feature}_mean`]) != null ? _q : repData[feature]) != null ? _r : NaN;
    } else if (rule.comparator === "std") {
      return (_s = repData[`${feature}_std`]) != null ? _s : NaN;
    }
    return (_t = repData[feature]) != null ? _t : NaN;
  }
  /**
   * Evaluate rules using rep-level aggregates only.
   */
  evaluate(data) {
    return this.evaluateWithPhases(data);
  }
  /**
   * Evaluate rules using both rep-level and phase-level aggregates.
   * Call this at the end of a rep.
   */
  evaluateWithPhases(repData, phaseData) {
    const feedbacks = [];
    for (const rule of this.config.rules) {
      const threshold = this.getThreshold(rule);
      if (threshold === void 0) {
        continue;
      }
      if (rule.evaluation === "FRAME") {
        const frameFeedback = this.frameFeedbacks.find((f) => f.ruleId === rule.id);
        if (frameFeedback) {
          feedbacks.push(frameFeedback);
        }
        continue;
      }
      if (rule.evaluation === "PHASE" && !phaseData) {
        continue;
      }
      const measuredValue = this.getMeasuredValue(rule, repData, phaseData);
      if (isNaN(measuredValue)) {
        continue;
      }
      const valueToCompare = rule.type === "symmetry" ? Math.abs(measuredValue) : measuredValue;
      const evalResult = this.evaluateComparator(rule, valueToCompare, threshold);
      feedbacks.push({
        ruleId: rule.id,
        errorType: rule.error_type,
        passed: evalResult.passed,
        value: measuredValue,
        threshold,
        direction: evalResult.direction
      });
    }
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
exports.allVisible = allVisible;
exports.angleToHorizontal = angleToHorizontal;
exports.angleToVertical = angleToVertical;
exports.calculateAngle = calculateAngle;
exports.calculateAngle3D = calculateAngle3D;
exports.computeLetterbox = computeLetterbox;
exports.distance2D = distance2D;
exports.distance3D = distance3D;
exports.isValidKeypoint = isValidKeypoint;
exports.isVisible = isVisible;
exports.mapFromLetterbox = mapFromLetterbox;
exports.midpoint = midpoint;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map