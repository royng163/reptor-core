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

// src/utils/fpsNormalizer.ts
var FPS_WINDOW_MS = 5e3;
var FpsNormalizer = class {
  constructor(targetFps = 30) {
    this.targetIntervalMs = 1e3 / targetFps;
    this.state = this.createEmptyState();
  }
  createEmptyState() {
    return {
      currentSrcTs: 0,
      nextTargetTs: 0,
      inputFrameTimestamps: [],
      normalizedFrameTimestamps: [],
      inputFps: 0,
      normalizedFps: 0
    };
  }
  reset() {
    this.state = this.createEmptyState();
  }
  getInputFps() {
    return this.state.inputFps;
  }
  getNormalizedFps() {
    return this.state.normalizedFps;
  }
  updateInputFps(timestamp) {
    this.state.inputFrameTimestamps.push(timestamp);
    const cutoff = timestamp - FPS_WINDOW_MS;
    while (this.state.inputFrameTimestamps.length > 0 && this.state.inputFrameTimestamps[0] < cutoff) {
      this.state.inputFrameTimestamps.shift();
    }
    const windowDurationSec = (timestamp - this.state.inputFrameTimestamps[0]) / 1e3;
    if (windowDurationSec > 0) {
      this.state.inputFps = this.state.inputFrameTimestamps.length / windowDurationSec;
    }
  }
  updateNormalizedFps(timestamp) {
    this.state.normalizedFrameTimestamps.push(timestamp);
    const cutoff = timestamp - FPS_WINDOW_MS;
    while (this.state.normalizedFrameTimestamps.length > 0 && this.state.normalizedFrameTimestamps[0] < cutoff) {
      this.state.normalizedFrameTimestamps.shift();
    }
    const windowDurationSec = (timestamp - this.state.normalizedFrameTimestamps[0]) / 1e3;
    if (windowDurationSec > 0) {
      this.state.normalizedFps = this.state.normalizedFrameTimestamps.length / windowDurationSec;
    }
  }
  push(keypoints, sourceTimestampMs) {
    this.updateInputFps(sourceTimestampMs);
    if (this.state.currentSrcTs == 0) {
      this.state.currentSrcTs = sourceTimestampMs;
      this.state.nextTargetTs = sourceTimestampMs;
      this.updateNormalizedFps(Math.floor(sourceTimestampMs));
      return [{ timestamp: Math.floor(sourceTimestampMs), keypoints }];
    }
    const frameDurationMs = Math.max(1, sourceTimestampMs - this.state.currentSrcTs);
    const frameEndTs = this.state.currentSrcTs + frameDurationMs;
    const out = [];
    while (this.state.nextTargetTs < frameEndTs) {
      const ts = Math.floor(this.state.nextTargetTs);
      out.push({ timestamp: ts, keypoints });
      this.updateNormalizedFps(ts);
      this.state.nextTargetTs += this.targetIntervalMs;
    }
    this.state.currentSrcTs += frameDurationMs;
    return out;
  }
};

// src/analysis/repDetector.ts
var EXERCISE_IDS = ["squat", "bicep_curl", "shoulder_press", "bench_press", "lat_pulldown"];
var RepDetector = class {
  constructor(exerciseId) {
    this.state = "IDLE";
    this.valueHistory = [];
    this.historySize = 10;
    this.minRepFrames = 10;
    this.pendingStart = null;
    this.startValue = null;
    if (!EXERCISE_IDS.includes(exerciseId)) {
      throw new Error(`Unsupported exercise_id: ${exerciseId}`);
    }
    this.exerciseId = exerciseId;
  }
  /**
   * Extracts the primary value for rep detection based on exercise type.
   * Returns the angle value used to detect reps.
   */
  getPrimaryValue(features) {
    if (this.exerciseId === "squat") {
      const left2 = features.knee_flexion_left;
      const right2 = features.knee_flexion_right;
      if (left2 == null || right2 == null) return null;
      return 0.5 * (left2 + right2);
    }
    const left = features.elbow_flexion_left;
    const right = features.elbow_flexion_right;
    if (left == null || right == null) return null;
    return 0.5 * (left + right);
  }
  /**
   * Get threshold for this exercise
   */
  getThreshold() {
    switch (this.exerciseId) {
      case "squat":
        return 5;
      case "bicep_curl":
        return 5;
      case "shoulder_press":
        return 6;
      case "bench_press":
        return 5;
      case "lat_pulldown":
        return 6;
      default:
        return 5;
    }
  }
  /**
   * Get completion tolerance to consider "back to start"
   */
  getCompletionTolerance() {
    return this.getThreshold() * 3;
  }
  /**
   * Gets average of most recent N frames.
   */
  getRecentAverage(n) {
    const recent = this.valueHistory.slice(-n);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }
  /**
   * Gets average of frames before the most recent N frames.
   */
  getOlderAverage(n) {
    const older = this.valueHistory.slice(0, -n);
    if (older.length === 0) return this.valueHistory[0];
    return older.reduce((a, b) => a + b, 0) / older.length;
  }
  /**
   * Detects the current phase based on primary value.
   * @param features - Frame features with flexion angles
   * @param frameIdx - Current frame index
   */
  detect(features, frameIdx) {
    let isRepFinished = false;
    const value = this.getPrimaryValue(features);
    if (value == null) {
      return {
        state: this.state,
        isRepFinished,
        velocity: 0
      };
    }
    this.valueHistory.push(value);
    if (this.valueHistory.length > this.historySize) {
      this.valueHistory.shift();
    }
    if (this.valueHistory.length < 3) {
      return { state: this.state, isRepFinished, velocity: 0 };
    }
    const recentAvg = this.getRecentAverage(3);
    const olderAvg = this.getOlderAverage(3);
    const velocity = recentAvg - olderAvg;
    const threshold = this.getThreshold();
    const isConcentricDownwardExercise = this.exerciseId === "squat" || this.exerciseId === "bicep_curl" || this.exerciseId === "lat_pulldown";
    switch (this.state) {
      case "IDLE":
        if (isConcentricDownwardExercise) {
          if (velocity < -threshold) {
            this.state = "CONCENTRIC";
            this.pendingStart = frameIdx;
            this.startValue = this.valueHistory[this.valueHistory.length - 3];
          }
        } else {
          if (velocity > threshold) {
            this.state = "CONCENTRIC";
            this.pendingStart = frameIdx;
            this.startValue = this.valueHistory[this.valueHistory.length - 3];
          }
        }
        break;
      case "CONCENTRIC":
        if (isConcentricDownwardExercise) {
          if (velocity > threshold) {
            this.state = "ECCENTRIC";
          }
        } else {
          if (-velocity > threshold) {
            this.state = "ECCENTRIC";
          }
        }
        break;
      case "ECCENTRIC":
        if (Math.abs(velocity) < threshold / 3 && this.startValue != null) {
          if (Math.abs(value - this.startValue) < this.getCompletionTolerance()) {
            if (this.pendingStart != null && frameIdx - this.pendingStart >= this.minRepFrames) {
              isRepFinished = true;
            }
            this.state = "IDLE";
            this.pendingStart = null;
            this.startValue = null;
          }
        } else if (velocity > threshold) {
          this.state = "CONCENTRIC";
          this.startValue = this.valueHistory[this.valueHistory.length - 3];
        }
        break;
    }
    return { state: this.state, isRepFinished, velocity };
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
    this.valueHistory = [];
    this.pendingStart = null;
    this.startValue = null;
  }
};

// src/analysis/featureAggregator.ts
var EXERCISE_FEATURES = {
  squat: [
    "knee_flexion_left",
    "knee_flexion_right",
    "knee_joint_center_x_offset",
    "stance_width_normalized",
    "stance_width",
    "trunk_angle",
    "hip_flexion_symmetry"
  ],
  bicep_curl: ["elbow_flexion_left", "elbow_flexion_right", "elbow_to_shoulder_y_left", "torso_tilt"],
  shoulder_press: [
    "elbow_flexion_left",
    "elbow_flexion_right",
    "wrist_to_shoulder_y_left",
    "wrist_to_shoulder_y_right",
    "trunk_angle"
  ],
  bench_press: [
    "elbow_flexion_left",
    "elbow_flexion_right",
    "wrist_to_shoulder_y_left",
    "wrist_to_shoulder_y_right",
    "trunk_angle"
  ],
  lat_pulldown: ["wrist_to_shoulder_y_left", "wrist_to_shoulder_y_right", "torso_tilt"]
};
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
  extractFeatures(keypoints, exerciseId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
    const lk = keypoints.get("left_knee");
    const rk = keypoints.get("right_knee");
    const lh = keypoints.get("left_hip");
    const rh = keypoints.get("right_hip");
    const la = keypoints.get("left_ankle");
    const ra = keypoints.get("right_ankle");
    const ls = keypoints.get("left_shoulder");
    const rs = keypoints.get("right_shoulder");
    const le = keypoints.get("left_elbow");
    const re = keypoints.get("right_elbow");
    const lw = keypoints.get("left_wrist");
    const rw = keypoints.get("right_wrist");
    const kneeFlexionLeft = calculateAngle(lh, lk, la);
    const kneeFlexionRight = calculateAngle(rh, rk, ra);
    const kneeFlexion = (kneeFlexionLeft + kneeFlexionRight) / 2;
    const elbowFlexionLeft = calculateAngle(ls, le, lw);
    const elbowFlexionRight = calculateAngle(rs, re, rw);
    const trunkAngleLeft = calculateAngle(lh, ls, void 0);
    const trunkAngleRight = calculateAngle(rh, rs, void 0);
    const trunkAngle = (trunkAngleLeft + trunkAngleRight) / 2;
    const hipWidth = Math.abs(((_a = rh == null ? void 0 : rh.x) != null ? _a : 0) - ((_b = lh == null ? void 0 : lh.x) != null ? _b : 0));
    const stanceWidth = Math.abs(((_c = ra == null ? void 0 : ra.x) != null ? _c : 0) - ((_d = la == null ? void 0 : la.x) != null ? _d : 0));
    const stanceWidthNormalized = hipWidth > 0 ? stanceWidth / hipWidth : NaN;
    const kneeJointCenterXOffset = Math.abs(((_e = lk == null ? void 0 : lk.x) != null ? _e : 0) - ((_f = rk == null ? void 0 : rk.x) != null ? _f : 0));
    const hipFlexionSymmetry = Math.abs(((_g = lh == null ? void 0 : lh.y) != null ? _g : 0) - ((_h = rh == null ? void 0 : rh.y) != null ? _h : 0));
    const elbowToShoulderYLeft = ((_i = le == null ? void 0 : le.y) != null ? _i : 0) - ((_j = ls == null ? void 0 : ls.y) != null ? _j : 0);
    const wristToShoulderYLeft = ((_k = lw == null ? void 0 : lw.y) != null ? _k : 0) - ((_l = ls == null ? void 0 : ls.y) != null ? _l : 0);
    const wristToShoulderYRight = ((_m = rw == null ? void 0 : rw.y) != null ? _m : 0) - ((_n = rs == null ? void 0 : rs.y) != null ? _n : 0);
    const shoulderCenterX = (((_o = ls == null ? void 0 : ls.x) != null ? _o : 0) + ((_p = rs == null ? void 0 : rs.x) != null ? _p : 0)) / 2;
    const hipCenterX = (((_q = lh == null ? void 0 : lh.x) != null ? _q : 0) + ((_r = rh == null ? void 0 : rh.x) != null ? _r : 0)) / 2;
    const torsoTilt = Math.abs(shoulderCenterX - hipCenterX);
    const frameData = {
      knee_flexion: kneeFlexion,
      knee_flexion_left: kneeFlexionLeft,
      knee_flexion_right: kneeFlexionRight,
      elbow_flexion_left: elbowFlexionLeft,
      elbow_flexion_right: elbowFlexionRight,
      knee_joint_center_x_offset: kneeJointCenterXOffset,
      stance_width_normalized: stanceWidthNormalized,
      stance_width: stanceWidth,
      trunk_angle: trunkAngle,
      hip_flexion_symmetry: hipFlexionSymmetry,
      elbow_to_shoulder_y_left: elbowToShoulderYLeft,
      torso_tilt: torsoTilt,
      wrist_to_shoulder_y_left: wristToShoulderYLeft,
      wrist_to_shoulder_y_right: wristToShoulderYRight
    };
    const supportedFeatures = EXERCISE_FEATURES[exerciseId];
    if (supportedFeatures) {
      for (const feature of supportedFeatures) {
        const value = frameData[feature];
        if (value !== void 0) {
          this.recordFeature(feature, value);
        }
      }
    }
    return frameData;
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
    try {
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
    } catch (e) {
      console.warn("[RuleEngine] evaluateFrame error:", e);
      return [];
    }
    const errors = feedbacks.filter((f) => !f.passed).map((f) => f.errorType);
    const totalWeight = feedbacks.reduce((s, f) => {
      var _a;
      return s + ((_a = f.weight) != null ? _a : 1);
    }, 0);
    const failedWeight = feedbacks.filter((f) => !f.passed).reduce((s, f) => {
      var _a;
      return s + ((_a = f.weight) != null ? _a : 1);
    }, 0);
    const quality = totalWeight > 0 ? Math.max(0, 1 - failedWeight / totalWeight) : 1;
    feedbacks.forEach((f) => {
      f.errors = errors;
      f.quality = quality;
    });
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

exports.EXERCISE_IDS = EXERCISE_IDS;
exports.FeatureAggregator = FeatureAggregator;
exports.FpsNormalizer = FpsNormalizer;
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