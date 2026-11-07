import importlib.util
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location('asset_checker', Path(__file__).resolve().parents[1] / 'scripts/check_local_assets.py')
checker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = checker
spec.loader.exec_module(checker)


class LocalAssets(unittest.TestCase):
    def check(self, files):
        return checker.find_issues(files, lambda p: files[p])

    def test_valid_relative_root_and_encoded_paths(self):
        self.assertEqual(self.check({'pages/a.html': '<img src="../images/Team%20Photo.JPG"><a href="/event/?v=1#photos">Event</a>', 'images/Team Photo.JPG': '', 'event/index.html': ''}), set())

    def test_missing_asset(self):
        self.assertEqual(len(self.check({'index.html': '<img src="missing.jpg">'})), 1)

    def test_wrong_case(self):
        issue, = self.check({'index.html': '<img src="photo.jpg">', 'Photo.JPG': ''})
        self.assertEqual(issue.case_match, 'Photo.JPG')

    def test_css_import_and_url(self):
        self.assertEqual(self.check({'assets/main.css': '@import url(fonts.css); body { background: url(../images/a.png); }', 'assets/fonts.css': '', 'images/a.png': ''}), set())

    def test_quoted_css_filename_with_spaces(self):
        self.assertEqual(self.check({'main.css': "body { background:url('images/Team Photo.jpg'); }", 'images/Team Photo.jpg': ''}), set())
        issue, = self.check({'main.css': "body { background:url('images/Missing Photo.jpg'); }"})
        self.assertEqual(issue.target, 'images/Missing Photo.jpg')

    def test_external_fragment_data_and_runtime_urls_ignored(self):
        self.assertEqual(self.check({'index.html': '<a href="#top">Top</a><img src="https://other.example/a"><img src="data:image/png;base64,AAA"><img src="${dynamic}">'}), set())

    def test_inline_css_and_module_import(self):
        issues = self.check({'index.html': '<style>body{background:url(missing.png)}</style>', 'app.js': "import './missing.js';\nimport thing from 'package';"})
        self.assertEqual({i.target for i in issues}, {'missing.png', 'missing.js'})

    def test_commented_import_example_ignored(self):
        self.assertEqual(self.check({'app.js': "// import log from './missing.js';"}), set())

    def test_removed_file_is_new_error_and_existing_error_is_not(self):
        old = {'index.html': '<img src="old-missing.jpg"><img src="keep.png">', 'keep.png': ''}
        baseline = self.check(old)
        current = self.check({'index.html': old['index.html']})
        self.assertEqual({i.target for i in current - baseline}, {'keep.png'})


if __name__ == '__main__':
    unittest.main()
