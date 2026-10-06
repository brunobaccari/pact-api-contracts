# Pact — booking contracts

[Versão em português](README.md)

The client builds a booking summary: guest, price, payment and dates. This project verifies the contract consumed by that client against the hosted [Restful Booker API](https://restful-booker.herokuapp.com/apidoc/index.html).

## Run

Node.js 24 and Python 3 for the CI gate.

```bash
npm ci
cp .env.example .env
npm test
python -m unittest discover -s scripts -p test_summary.py
```

On PowerShell, use `Copy-Item .env.example .env`. Process environment variables take precedence. Example credentials are public demo credentials documented by the service. Do not use real accounts or personal data.

## Contract flow

1. `src/booking-client.js` makes an HTTP request and transforms the response used by the consumer.
2. Consumer tests run this code against Pact's native mock server and generate three interactions in `results/contracts/`.
3. The `Verifier` reads that same file and sends real requests to the hosted provider. State handlers create unique bookings; `fromProviderState` injects the returned ID into the URL. No response body is modified to satisfy the contract.
4. Cleanup deletes only IDs created by this run and confirms GET 404. The missing state creates and deletes an owned booking rather than guessing an unused ID.

The local server is Pact's native **consumer** virtualization. The Verifier's internal proxy forwards requests to the HTTPS service; there is no local application replacing the provider.

## Scenarios and decisions

| Scenario | What blocks the run |
| --- | --- |
| Deposit paid | Boolean other than `true`, non-integer price, non-string names or different dates |
| Deposit pending | Boolean other than `false`; remaining fields are still required |
| Deleted booking | Status other than 404 or body other than `Not Found`; client must return `null` |
| Contract sensitivity | A copy expecting a string `totalprice` must be rejected specifically at `$.totalprice` |

Names vary between runs and use type matching. Booleans and dates have exact values because they define the prepared states. Extra provider properties do not break the consumer; whole-JSON equality is not the contract.

## Case: from requirement to rejection

- **Example rule:** the [consumer](src/booking-client.js) uses an integer price, deposit status and dates; an absent booking returns `null`.
- **Strategy:** partition paid/pending deposits and deleted bookings. Verify those states at the HTTP boundary without depending on a graphical interface.
- **Controlled failure:** the [sensitivity test](tests/contracts.test.js) changes only the `totalprice` expectation to a string. The provider still returns an integer; Pact must identify exactly `$.totalprice`. This is a deliberately introduced incompatibility, not a defect found in the service.
- **Evidence:** the [October 6, 2026 run](https://github.com/brunobaccari/pact-api-contracts/actions/runs/37511425649) passed all five tests, detected that mismatch and confirmed GET 404 for all four created bookings. See the summary and `pact-results` artifact (14 days).
- **Decision:** an actual contract mismatch, skipped test or incomplete cleanup blocks CI. Network errors do not prove incompatibility: investigate the environment before rerunning. A real mismatch requires agreement between consumer and provider before changing the expectation.
- **Remaining review:** check pricing rules and UI behavior in the integrated product. This example verifies compatibility; it does not authorize provider deployment.

## Results

[Actions](https://github.com/brunobaccari/pact-api-contracts/actions) publishes a per-test summary and a **pact-results** artifact retained for 14 days:

- `junit.xml`: five tests, including verification of all three interactions and the sensitivity check.
- `contracts/booking-summary-restful-booker.json`: consumer-generated contract.
- `incompatible-contract.json`: controlled change for the negative verification.
- `verification.json`: native Pact results and owned IDs with cleanup confirmation.
- `summary.md`: outcome and execution limits.

Failures, skips, missing/invalid reports, incomplete contracts and unconfirmed cleanup block CI. Outputs are uploaded even on failure and never committed. `scripts/test_summary.py` checks rejection of missing, invalid, empty, failing, skipped and incomplete reports.

## Limits

This is a shared public API: other users or a service reset can delete our records. Unique names do not provide database isolation. External outages fail the run and require investigation; there are no retries until green.

We do not control the provider's code or deployed version. This is a sample consumer and compatibility verification of the currently available API. There is no Pact Broker, contract publication, version matrix or `can-i-deploy`, so this is not a deployment gate between two teams. That would require both projects to participate in the publication and verification workflow.

References: [matching and provider-state generators](https://docs.pact.io/implementation_guides/javascript/docs/matching), [verification and state handlers](https://docs.pact.io/implementation_guides/javascript/docs/provider) and [API](https://restful-booker.herokuapp.com/apidoc/index.html).
