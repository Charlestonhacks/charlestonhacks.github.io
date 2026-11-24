// Run from the repo root: node --test tests/community-reader.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkProfile, suggestMatches, safeHttpsUrl, loadProfile, PROFILE_URLS } from '../assets/js/community-reader.js';

const ch = JSON.parse(readFileSync(new URL('../.well-known/community-profile.json', import.meta.url)));

// Fictional community used only for tests.
const example = {
  specVersion: '0.2.0',
  identity: { name: 'Example Makers Guild', url: 'https://example.org', summary: 'A fictional test community.' },
  offers: [
    { id: 'offer:space', label: 'Workshop space', description: 'We can host evening events in our venue.' },
    { id: 'offer:mentors', label: 'Mentor network', description: 'Experienced engineers who mentor and judge competitions.' },
  ],
  needs: [{ id: 'need:events', kind: 'partner', description: 'Groups to co-host hackathon events.' }],
  openTo: ['Event co-hosting'],
  accessibility: { humanUrl: 'https://example.org' },
};

test('the published CharlestonHacks profile passes the reader check', () => {
  assert.equal(checkProfile(ch), null);
});

test('rejects things that are not v0.2 profiles', () => {
  assert.match(checkProfile(null), /Not a JSON object/);
  assert.match(checkProfile({ specVersion: '1.0.0', identity: { name: 'x' } }), /v0\.2/);
  assert.match(checkProfile({ specVersion: '0.2.0', identity: {} }), /identity\.name/);
});

test('suggests matches in both directions between two communities', () => {
  const chToEx = suggestMatches(ch, example);
  assert.ok(chToEx.some((m) => m.need.id === 'need:venues-challenges' && m.offer === 'Workshop space'), 'venue need meets workspace offer');
  assert.ok(chToEx.some((m) => m.need.id === 'need:mentors-judges' && m.offer === 'Mentor network'), 'mentor need meets mentor offer');
  const exToCh = suggestMatches(example, ch);
  assert.ok(exToCh.some((m) => m.need.id === 'need:events'), 'example co-hosting need meets a CharlestonHacks offer');
});

test('a community is never matched with itself', () => {
  assert.deepEqual(suggestMatches(ch, ch), []);
});

test('only https links are rendered as links', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('http://example.org'), null);
  assert.equal(safeHttpsUrl('https://example.org/x'), 'https://example.org/x');
});

test('loadProfile reports HTTP errors and invalid profiles', async () => {
  const fake = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });
  await assert.rejects(loadProfile('https://x', fake(404, {})), /HTTP 404/);
  await assert.rejects(loadProfile('https://x', fake(200, { specVersion: '9' })), /v0\.2/);
  assert.equal((await loadProfile('https://x', fake(200, example))).identity.name, 'Example Makers Guild');
});

test('default list contains only published profiles', () => {
  assert.deepEqual(PROFILE_URLS, ['https://charlestonhacks.com/.well-known/community-profile.json']);
});
