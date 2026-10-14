#!/usr/bin/env python3
"""Renders model-generated card HTML through the locked-down WKWebView spike (JS off, content rules, navigation vetting)
and records content size, which action links resolved, and a real window screenshot. Usage: SPIKE_OUT=<dir> render_generated.py gen-1.html ..."""
import json, os, subprocess, sys, tempfile, time

# The compiled binary (swiftc -O spike.swift -o "$SPIKE_OUT/spike") and all outputs live in SPIKE_OUT.
OUT = os.environ.get('SPIKE_OUT') or tempfile.mkdtemp(prefix='native-ui-spike-')
os.makedirs(OUT, exist_ok=True)
rows = []
for html in sys.argv[1:]:
    name = os.path.splitext(os.path.basename(html))[0]
    snap = os.path.join(OUT, f'snap-{name}.png')
    shot = os.path.join(OUT, f'window-{name}.png')
    cmd = [os.path.join(OUT, 'spike'), '--port=1', f'--html={html}', f'--png={snap}', f'--label={name}']
    started = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    window, result = None, None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith('WINDOW '):
            window = line.split()[1]
            time.sleep(0.4)
            subprocess.run(['screencapture', '-x', '-o', f'-l{window}', shot], capture_output=True, text=True)
        elif line.startswith('RESULT '):
            result = json.loads(line[len('RESULT '):])
    proc.wait(timeout=40)
    log = (result or {}).get('log', [])
    size = next((entry for entry in log if entry.startswith('scriptRan=')), '')
    rows.append({'sample': name, 'wallMs': round((time.time() - started) * 1000), 'exit': proc.returncode,
                 'size': size, 'actions': [entry for entry in log if entry.startswith('ACTION')],
                 'navigations': [entry for entry in log if entry.startswith('NAV')][:6],
                 'marks': (result or {}).get('marks'), 'stderr': proc.stderr.read().strip()[:200],
                 'windowShot': os.path.exists(shot) and os.path.getsize(shot) > 0})
    print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
json.dump(rows, open(os.path.join(OUT, 'render.json'), 'w'), ensure_ascii=False, indent=1)
