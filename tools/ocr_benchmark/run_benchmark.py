#!/usr/bin/env python3
"""Runs actual OCR adapter across frozen 2000 images. Accuracy requires separately verified field labels."""
import argparse,importlib.util,json,time
from pathlib import Path
from validate_manifest import check

def load_adapter(path):
    spec=importlib.util.spec_from_file_location('ocr_external_adapter',path)
    if spec is None or spec.loader is None:raise RuntimeError('OCR adapter not found')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    func=getattr(mod,'recognize_receipt',None)
    if not callable(func):raise RuntimeError('Adapter must provide recognize_receipt(image_path) -> dict')
    return func

def run(root,adapter,report):
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    errors=check(manifest,root)
    if errors:raise RuntimeError('Invalid dataset manifest: '+'; '.join(errors[:5]))
    fn=load_adapter(adapter);res=[]
    for n,row in enumerate(manifest['rows']):
        t=time.perf_counter();msg=None;payload=None
        try:
            payload=fn(str(root/row['path']))
            if not isinstance(payload,dict):raise ValueError('Adapter must return dict')
        except Exception as e:msg=str(e)
        res.append(dict(source=row['source'],index=row['index'],latencyMs=round((time.perf_counter()-t)*1000,2),ok=msg is None,error=msg,result=payload,gtPresent=row['gt_available']))
        if (n+1)%100==0:print('Finished',n+1,'of',len(manifest['rows']),flush=True)
    output=dict(expected=2000,processed=len(res),failed=sum(not r['ok'] for r in res),accuracyStatus='NOT_SCORED: ground truth normalizer not implemented; GT-free samples excluded',results=res)
    report.parent.mkdir(parents=True,exist_ok=True);report.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Processed',output['processed'],'failed',output['failed'],'accuracy',output['accuracyStatus'])
    if output['failed']>0:raise SystemExit(1)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--target',default='.ocr-eval-data');ap.add_argument('--adapter',required=True);ap.add_argument('--report',default='.ocr-eval-data/report.json');a=ap.parse_args()
    run(Path(a.target),a.adapter,Path(a.report))
