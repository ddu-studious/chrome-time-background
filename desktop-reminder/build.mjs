import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
if (!id || !/^[a-p]{32}$/.test(id)) throw new Error('请传入 --extension-id=真实Chrome扩展ID');
if (process.platform !== 'darwin') throw new Error('桌面提醒组件仅支持 macOS');
const app = resolve(root, 'local-ai/.local/TimeKeeperDesktop.app');
const executable = resolve(app, 'Contents/MacOS/TimeKeeperDesktop');
mkdirSync(dirname(executable), { recursive: true });
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.timekeeper.desktop</string>
<key>CFBundleExecutable</key><string>TimeKeeperDesktop</string>
<key>CFBundleName</key><string>桌面闹钟</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>AllowedExtensionOrigins</key><array><string>chrome-extension://${id}/</string></array>
</dict></plist>`;
writeFileSync(resolve(app, 'Contents/Info.plist'), plist);
execFileSync('/usr/bin/xcrun', ['swiftc', resolve(root, 'desktop-reminder/main.swift'), '-framework', 'AppKit', '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', executable], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', app], { stdio: 'inherit' });
console.log(`组件已构建：${app}`);
if (process.argv.includes('--install')) {
  const hostDir = resolve(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  const manifestFile = resolve(hostDir, 'com.timekeeper.desktop.json');
  const manifest = { name: 'com.timekeeper.desktop', description: 'Time Keeper desktop alarm panel', path: executable, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] };
  mkdirSync(hostDir, { recursive: true });
  if (existsSync(manifestFile) && readFileSync(manifestFile, 'utf8') !== JSON.stringify(manifest, null, 2)) copyFileSync(manifestFile, `${manifestFile}.backup-${Date.now()}`);
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`原生消息注册已完成：${manifestFile}`);
}
