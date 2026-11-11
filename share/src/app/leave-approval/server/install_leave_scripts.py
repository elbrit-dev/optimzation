"""Install the leave scripts on an ERP, each with resolver.py prepended.
   ERP_URL=https://erp-uat.elbrit.org ERP_TOKEN=key:secret python3 -I install_leave_scripts.py [--write]
   Without --write: build + compile check only. Production needs CONFIRM_PROD=yes."""
import json, os, sys, urllib.request, urllib.parse
here = os.path.dirname(os.path.abspath(__file__))
URL, TOK = os.environ['ERP_URL'].rstrip('/'), os.environ['ERP_TOKEN']
write = '--write' in sys.argv
if write and 'erp.elbrit.org' in URL and os.environ.get('CONFIRM_PROD') != 'yes': sys.exit('production: set CONFIRM_PROD=yes')
resolver = open(os.path.join(here, 'resolver.py')).read()
SCRIPTS = [
  {'name': 'Elbrit Leave Route Guard', 'file': 'leave_route_guard.py', 'script_type': 'DocType Event', 'reference_doctype': 'Leave Application', 'doctype_event': 'Before Validate'},
  {'name': 'Elbrit Leave Decide', 'file': 'elbrit_leave_decide.py', 'script_type': 'API', 'api_method': 'elbrit_leave_decide'},
  {'name': 'Elbrit Leave Approvals', 'file': 'elbrit_leave_approvals.py', 'script_type': 'API', 'api_method': 'elbrit_leave_approvals'},
]
def call(m, path, body=None):
    r = urllib.request.Request(URL + path, method=m, headers={'Authorization': 'token ' + TOK, 'Content-Type': 'application/json'}, data=json.dumps(body).encode() if body else None)
    try: return json.load(urllib.request.urlopen(r))
    except urllib.error.HTTPError as e: return {'error': e.code, 'body': e.read().decode()[:300]}
only = [a for a in sys.argv[1:] if not a.startswith('--')]
for s in SCRIPTS:
    if only and s['name'] not in only: continue
    src = resolver + '\n\n' + open(os.path.join(here, s['file'])).read()
    compile(src, s['name'], 'exec')
    if not write: print('ok (dry)', s['name'], len(src)); continue
    p = '/api/resource/Server%20Script/' + urllib.parse.quote(s['name'])
    cur = call('GET', p)
    if 'data' in cur:
        out = call('PUT', p, {'script': src, 'disabled': 0})
    else:
        body = {'doctype': 'Server Script', 'name': s['name'], 'script': src, 'disabled': 0, 'allow_guest': 0}
        body.update({k: v for k, v in s.items() if k not in ('name', 'file')})
        out = call('POST', '/api/resource/Server%20Script', body)
    print(('installed ' if 'data' in out else 'FAILED ') + s['name'], out.get('data', {}).get('modified', out.get('body', '')))
