import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

test('command configuration evaluates the base callback in development and native modes', async () => {
  for (const mode of ['development', 'native']) {
    const loaded = await loadConfigFromFile(
      { mode, command: 'serve' },
      fileURLToPath(new URL('../../vite.command.config.ts', import.meta.url)),
    );
    assert.ok(loaded);
    assert.equal(loaded.config.server.host, '127.0.0.1');
    assert.equal(loaded.config.server.port, 5188);
    assert.equal(loaded.config.server.strictPort, true);
    assert.ok(loaded.config.server.proxy['/api']);
    assert.ok(loaded.config.plugins.length);
    assert.equal(loaded.config.define['import.meta.env.VITE_API_BASE_URL'], '"http://127.0.0.1:8021/api"');
    if (mode === 'native') assert.ok(loaded.config.define['import.meta.env.VITE_SECURITY_MONITOR_URL']);
  }
});
