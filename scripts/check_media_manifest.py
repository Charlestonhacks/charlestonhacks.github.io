#!/usr/bin/env python3
"""Check tracked media inventory; optionally refresh only existing byte-size fields."""
import argparse
import csv
import io
from pathlib import Path
import subprocess
import sys

# Fonts and base64 source copies are not media entries. Extend this explicit list
# when introducing another format; file extensions alone cannot establish usage.
MEDIA_EXTENSIONS = frozenset('png jpg jpeg webp gif avif svg ico bmp tif tiff heic heif mp3 wav ogg oga flac aac m4a mp4 mov webm m4v avi pdf'.split())
MANIFEST = Path('docs/reference/media-manifest.csv')


def inspect(root, rows, tracked):
    errors = []
    by_path = {}
    for row in rows:
        path = row['file']
        if path in by_path:
            errors.append(f'Duplicate entry: {path}')
        by_path[path] = row
        local = root / path
        if Path(path).is_absolute() or '..' in Path(path).parts:
            errors.append(f'Invalid path: {path}')
        elif path not in tracked or not local.is_file():
            errors.append(f'Missing or untracked file: {path}')
        else:
            try:
                size = int(row['size_bytes'])
            except ValueError:
                errors.append(f'Invalid size: {path}')
                continue
            if size != local.stat().st_size:
                errors.append(f'Incorrect size: {path}: recorded {size}, actual {local.stat().st_size}')
    media = {p for p in tracked if Path(p).suffix.lower().lstrip('.') in MEDIA_EXTENSIONS}
    errors.extend(f'Unlisted media: {p}' for p in sorted(media - by_path.keys()))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh-sizes', action='store_true', help='Update byte sizes only; never add, remove, or classify entries')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    tracked = set(subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().rstrip('\0').split('\0'))
    manifest = root / MANIFEST
    with manifest.open(newline='') as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fields = reader.fieldnames
    if not fields or not {'file', 'size_bytes'} <= set(fields):
        parser.error('Manifest must contain file and size_bytes columns')
    errors = inspect(root, rows, tracked)
    if args.refresh_sizes:
        blockers = [e for e in errors if not e.startswith('Incorrect size:')]
        if blockers:
            print('\n'.join(blockers), file=sys.stderr)
            return 1
        for row in rows:
            row['size_bytes'] = str((root / row['file']).stat().st_size)
        output = io.StringIO(newline='')
        writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(rows)
        manifest.write_bytes(output.getvalue().encode())
        errors = inspect(root, rows, tracked)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print(f'Media manifest OK: {len(rows)} entries; tracked coverage, paths, and byte sizes checked.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
