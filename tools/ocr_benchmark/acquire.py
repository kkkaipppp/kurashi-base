#!/usr/bin/env python3
"""Acquire 1000 CORD and 1000 MIT-tagged synthetic receipts; NO OCR is run here."""
import argparse, hashlib, json, random
from datetime import datetime, timezone
from pathlib import Path

def checksum(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda: f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def save_img(row,path):
    from PIL import Image
    from io import BytesIO
    im=row['image']
    if isinstance(im,dict):im=Image.open(BytesIO(im['bytes'])) if im.get('bytes') else Image.open(im['path'])
    path.parent.mkdir(parents=True,exist_ok=True)
    im.convert('RGB').save(path,format='PNG')

def fetch(target):
    from datasets import load_dataset
    target.mkdir(parents=True,exist_ok=True)
    out=[]
    ds=load_dataset('naver-clova-ix/cord-v2')
    for split in ['train','validation','test']:
        for i,row in enumerate(ds[split]):
            path=target/'cord'/f'{split}_{i:04d}.png'
            if not path.exists():save_img(row,path)
            gt=row.get('ground_truth')
            out.append(dict(source='naver-clova-ix/cord-v2',split=split,index=i,path=str(path.relative_to(target)),sha256=checksum(path),license='CC-BY-4.0',gt_available=bool(gt),ground_truth=gt,role='accuracy_with_gt'))
    nano=load_dataset('34data/nano-receipts',split='train')
    ids=list(range(len(nano)));random.Random(20261122).shuffle(ids)
    if len(ids)<1000:raise RuntimeError('Not enough images in nano-receipts')
    for i in ids[:1000]:
        path=target/'nano'/f'{i:05d}.png'
        if not path.exists():save_img(nano[i],path)
        out.append(dict(source='34data/nano-receipts',split='train',index=i,path=str(path.relative_to(target)),sha256=checksum(path),license='MIT (verify upstream)',gt_available=False,ground_truth=None,role='robustness_only'))
    if len(out)!=2000:raise RuntimeError(f'Expected 2000; got {len(out)}')
    if len({r['sha256'] for r in out})!=2000:raise RuntimeError('Duplicate images detected; do not mark complete')
    manifest=dict(createdAt=datetime.now(timezone.utc).isoformat(),seed=20261122,count=len(out),sources={'naver-clova-ix/cord-v2':'https://huggingface.co/datasets/naver-clova-ix/cord-v2','34data/nano-receipts':'https://huggingface.co/datasets/34data/nano-receipts'},commercialReviewRequired=True,rows=out)
    (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Downloaded',len(out),'images. OCR NOT RUN. Commercial use must be independently reviewed.')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--target',default='.ocr-eval-data');ap.add_argument('--licenses-reviewed',action='store_true');args=ap.parse_args()
    if not args.licenses_reviewed:ap.error('Review dataset terms/permissions, then add --licenses-reviewed')
    fetch(Path(args.target))
