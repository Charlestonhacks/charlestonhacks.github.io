#!/usr/bin/env python3
"""Check local HTML/CSS asset paths and static module imports without network requests."""
import argparse
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
import posixpath
import re
import subprocess
import sys
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True, order=True)
class Issue:
    source: str
    kind: str
    target: str
    case_match: str = ''

    def __str__(self):
        suffix = f' (case-sensitive path; did you mean {self.case_match}?)' if self.case_match else ''
        return f'{self.source}: {self.kind} → missing {self.target}{suffix}'


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
        self.styles = []
        self.in_style = False
        self.base = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'base':
            self.base = attrs.get('href')
            return
        self.in_style = tag == 'style' or self.in_style
        for key in ('src', 'href', 'poster', 'data-src'):
            if attrs.get(key):
                self.refs.append((f'{tag}[{key}]', attrs[key]))
        for candidate in attrs.get('srcset', '').split(','):
            candidate = re.sub(r'\s+\d+(?:\.\d+)?[wx]\s*$', '', candidate.strip())
            if candidate:
                self.refs.append((f'{tag}[srcset]', candidate))
        if attrs.get('style'):
            self.styles.append(attrs['style'])

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, text):
        if self.in_style:
            self.styles.append(text)


def css_references(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    pattern = r"url\(\s*(?:'([^']*)'|\"([^\"]*)\"|([^\s)]+))\s*\)|@import\s+['\"]([^'\"]+)['\"]"
    for match in re.finditer(pattern, text, re.I):
        yield ('CSS URL/import', next(value for value in match.groups() if value is not None))



def find_issues(paths, read):
    paths = set(paths)
    folded = {}
    for path in sorted(paths):
        folded.setdefault(path.casefold(), path)
    issues = set()
    for source in sorted(paths):
        suffix = Path(source).suffix.lower()
        if suffix not in ('.html', '.css', '.js', '.mjs'):
            continue
        text = read(source)
        base = f'https://repository.invalid/{source}'
        if suffix == '.html':
            parser = References()
            parser.feed(text)
            refs = parser.refs + list(css_references('\n'.join(parser.styles)))
            if parser.base:
                base = urljoin(base, parser.base)
        elif suffix == '.css':
            refs = list(css_references(text))
        else:
            # Only static relative/root imports, not npm names or runtime-built URLs.
            refs = [('module import', m[1]) for m in re.finditer(r'^\s*(?:import\s+(?:[^;\'"]*?\bfrom\s*)?|export\s+[^;\'"]*?\bfrom\s*)[\'"]([./][^\'"]+)[\'"]', text, re.M)]
        for kind, raw in refs:
            raw = raw.strip()
            if not raw or raw.startswith(('#', 'data:')) or any(marker in raw for marker in ('${', '{{', '<%')):
                continue
            url = urlsplit(urljoin(base, raw))
            if url.scheme not in ('http', 'https') or url.netloc != 'repository.invalid':
                continue
            target = posixpath.normpath(unquote(url.path).lstrip('/'))
            if target == '.':
                target = 'index.html'
            elif url.path.endswith('/') or target not in paths and not Path(target).suffix:
                target = target.rstrip('/') + '/index.html'
            if target not in paths:
                issues.add(Issue(source, kind, target, folded.get(target.casefold(), '')))
    return issues


def snapshot(ref=None):
    if ref:
        sha = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--verify', f'{ref}^{{commit}}'], text=True).strip()
        paths = subprocess.check_output(['git', '-C', str(ROOT), 'ls-tree', '-r', '-z', '--name-only', sha]).decode().rstrip('\0').split('\0')
        def read(path):
            return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{sha}:{path}']).decode(errors='replace')
    else:
        paths = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode().rstrip('\0').split('\0')
        paths = [p for p in paths if (ROOT / p).is_file()]
        def read(path):
            return (ROOT / path).read_text(errors='replace')
    return find_issues(paths, read)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-ref', help='Fail only on new unresolved paths relative to this Git commit')
    args = parser.parse_args()
    current = snapshot()
    baseline = snapshot(args.base_ref) if args.base_ref else set()
    new = current - baseline
    if args.base_ref:
        print(f'Existing unresolved paths: {len(current & baseline)}; fixed: {len(baseline - current)}; new: {len(new)}.')
    if new:
        print('\n'.join(str(issue) for issue in sorted(new)), file=sys.stderr)
        return 1
    print('Local asset paths OK' + (' (no new regressions).' if args.base_ref else '.'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
