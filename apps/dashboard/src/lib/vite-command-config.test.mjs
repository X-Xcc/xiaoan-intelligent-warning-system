import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadConfigFromFile } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configFile = fileURLToPath(new URL('../../vite.command.config.ts', import.meta.url));

for (const mode of ['development', 'native']) {
  test(`command config loads in ${mode} and preserves base config with command overrides`, async t => {
    const env = {
      VITE_APP_BASE_PATH: '/command-test/',
      VITE_API_BASE_URL: 'http://127.0.0.1:8999/api',
      VITE_SECURITY_MONITOR_URL: 'http://127.0.0.1:8999/monitor',
      CICSIC_PROXY_TARGET: 'http://127.0.0.1:8999',
    };
    for (const [key, value] of Object.entries(env)) {
      const previous = process.env[key];
      t.after(() => {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      });
      process.env[key] = value;
    }
    const result = await loadConfigFromFile(
      { command: mode === 'native' ? 'build' : 'serve', mode },
      configFile, root, 'silent',
    );
    assert.ok(result, 'Vite must load the actual command config');
    const { config } = result;
    assert.equal(config.base, env.VITE_APP_BASE_PATH);
    assert.ok(config.plugins.flat(Infinity).some(plugin => plugin.name === 'vite:react-babel'));
    assert.equal(config.server.host, '127.0.0.1');
    assert.equal(config.server.port, 5188);
    assert.equal(config.server.strictPort, true);
    assert.deepEqual(config.server.proxy['/api'], {
      target: env.CICSIC_PROXY_TARGET, changeOrigin: true, ws: true,
    });
    assert.equal(config.define['import.meta.env.VITE_API_BASE_URL'], JSON.stringify('http://127.0.0.1:8021/api'));
    assert.equal(config.define['import.meta.env.VITE_SECURITY_MONITOR_URL'],
      mode === 'native' ? JSON.stringify(env.VITE_SECURITY_MONITOR_URL) : undefined);
  });
}
