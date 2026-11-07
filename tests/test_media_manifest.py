"""Failure cases for the inventory checker, using disposable media fixtures."""
import contextlib
import csv
import io
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('media_checker', Path(__file__).resolve().parents[1] / 'scripts/check_media_manifest.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ManifestChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'photo.jpg').write_bytes(b'fixture')
        self.row = {'file': 'photo.jpg', 'size_bytes': '7', 'event': 'Keep this association'}

    def test_valid_record_is_not_mutated(self):
        original = dict(self.row)
        self.assertEqual(checker.inspect(self.root, [self.row], {'photo.jpg'}), [])
        self.assertEqual(self.row, original)

    def test_missing_file(self):
        (self.root / 'photo.jpg').unlink()
        self.assertTrue(any('Missing' in error for error in checker.inspect(self.root, [self.row], {'photo.jpg'})))

    def test_size_mismatch(self):
        self.row['size_bytes'] = '1'
        self.assertTrue(any('Incorrect size' in error for error in checker.inspect(self.root, [self.row], {'photo.jpg'})))

    def test_duplicates(self):
        self.assertTrue(any('Duplicate' in error for error in checker.inspect(self.root, [self.row, self.row], {'photo.jpg'})))

    def test_unlisted_audio(self):
        self.assertIn('Unlisted media: track.m4a', checker.inspect(self.root, [self.row], {'photo.jpg', 'track.m4a'}))

    def test_unsafe_path(self):
        self.assertIn('Invalid path: ../outside.jpg', checker.inspect(self.root, [{'file': '../outside.jpg', 'size_bytes': '0'}], set()))

    def test_refresh_changes_only_sizes_and_keeps_order(self):
        manifest = self.root / checker.MANIFEST
        manifest.parent.mkdir(parents=True)
        fields = ['file', 'size_bytes', 'event', 'confidence', 'evidence']
        row = dict(self.row, size_bytes='1', confidence='High', evidence='Reviewed event association')
        with manifest.open('w', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerow(row)
        with patch.object(checker, '__file__', str(self.root / 'scripts/check_media_manifest.py')), \
             patch.object(checker.subprocess, 'check_output', return_value=b'photo.jpg\0'), \
             patch('sys.argv', ['check_media_manifest.py', '--refresh-sizes']), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(checker.main(), 0)
        with manifest.open(newline='') as handle:
            updated = list(csv.DictReader(handle))
        self.assertEqual(updated, [dict(row, size_bytes='7')])


if __name__ == '__main__':
    unittest.main()
