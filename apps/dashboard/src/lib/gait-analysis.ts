export type GaitPoint = { x: number; y: number };

export type GaitAngles = {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
};

export type GaitPose = {
  joints: Record<string, GaitPoint>;
  angles: GaitAngles;
};

const TWO_PI = Math.PI * 2;
const H = 180;
const torsoLen = H * 0.3;
const headLen = H * 0.12;
const upperArmLen = H * 0.18;
const foreArmLen = H * 0.16;
const thighLen = H * 0.24;
const shankLen = H * 0.24;
const hipWidth = H * 0.2;
const shoulderWidth = H * 0.22;
const AMP_HIP = 0.45;
const AMP_KNEE = 0.55;
const AMP_ANKLE = 0.2;
const AMP_SHOULDER = 0.3;
const AMP_ELBOW = 0.15;

export function advanceGaitPhase(phase: number, deltaMs: number, speed: number): number {
  const next = phase + (Math.max(0, deltaMs) / 1000) * TWO_PI * Math.max(0, speed);
  return ((next % TWO_PI) + TWO_PI) % TWO_PI;
}

export function computeGaitPose(phaseVal: number): GaitPose {
  const p = phaseVal;
  const angles: GaitAngles = {
    hipL: AMP_HIP * Math.sin(p),
    hipR: AMP_HIP * Math.sin(p + Math.PI),
    kneeL: AMP_KNEE * Math.abs(Math.sin(p + 0.2)) + 0.08,
    kneeR: AMP_KNEE * Math.abs(Math.sin(p + Math.PI + 0.2)) + 0.08,
    shoulderL: -AMP_SHOULDER * Math.sin(p + 0.3),
    shoulderR: -AMP_SHOULDER * Math.sin(p + Math.PI + 0.3),
    elbowL: AMP_ELBOW * Math.abs(Math.sin(p + 0.8)) + 0.05,
    elbowR: AMP_ELBOW * Math.abs(Math.sin(p + Math.PI + 0.8)) + 0.05,
  };

  const cx = 400;
  const cy = 300;
  const shoulderY = cy - torsoLen;
  const shoulderX = cx;
  const lsX = shoulderX - shoulderWidth / 2;
  const rsX = shoulderX + shoulderWidth / 2;
  const lhX = cx - hipWidth / 2;
  const rhX = cx + hipWidth / 2;
  const kneeLX = lhX + thighLen * Math.sin(angles.hipL);
  const kneeLY = cy + thighLen * Math.cos(angles.hipL);
  const kneeRX = rhX + thighLen * Math.sin(angles.hipR);
  const kneeRY = cy + thighLen * Math.cos(angles.hipR);
  const ankleLX = kneeLX + shankLen * Math.sin(angles.hipL + angles.kneeL);
  const ankleLY = kneeLY + shankLen * Math.cos(angles.hipL + angles.kneeL);
  const ankleRX = kneeRX + shankLen * Math.sin(angles.hipR + angles.kneeR);
  const ankleRY = kneeRY + shankLen * Math.cos(angles.hipR + angles.kneeR);
  const elbowLX = lsX + upperArmLen * Math.sin(angles.shoulderL);
  const elbowLY = shoulderY + upperArmLen * Math.cos(angles.shoulderL);
  const elbowRX = rsX + upperArmLen * Math.sin(angles.shoulderR);
  const elbowRY = shoulderY + upperArmLen * Math.cos(angles.shoulderR);
  const wristLX = elbowLX + foreArmLen * Math.sin(angles.shoulderL + angles.elbowL);
  const wristLY = elbowLY + foreArmLen * Math.cos(angles.shoulderL + angles.elbowL);
  const wristRX = elbowRX + foreArmLen * Math.sin(angles.shoulderR + angles.elbowR);
  const wristRY = elbowRY + foreArmLen * Math.cos(angles.shoulderR + angles.elbowR);

  return {
    angles,
    joints: {
      head: { x: shoulderX, y: shoulderY - headLen },
      shoulder: { x: shoulderX, y: shoulderY },
      shoulderL: { x: lsX, y: shoulderY },
      shoulderR: { x: rsX, y: shoulderY },
      elbowL: { x: elbowLX, y: elbowLY },
      elbowR: { x: elbowRX, y: elbowRY },
      wristL: { x: wristLX, y: wristLY },
      wristR: { x: wristRX, y: wristRY },
      hipL: { x: lhX, y: cy },
      hipR: { x: rhX, y: cy },
      kneeL: { x: kneeLX, y: kneeLY },
      kneeR: { x: kneeRX, y: kneeRY },
      ankleL: { x: ankleLX, y: ankleLY },
      ankleR: { x: ankleRX, y: ankleRY },
    },
  };
}

export const gaitCanvasSize = {
  main: { width: 800, height: 600 },
  angle: { width: 400, height: 240 },
  gei: { width: 400, height: 320 },
};

export const gaitGeiFrames = 40;
export const gaitAngleHistory = 80;
