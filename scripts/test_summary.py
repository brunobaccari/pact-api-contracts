import json
from pathlib import Path
import tempfile
import unittest
from summary import build


class SummaryTest(unittest.TestCase):
    def test_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            self.assertFalse(build(folder, 'success')[1])
            (folder / 'junit.xml').write_text('<bad')
            self.assertFalse(build(folder, 'success')[1])
            report = {'consumer': [{}, {}, {}], 'provider': [{'status': 'matched'}, {'status': 'rejected'}], 'cleanup': [{'getStatus': 404}] * 4}
            (folder / 'verification.json').write_text(json.dumps(report))
            for content, expected in [('', False), ('<testcase />' * 5, True), ('<testcase><failure /></testcase>' * 5, False), ('<testcase><skipped /></testcase>' * 5, False)]:
                with self.subTest(content=content):
                    (folder / 'junit.xml').write_text(f'<testsuite>{content}</testsuite>')
                    self.assertEqual(build(folder, 'success')[1], expected)
                    self.assertFalse(build(folder, 'failure')[1])
            (folder / 'junit.xml').write_text('<testsuite>' + '<testcase />' * 5 + '</testsuite>')
            report['cleanup'].pop()
            (folder / 'verification.json').write_text(json.dumps(report))
            self.assertFalse(build(folder, 'success')[1])
            (folder / 'verification.json').write_text('null')
            self.assertFalse(build(folder, 'success')[1])
