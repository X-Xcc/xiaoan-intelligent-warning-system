import { describe, expect, it } from 'vitest';
import {
  TRAINING_ALGO_VERSIONS,
  TRAINING_LOG_MESSAGES,
  buildTrainingCompleteLog,
  buildTrainingLoadedLog,
  buildTrainingUploadErrorLog,
  buildTrainingUploadSuccessLog,
  buildTrainingWarnLogs,
  createTrainingUploadItem,
  formatTrainingAssetSize,
  getRecognitionProgress,
  getTrainingProgressDetail,
  getTrainingProgressStatus,
  toggleTrainingAlgoSelection,
} from './training-data';

describe('training data helpers', () => {
  it('formats size and creates upload item', () => {
    expect(formatTrainingAssetSize(512)).toBe('512 B');
    expect(formatTrainingAssetSize(2048)).toBe('2.0 KB');
    expect(createTrainingUploadItem({ name: 'clip.mp4', size: 2048, type: 'video/mp4' } as File, 'id-1')).toEqual({
      id: 'id-1',
      name: 'clip.mp4',
      size: '2.0 KB',
      type: 'video',
      status: 'uploading',
      progress: 0,
    });
  });

  it('toggles selected algorithms', () => {
    expect(toggleTrainingAlgoSelection([0, 3], 3)).toEqual([0]);
    expect(toggleTrainingAlgoSelection([0], 2)).toEqual([0, 2]);
  });

  it('builds log entries and recognition progress', () => {
    expect(buildTrainingUploadSuccessLog({ name: 'clip.mp4', size: 1024 } as File, '10:00:00').message).toContain('素材上传成功');
    expect(buildTrainingUploadErrorLog('网络异常', '10:00:01').message).toContain('网络异常');
    expect(buildTrainingLoadedLog('clip.mp4', '10:00:02').message).toContain('clip.mp4');
    expect(buildTrainingWarnLogs('10:00:03')).toHaveLength(2);
    expect(buildTrainingCompleteLog('10:00:04').level).toBe('RECOG');
    expect(getRecognitionProgress(6000, 12000)).toBe(50);
  });

  it('derives progress text and exposes constants', () => {
    expect(getTrainingProgressStatus(40, true)).toBe('识别中...');
    expect(getTrainingProgressStatus(100, false)).toBe('已完成');
    expect(getTrainingProgressDetail(75)).toBe('剩余 25%');
    expect(getTrainingProgressDetail(100)).toBe('就绪');
    expect(TRAINING_ALGO_VERSIONS).toHaveLength(4);
    expect(TRAINING_LOG_MESSAGES.length).toBeGreaterThan(5);
  });
});
