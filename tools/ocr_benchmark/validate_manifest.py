#!/usr/bin/env python3
"""Validate manifest and checksums without external libraries."""
import argparse,hashlib,json
from pathlib import Path

def check(m,root,files=True):
    rows=m.get('rows',[]);errs=[];seen=set();images=set()
    if len(rows)!=2000:errs.append(f'Expected 2000 rows, got {len(rows)}')
    sources={}
    for r in rows:
        key=(r.get('source'),r.get('split'),r.get('index'))
        if key in seen:errs.append('duplicate ID '+str(key))
        seen.add(key)
        sources[r.get('source')]=sources.get(r.get('source'),0)+1
        h=r.get('sha256')
        if h in images:errs.append('duplicate SHA '+str(h))
        images.add(h)
        if not r.get('license'):errs.append('license missing '+str(key))
        if r.get('role')=='accuracy_with_gt' and not r.get('gt_available'):errs.append('GT missing '+str(key))
        if files:
            p=root/r['path']
            if not p.is_file():errs.append('file missing '+str(p));continue
            if hashlib.sha256(p.read_bytes()).hexdigest()!=h:errs.append('SHA mismatch '+str(p))
    if sources.get('naver-clova-ix/cord-v2')!=1000:errs.append('CORD count incorrect')
    if sources.get('34data/nano-receipts')!=1000:errs.append('nano count incorrect')
    return errs
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--target',default='.ocr-eval-data');ap.add_argument('--skip-files',action='store_true');a=ap.parse_args();root=Path(a.target)
    m=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    errs=check(m,root,not a.skip_files)
    print(json.dumps({'count':len(m.get('rows',[])),'errors':errs[:30],'passed':not errs},ensure_ascii=False,indent=2))
    if errs:raise SystemExit(1)
