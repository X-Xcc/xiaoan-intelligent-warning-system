import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const source = path.join(path.dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const destination = path.join(root, 'public/wasm');
const model = path.join(root, 'public/models/pose_landmarker_lite.task');
if (!(await stat(model)).isFile()) throw new Error(`Pose model is missing: ${model}`);
await mkdir(destination, { recursive: true });
for (const name of await readdir(source)) {
  const input = path.join(source, name);
  const output = path.join(destination, name);
  const current = await readFile(output).catch(() => null);
  if (!current?.equals(await readFile(input))) await copyFile(input, output);
}
console.log('Local pose model and matching WASM runtime are ready.');
