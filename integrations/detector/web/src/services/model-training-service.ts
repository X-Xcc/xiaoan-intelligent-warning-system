import { apiUpload } from '../lib/api';

export async function uploadTrainingResource(file: File, onProgress: (percent: number) => void) {
  return apiUpload('/api/upload_training_resource', file, onProgress);
}
