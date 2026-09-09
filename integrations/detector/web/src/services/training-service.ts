import { apiUpload } from '../lib/api';

export async function uploadTrainingComparisonResource<T = { filename: string; originalName: string; size: number; type: string; path: string }>(file: File, onProgress: (percent: number) => void) {
  return apiUpload<T>('/api/upload_training_resource', file, onProgress);
}
