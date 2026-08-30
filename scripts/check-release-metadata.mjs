import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const [workspace, core, changelog] = await Promise.all([
  readJson('package.json'),
  readJson('packages/typescript/package.json'),
  readFile(resolve(root, 'CHANGELOG.md'), 'utf8'),
]);

const validateUrl = (value, field) => {
  assert.equal(typeof value, 'string', `${field} must be configured.`);
  assert(!/(OWNER|REPLACE|example\.com)/i.test(value), `${field} still contains a placeholder.`);
  const url = new URL(value.replace(/^git\+/, ''));
  assert.equal(url.protocol, 'https:', `${field} must use HTTPS.`);
  return url;
};

assert.equal(workspace.version, core.version, 'Workspace and package versions must match.');
assert(
  changelog.includes(`## ${core.version}`) || changelog.includes(`## [${core.version}]`),
  `CHANGELOG.md has no ${core.version} release entry.`,
);

for (const [manifestName, manifest] of [
  ['workspace', workspace],
  ['@bordercut/core', core],
]) {
  const repositoryUrl = validateUrl(manifest.repository?.url, `${manifestName} repository.url`);
  const homepageUrl = validateUrl(manifest.homepage, `${manifestName} homepage`);
  const bugsUrl = validateUrl(manifest.bugs?.url, `${manifestName} bugs.url`);
  assert(repositoryUrl.hostname === homepageUrl.hostname, `${manifestName} repository and homepage hosts differ.`);
  assert(repositoryUrl.hostname === bugsUrl.hostname, `${manifestName} repository and bugs hosts differ.`);
}

assert.deepEqual(core.repository, workspace.repository, 'Repository metadata must match.');
assert.equal(core.homepage, workspace.homepage, 'Homepage metadata must match.');
assert.deepEqual(core.bugs, workspace.bugs, 'Bug metadata must match.');

process.stdout.write(`Release metadata is complete for @bordercut/core@${core.version}.\n`);
