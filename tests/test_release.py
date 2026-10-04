import json,re
from pathlib import Path
D=json.loads(Path('data/official-schedules.json').read_text())
assert D['schemaVersion']==10
for c in range(1,7):
 x=D['courses'][str(c)]; assert x['groups']; assert x['streams']
 assert set(sum(x['streams'].values(),[]))==set(x['groups'])
print('release data skeleton: PASS')
