#!/usr/bin/env python3
"""Extract verified AM1 embedded originals locally. No network or DB writes.
Requires pypdf. Usage: python am1-extract-archive.py archive.pdf output-directory
"""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader


def extract(pdf, destination):
    reader = PdfReader(str(pdf))
    tree = reader.trailer['/Root']['/Names']['/EmbeddedFiles']['/Names']
    streams = {}
    for i in range(0, len(tree), 2):
        name = str(tree[i])
        if name in streams:
            raise ValueError('Duplicate embedded file name')
        streams[name] = tree[i+1].get_object()['/EF']['/F'].get_object()
    names = sorted(k for k in streams if k.endswith('.json'))
    if not names or len(names) != len(reader.pages):
        raise ValueError('Incomplete archive: page / metadata count mismatch')
    output = Path(destination).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Choose an empty output directory; existing files are never replaced')
    expected_id = None
    plan = []
    targets = set()
    for ordinal, name in enumerate(names, 1):
        metadata = json.loads(streams[name].get_data())
        if metadata.get('format') != 'PETATOE-AM1' or metadata.get('ordinal') != ordinal or metadata.get('totalImages') != len(names):
            raise ValueError('Invalid archive metadata')
        expected_id = expected_id or metadata['archiveId']
        if metadata['archiveId'] != expected_id:
            raise ValueError('Mixed archives')
        original = streams[name[:-5]+'.original'].get_data()
        if hashlib.sha256(original).hexdigest() != metadata['originalSha256']:
            raise ValueError('Original image checksum mismatch')
        bucket, path = metadata['bucket'], metadata['path']
        if not bucket or bucket in ('.', '..') or any(c in bucket for c in '/\\\x00') or '\\' in path or '\x00' in path:
            raise ValueError('Unsafe storage path')
        target = (output / bucket / path).resolve()
        if not target.is_relative_to(output / bucket) or target == (output / bucket) or target in targets:
            raise ValueError('Unsafe or duplicate storage path')
        targets.add(target)
        plan.append((target, original, metadata))
    # Validate every entry before writing any extracted image.
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for target, original, metadata in plan:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(original)
        manifest.append(metadata)
    manifest_path = output / 'PETATOE-AM1-RESTORE-MANIFEST.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'archiveId': expected_id, 'originals': len(plan), 'verified': True, 'networkWrites': 0}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(extract(args.pdf, args.destination), ensure_ascii=False))
