import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from validate_manifest import check

class ManifestTests(unittest.TestCase):
 def sample(self):
  a=[dict(source='naver-clova-ix/cord-v2',split='train',index=i,path=f'cord/{i}.png',sha256=str(i).zfill(64),license='CC-BY-4.0',gt_available=True,role='accuracy_with_gt') for i in range(1000)]
  b=[dict(source='34data/nano-receipts',split='train',index=i,path=f'nano/{i}.png',sha256=str(i+1000).zfill(64),license='MIT',gt_available=False,role='robustness_only') for i in range(1000)]
  return dict(rows=a+b)
 def test_ok(self):self.assertEqual(check(self.sample(),Path('.'),False),[])
 def test_duplicate_hash_fails(self):
  m=self.sample();m['rows'][1000]['sha256']=m['rows'][0]['sha256'];self.assertTrue(any('duplicate SHA' in x for x in check(m,Path('.'),False)))
 def test_missing_sample_fails(self):
  m=self.sample();m['rows'].pop();self.assertTrue(any('2000' in x for x in check(m,Path('.'),False)))
 def test_unlabeled_accuracy_fails(self):
  m=self.sample();m['rows'][0]['gt_available']=False;self.assertTrue(any('GT missing' in x for x in check(m,Path('.'),False)))
 def test_missing_license_fails(self):
  m=self.sample();m['rows'][0]['license']='';self.assertTrue(any('license missing' in x for x in check(m,Path('.'),False)))

if __name__=='__main__':unittest.main()
