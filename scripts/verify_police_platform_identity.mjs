import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = new URL('../', import.meta.url);
const dashboardPackagePath = new URL('apps/dashboard/package.json', workspace);
const lockfilePath = new URL('package-lock.json', workspace);
const amapMapPath = new URL('apps/dashboard/src/components/NanchangAmapMap.tsx', workspace);

const DASHBOARD_PACKAGE_NAME = '@public-security-ai/dashboard';
const AMAP_LOADER_NAME = '__publicSecurityPlatformAmapLoader';

test('dashboard workspace metadata identifies the public-security AI platform', () => {
  const dashboardPackage = JSON.parse(fs.readFileSync(dashboardPackagePath, 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));

  assert.equal(dashboardPackage.name, DASHBOARD_PACKAGE_NAME);
  assert.equal(lockfile.packages['apps/dashboard']?.name, DASHBOARD_PACKAGE_NAME);
  assert.deepEqual(lockfile.packages[`node_modules/${DASHBOARD_PACKAGE_NAME}`], {
    resolved: 'apps/dashboard',
    link: true,
  });
});

test('AMap SDK loader is scoped to the public-security platform runtime', () => {
  const source = fs.readFileSync(amapMapPath, 'utf8');
  const loaderReferences = source.match(new RegExp(AMAP_LOADER_NAME, 'g')) ?? [];

  assert.equal(loaderReferences.length, 5);
  assert.doesNotMatch(source, /__yanhuoShaobingAmapLoader/);
});

test('AMap component models police incidents within jurisdictions', () => {
  const source = fs.readFileSync(amapMapPath, 'utf8');

  assert.match(source, /export type PoliceIncidentGeo/);
  assert.match(source, /jurisdiction: string;/);
  assert.match(source, /incidentNo: string;/);
  assert.match(source, /export function PoliceJurisdictionAmapMap/);
  assert.match(source, /incidents: PoliceIncidentGeo\[\];/);
  assert.match(source, /selectedIncidentId: string;/);
  assert.match(source, /公安辖区警情地图/);
  assert.doesNotMatch(source, /\bNightMarket\b|\bmarkets\b|\bselectedMarket\b/);
});
