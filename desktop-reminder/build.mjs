import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv.find(a => a.startsWith('--extension-id='))?.split('=')[1];
if (!id || !/^[a-p]{32}$/.test(id)) throw new Error('请传入 --extension-id=真实Chrome扩展ID');
if (process.platform !== 'darwin') throw new Error('桌面提醒组件仅支持 macOS');
const app = process.argv.find(a => a.startsWith('--app='))?.slice(6) || resolve(root, 'local-ai/.local/TimeKeeperDesktop.app');
const executable = resolve(app, 'Contents/MacOS/TimeKeeperDesktop');
// 隔离测试构建（--app）用独立的 Bundle ID：窗口位置/尺寸记忆（NSUserDefaults）不与正在使用的真实组件共用，
// 否则验收脚本会改写用户保存的倒计时位置。Native Messaging 注册只看可执行文件路径，不受影响。
const bundleId = process.argv.some(a => a.startsWith('--app=')) ? 'com.timekeeper.desktop.qa' : 'com.timekeeper.desktop';
mkdirSync(dirname(executable), { recursive: true });
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleExecutable</key><string>TimeKeeperDesktop</string>
<key>CFBundleName</key><string>桌面闹钟</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>8</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>AllowedExtensionOrigins</key><array><string>chrome-extension://${id}/</string></array>
</dict></plist>`;
writeFileSync(resolve(app, 'Contents/Info.plist'), plist);
// 编译清单：纯逻辑（可单独自测）在前，AppKit 在后，main.swift 最后；新增源文件须同步这里与 test/desktop-companion-logic.test.mjs。
const sources = ['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'jelly-appearance', 'jelly-paint', 'assistant-model', 'glass-view', 'jelly-ring', 'jelly-materials', 'jelly-companion', 'jelly-controller', 'confirmation-view', 'assistant-hotkey', 'assistant-panel', 'main'];
execFileSync('/usr/bin/xcrun', ['swiftc', ...sources.map(name => resolve(root, `desktop-reminder/${name}.swift`)), '-framework', 'AppKit', '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', executable], { stdio: 'inherit' });
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
