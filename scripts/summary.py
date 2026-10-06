import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET


def build(folder, outcome):
    problem, cases, report = '', [], {}
    try:
        cases = list(ET.parse(folder / 'junit.xml').getroot().iter('testcase'))
        report = json.loads((folder / 'verification.json').read_text(encoding='utf-8'))
        assert len(cases) == 5, 'Expected five test cases.'
        assert len(report['consumer']) == 3, 'Consumer evidence is incomplete.'
        assert [p['status'] for p in report['provider']] == ['matched', 'rejected'], 'Provider verification or sensitivity check is incomplete.'
        assert len(report['cleanup']) == 4 and all(c['getStatus'] == 404 for c in report['cleanup']), 'Cleanup evidence is incomplete.'
    except (OSError, ET.ParseError, ValueError, KeyError, TypeError, AssertionError) as error:
        problem = f'Reports missing, invalid or incomplete: {error}'
        report = {}
    failed = sum(c.find('failure') is not None or c.find('error') is not None for c in cases)
    skipped = sum(c.find('skipped') is not None for c in cases)
    ok = outcome == 'success' and not problem and not failed and not skipped
    lines = [
        '## Pact — booking contract', '',
        f"Result: **{'passed' if ok else 'blocked'}**. Test step: **{outcome}**.", '',
        '| Tests | Passed | Failed/errors | Skipped |', '| --- | --- | --- | --- |',
        f'| {len(cases)} | {len(cases) - failed - skipped} | {failed} | {skipped} |', '',
        problem, '', '| Test | Result |', '| --- | --- |',
    ]
    for case in cases:
        status = 'failed' if case.find('failure') is not None or case.find('error') is not None else 'skipped' if case.find('skipped') is not None else 'passed'
        lines.append(f"| {case.get('name', 'unnamed').replace('|', '/')} | {status} |")
    lines += ['', 'Consumer: native Pact mock server, three interactions. Provider: HTTPS requests to Restful Booker with owned booking states.',
              'Sensitivity: deliberately incompatible `totalprice` type must be rejected at `$.totalprice`; this expected rejection is a passing test, not a provider defect.',
              f"Cleanup: {len(report.get('cleanup', []))} bookings with GET 404 evidence.", '',
              'Download **pact-results** below: JUnit, generated contract, incompatible contract, detailed verification JSON and this summary. Retention: 14 days.',
              'Public shared demo: not a provider deployment gate; no Broker/can-i-deploy evidence.']
    return '\n'.join(lines) + '\n', ok


if __name__ == '__main__':
    folder = Path('results')
    text, ok = build(folder, os.environ.get('TEST_OUTCOME', 'unknown'))
    folder.mkdir(exist_ok=True)
    (folder / 'summary.md').write_text(text, encoding='utf-8')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as output:
            output.write(text)
    print(text)
    raise SystemExit(0 if ok else 1)
