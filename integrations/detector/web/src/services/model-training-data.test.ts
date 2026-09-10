import { describe, expect, it } from 'vitest';
import {
  MODEL_SCENE_TAGS,
  TRAINING_LOG_POOL,
  appendPromptTag,
  buildTrainingMetrics,
  formatTrainingDuration,
  formatTrainingSize,
  getTrainingFileKind,
  getTrainingProgressPercent,
  shouldOpenTrainingDoneDialog,
} from './model-training-data';

describe('model training data helpers', () => {
  it('builds training metrics and progress', () => {
    const metrics = buildTrainingMetrics(50, 10, 'running', 0, 10000, 4096);
    expect(metrics.current_epoch).toBe(10);
    expect(metrics.total_epochs).toBe(50);
    expect(metrics.gpu_memory_mb).toBe(4096);
    expect(getTrainingProgressPercent(10, 50)).toBe(20);
  });

  it('formats size and duration', () => {
    expect(formatTrainingSize(500)).toBe('500 B');
    expect(formatTrainingSize(2048)).toBe('2.0 KB');
    expect(formatTrainingSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatTrainingDuration(65)).toBe('1:05');
  });

  it('appends tags and detects file kinds', () => {
    expect(appendPromptTag('', '夜间场景')).toBe('夜间场景');
    expect(appendPromptTag('监舍走廊', '夜间场景')).toBe('监舍走廊 夜间场景');
    expect(getTrainingFileKind({ type: 'image/png' } as File)).toEqual({ isImage: true, isVideo: false });
    expect(getTrainingFileKind({ type: 'video/mp4' } as File)).toEqual({ isImage: false, isVideo: true });
  });

  it('reports dialog transition and exposes constants', () => {
    expect(shouldOpenTrainingDoneDialog('running', 'completed')).toBe(true);
    expect(shouldOpenTrainingDoneDialog('idle', 'completed')).toBe(false);
    expect(MODEL_SCENE_TAGS.length).toBeGreaterThan(0);
    expect(TRAINING_LOG_POOL.length).toBeGreaterThan(0);
  });
});
