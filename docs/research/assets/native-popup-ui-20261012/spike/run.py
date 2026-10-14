#!/usr/bin/env python3
"""Runs the WebKit lockdown spike across a defence matrix and tallies requests that reached a bait HTTP server."""
import http.server, socketserver, threading, subprocess, json, sys, time, os, re, tempfile

# Sources (HTML baits) live next to this file; the compiled binary, snapshots and summary.json live in SPIKE_OUT
# (a temp dir by default) so running the spike never writes into the repository.
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('SPIKE_OUT') or tempfile.mkdtemp(prefix='native-ui-spike-')
hits = []
lock = threading.Lock()

class Handler(http.server.BaseHTTPRequestHandler):
    def _any(self):
        with lock:
            hits.append(self.path.split('?')[0])
        body = b'<html><body>bait-server-ok</body></html>' if self.path.endswith('click-through') or self.path.endswith('meta-refresh') else b'ok'
        self.send_response(200)
        self.send_header('Content-Type', 'text/html' if body.startswith(b'<html') else 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
    do_GET = do_POST = do_HEAD = _any
    def log_message(self, *args):
        pass

server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

BAITS = ['/script-fetch', '/onerror-fetch', '/remote-image.png', '/remote.css', '/iframe', '/css-background.png', '/import.css', '/click-through', '/meta-refresh']

def webkit_rss():
    out = subprocess.run(['ps', '-axo', 'pid=,rss=,command='], capture_output=True, text=True).stdout
    rows = {}
    for line in out.splitlines():
        m = re.match(r'\s*(\d+)\s+(\d+)\s+(.*)', line)
        if m and ('com.apple.WebKit' in m.group(3)):
            rows[int(m.group(1))] = int(m.group(2))
    return rows

def one(label, html, flags, shot=None):
    with lock:
        hits.clear()
    before = webkit_rss()
    png = os.path.join(OUT, f'snap-{label}.png')
    cmd = [os.path.join(OUT, 'spike'), f'--port={port}', f'--html={os.path.join(HERE, html)}', f'--png={png}', f'--label={label}'] + flags
    started = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    result = None
    mem = None
    window = None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith('WINDOW '):
            window = line.split()[1]
            after = webkit_rss()
            new = {pid: rss for pid, rss in after.items() if pid not in before}
            host = subprocess.run(['ps', '-o', 'rss=', '-p', str(proc.pid)], capture_output=True, text=True).stdout.strip()
            mem = {'hostRssMB': round(int(host or 0) / 1024, 1), 'newWebKitProcs': len(new), 'newWebKitRssMB': round(sum(new.values()) / 1024, 1)}
            if shot:
                time.sleep(0.4)
                cap = subprocess.run(['screencapture', '-x', '-o', f'-l{window}', os.path.join(OUT, shot)], capture_output=True, text=True)
                mem['screencapture'] = cap.returncode if not cap.stderr else cap.stderr.strip()[:120]
        elif line.startswith('RESULT '):
            result = json.loads(line[len('RESULT '):])
    proc.wait(timeout=30)
    err = proc.stderr.read().strip()
    time.sleep(0.4)
    with lock:
        got = list(hits)
    text = open(os.path.join(HERE, html), encoding='utf-8').read()
    baits = list(dict.fromkeys(re.findall(r'__PORT__(/[A-Za-z0-9._-]+)', text)))
    if 'rel.png' in text:
        baits.append('/v-base/rel.png')
    reached = [b for b in baits if b in got]
    unexpected = [h for h in got if h not in baits and h != '/']
    return {'unexpected': unexpected, 'baitCount': len(baits), 'label': label, 'exit': proc.returncode, 'wallMs': round((time.time() - started) * 1000), 'reached': reached, 'allHits': got, 'mem': mem, 'result': result, 'stderr': err[:300]}

WIDE = [
    ('W-B-rules-vetting', 'bait-wide.html', []),
    ('W-C-vetting-only', 'bait-wide.html', ['--no-rules']),
    ('W-G-js-off-only', 'bait-wide.html', ['--no-rules', '--allow-nav']),
    ('W-F-open-js-on', 'bait-wide.html', ['--js', '--no-rules', '--allow-nav']),
]
MATRIX = [
    ('A-full-defence', 'sample-card.html', []),                         # JS off + content rules + nav vetting + CSP meta
    ('B-no-csp', 'sample-card-nocsp.html', []),                         # JS off + content rules + nav vetting
    ('C-no-csp-no-rules', 'sample-card-nocsp.html', ['--no-rules']),    # JS off + nav vetting only
    ('D-csp-only', 'sample-card.html', ['--no-rules', '--allow-nav']),  # JS off + CSP only
    ('E-js-on-rules', 'sample-card-nocsp.html', ['--js']),              # JS on + content rules + nav vetting
    ('F-nothing', 'sample-card-nocsp.html', ['--js', '--no-rules', '--allow-nav']),  # baseline: everything open
    ('G-js-off-nothing-else', 'sample-card-nocsp.html', ['--no-rules', '--allow-nav']),  # JS off only
]

if __name__ == '__main__':
    only = sys.argv[1:]
    summary = []
    for label, html, flags in (MATRIX + WIDE):
        if only and label not in only:
            continue
        row = one(label, html, flags, shot=f'screen-{label}.png' if label in ('A-full-defence', 'F-nothing') else None)
        summary.append(row)
        r = row['result'] or {}
        log = r.get('log', [])
        script = next((l for l in log if l.startswith('scriptRan=')), 'scriptRan=?')
        actions = [l for l in log if l.startswith('ACTION')]
        print(json.dumps({'label': label, 'exit': row['exit'], 'baitCount': row['baitCount'], 'reached': row['reached'], 'unexpected': row['unexpected'], 'script': script, 'actions': actions, 'marks': r.get('marks'), 'mem': row['mem'], 'wallMs': row['wallMs'], 'stderr': row['stderr']}, ensure_ascii=False), flush=True)
    json.dump(summary, open(os.path.join(OUT, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'output dir: {OUT}')
    server.shutdown()
