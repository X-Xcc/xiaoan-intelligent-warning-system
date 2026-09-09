export type AssistantPhase = 'idle' | 'listening' | 'greeting' | 'dragging' | 'thinking' | 'answering';
export type Gaze = { x: number; y: number };
export type MotionPose = {
  blink: number; breath: number; arm: number; relaxedArm: number;
  mouth: number; head: number; headY: number; lean: number; gazeX: number; gazeY: number;
};

const bound = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function gazeFromPointer(x: number, y: number, centerX: number, centerY: number): Gaze {
  return { x: bound((x - centerX) / 300, -1, 1), y: bound((y - centerY) / 240, -1, 1) };
}

export function smoothValue(current: number, target: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-12 * Math.max(0, deltaSeconds)));
}

export function sampleMotion(
  timeMs: number, phase: AssistantPhase, phaseElapsedMs: number, gaze: Gaze, reducedMotion = false,
): MotionPose {
  if (reducedMotion) return {
    blink: 1, breath: 1, arm: 0, relaxedArm: 0, mouth: .55,
    head: 0, headY: 0, lean: 0, gazeX: 0, gazeY: 0,
  };
  const t = timeMs / 1000;
  const elapsed = phaseElapsedMs / 1000;
  // Uneven blink intervals keep the face from looking like a looping metronome.
  const blinkTime = timeMs % 11300;
  const blink = 1 - Math.max(...[2600, 6240, 6540, 10050].map(center =>
    Math.max(0, 1 - Math.abs(blinkTime - center) / 105),
  ));
  const pose: MotionPose = {
    blink, breath: 1 + Math.sin(t * 1.9) * .005,
    arm: Math.sin(t * 1.1) * 1.7, relaxedArm: Math.sin(t * 1.2 + .8) * 1.3,
    mouth: .55, head: gaze.x * 4 + Math.sin(t * .8) * 1.2,
    headY: gaze.y * 3, lean: Math.sin(t * .85) * .65,
    gazeX: gaze.x * 2.4, gazeY: gaze.y * 1.8,
  };
  if (phase === 'greeting') {
    const envelope = Math.sin(Math.min(1, elapsed / 1.8) * Math.PI);
    pose.arm += Math.sin(elapsed * 10) * 16 * envelope;
    pose.head += Math.sin(elapsed * 5) * 5 * envelope;
    pose.headY += Math.sin(elapsed * 8) * 4 * envelope;
    pose.mouth = .9;
  } else if (phase === 'listening') {
    pose.head += -4;
    pose.headY += Math.sin(elapsed * 3) * 2;
    pose.arm -= 5;
    pose.mouth = .38;
  } else if (phase === 'thinking') {
    pose.head += 6 + Math.sin(elapsed * 2) * 1.4;
    pose.arm -= 10;
    pose.gazeX = 2.5;
    pose.gazeY = -2;
    pose.mouth = .24;
  } else if (phase === 'answering') {
    const cadence = Math.max(0, Math.sin(elapsed * 13) * Math.cos(elapsed * 3.1));
    pose.mouth = .3 + cadence * .8;
    pose.head += Math.sin(elapsed * 3.7) * 2.6;
    pose.headY += Math.sin(elapsed * 5) * 2;
    pose.arm += -6 + Math.sin(elapsed * 3.1) * 7;
    pose.relaxedArm += Math.sin(elapsed * 2.3) * 2;
  } else if (phase === 'dragging') {
    pose.lean = -3;
    pose.arm = -13;
    pose.relaxedArm = 8;
    pose.head = 5;
    pose.mouth = .95;
  }
  return pose;
}

export function nextStreamStep(cursor: number, total: number): number {
  return Math.min(total, cursor + (cursor % 11 < 5 ? 2 : 3));
}
