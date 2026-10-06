import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PactV3, MatchersV3, Verifier } from '@pact-foundation/pact';
import { bookingSummary } from '../src/booking-client.js';

const { string, integer, fromProviderState } = MatchersV3;
const baseUrl = process.env.BOOKER_BASE_URL;
assert.ok(baseUrl?.startsWith('https://'), 'BOOKER_BASE_URL must use HTTPS');
const contractFile = resolve('results/contracts/booking-summary-restful-booker.json');
const dates = { checkin: '2027-03-10', checkout: '2027-03-12' };
const example = { firstname: 'Pact', lastname: 'Guest', totalprice: 120, bookingdates: dates };
const report = { target: baseUrl, consumer: [], provider: [], cleanup: [] };
const save = () => writeFileSync('results/verification.json', JSON.stringify(report, null, 2));

for (const paid of [true, false]) {
  test(`consumer: maps a booking with depositpaid=${paid}`, async () => {
    const pact = new PactV3({ consumer: 'booking-summary', provider: 'restful-booker', dir: resolve('results/contracts'), logLevel: 'error' });
    pact.given('a booking exists', { paid })
      .uponReceiving(`a booking with depositpaid=${paid}`)
      .withRequest({ method: 'GET', path: fromProviderState('/booking/${bookingId}', '/booking/123'), headers: { Accept: 'application/json' } })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: {
        firstname: string('Pact'), lastname: string('Guest'), totalprice: integer(120),
        depositpaid: paid, bookingdates: dates,
      } });
    await pact.executeTest(async (server) => {
      assert.deepEqual(await bookingSummary(server.url, 123), {
        guest: 'Pact Guest', total: 120, paid, ...dates,
      });
    });
    report.consumer.push({ scenario: `depositpaid=${paid}`, status: 'passed' });
    save();
  });
}

test('consumer: maps an absent booking to null', async () => {
  const pact = new PactV3({ consumer: 'booking-summary', provider: 'restful-booker', dir: resolve('results/contracts'), logLevel: 'error' });
  pact.given('a booking was deleted')
    .uponReceiving('a deleted booking')
    .withRequest({ method: 'GET', path: fromProviderState('/booking/${bookingId}', '/booking/123'), headers: { Accept: 'application/json' } })
    .willRespondWith({ status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Not Found' });
  await pact.executeTest(async (server) => assert.equal(await bookingSummary(server.url, 123), null));
  report.consumer.push({ scenario: 'deleted booking', status: 'passed' });
  save();
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
}

async function verify(pactFile, label) {
  const auth = await request('/auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.BOOKER_USERNAME, password: process.env.BOOKER_PASSWORD }),
  });
  assert.equal(auth.status, 200, 'Demo authentication failed');
  const { token } = await auth.json();
  assert.ok(typeof token === 'string' && token.length > 0, 'Demo authentication did not return a token');
  const owned = new Set();
  async function remove(id) {
    assert.ok(owned.has(id), 'Refusing to remove an unowned booking');
    const response = await request(`/booking/${id}`, { method: 'DELETE', headers: { Cookie: `token=${token}` } });
    assert.ok([201, 405].includes(response.status), `Cleanup DELETE returned ${response.status}`);
    const gone = await request(`/booking/${id}`);
    assert.equal(gone.status, 404, 'Cleanup left a booking behind');
    owned.delete(id);
    report.cleanup.push({ bookingId: id, getStatus: gone.status });
    save();
  }
  async function create(paid) {
    const body = { ...example, lastname: `Pact-${randomUUID()}`, depositpaid: paid };
    const response = await request('/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, 'Provider state creation failed');
    const { bookingid, booking } = await response.json();
    assert.ok(Number.isInteger(bookingid) && bookingid > 0, 'Provider returned an invalid booking id');
    owned.add(bookingid);
    assert.deepEqual(booking, body, 'Created booking differs from provider state');
    return { bookingId: bookingid };
  }
  let failure;
  try {
    const result = await new Verifier({ providerBaseUrl: baseUrl, pactUrls: [pactFile], logLevel: 'error',
      stateHandlers: {
        'a booking exists': ({ paid }) => create(paid),
        'a booking was deleted': async () => {
          const state = await create(false);
          await remove(state.bookingId);
          return state;
        },
      },
      afterEach: async () => { for (const id of [...owned]) await remove(id); },
    }).verifyProvider();
    report.provider.push({ scenario: label, status: 'matched', result: JSON.parse(result) });
  } catch (error) {
    failure = error;
    let result;
    try { result = JSON.parse(error.message); } catch { result = { setupError: error.message }; }
    report.provider.push({ scenario: label, status: 'rejected', result });
  } finally {
    const cleanupFailures = [];
    for (const id of [...owned]) {
      try { await remove(id); } catch (error) { cleanupFailures.push(error); }
    }
    save();
    if (cleanupFailures.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupFailures], 'Provider verification/cleanup failed');
  }
  if (failure) throw failure;
}

test('provider: verifies all three consumer interactions against the hosted API', { timeout: 120000 }, async () => {
  const contract = JSON.parse(readFileSync(contractFile, 'utf8'));
  assert.equal(contract.interactions.length, 3, 'Consumer contract is incomplete');
  await verify(contractFile, 'three consumer interactions');
});

test('sensitivity: rejects totalprice changed from number to string', { timeout: 60000 }, async () => {
  const contract = JSON.parse(readFileSync(contractFile, 'utf8'));
  contract.interactions = [contract.interactions.find(i => i.description === 'a booking with depositpaid=true')];
  contract.interactions[0].response.body.totalprice = '120';
  contract.interactions[0].response.matchingRules.body['$.totalprice'] = { matchers: [{ match: 'type' }], combine: 'AND' };
  const incompatible = resolve('results/incompatible-contract.json');
  writeFileSync(incompatible, JSON.stringify(contract, null, 2));
  await assert.rejects(verify(incompatible, 'incompatible totalprice type'), error => {
    const result = JSON.parse(error.message);
    assert.equal(result.errors.length, 1);
    const mismatches = result.errors[0].mismatch.mismatches;
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].path, '$.totalprice');
    assert.match(mismatches[0].mismatch, /Integer.*String/);
    return true;
  });
});
