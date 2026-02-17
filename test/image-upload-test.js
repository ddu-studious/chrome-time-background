/**
 * 图片上传功能测试脚本
 * 验证 Chrome 扩展 CSP 环境下的图片上传能力
 */

const IMGVAULT_API = 'https://www.meczyc6.info/imgvault';

// ===== 日志工具 =====
function log(msg, type = 'info') {
    const area = document.getElementById('log-area');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    area.appendChild(entry);
    area.scrollTop = area.scrollHeight;
    console.log(`[${type}] ${msg}`);
}

function showResult(containerId, msg, pass) {
    const el = document.getElementById(containerId);
    const cls = pass === true ? 'pass' : pass === false ? 'fail' : 'info';
    const div = document.createElement('div');
    div.className = `result ${cls}`;
    div.textContent = msg;
    el.appendChild(div);
}

// ===== 图片错误回退（CSP 安全方式） =====
function bindImageErrorFallback(imgEl) {
    if (!imgEl) return;
    imgEl.addEventListener('error', () => {
        imgEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='40' y='44' text-anchor='middle' fill='%23999' font-size='12'%3E图片%3C/text%3E%3C/svg%3E";
    }, { once: true });
}

// ===== 压缩图片 =====
function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== 上传到 ImgVault =====
async function uploadToImgVault(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const resp = await fetch(`${IMGVAULT_API}/api/v1/images/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    
    const result = await resp.json();
    if (result.code === 200 && result.data) {
        return result.data;
    }
    throw new Error(`API Error: ${JSON.stringify(result)}`);
}

// ===== 获取缩略图 URL =====
function getImgVaultProcessUrl(imgId, opts = {}) {
    const params = new URLSearchParams();
    if (opts.width) params.set('width', opts.width);
    if (opts.height) params.set('height', opts.height);
    if (opts.format) params.set('format', opts.format);
    if (opts.quality) params.set('quality', opts.quality);
    return `${IMGVAULT_API}/api/v1/images/${imgId}/process?${params}`;
}

// ===== 测试 1: input[type=file] =====
document.getElementById('test-file-btn').addEventListener('click', () => {
    document.getElementById('test-file-input').click();
});

document.getElementById('test-file-input').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
        log(`✅ 文件选择成功！选中 ${files.length} 个文件`, 'success');
        for (const f of files) {
            log(`   - ${f.name} (${f.type}, ${(f.size/1024).toFixed(1)}KB)`, 'info');
        }
        showResult('test1-result', `✅ 通过: 成功选择 ${files.length} 个文件`, true);
    } else {
        log('❌ 文件选择失败', 'error');
        showResult('test1-result', '❌ 失败: 无法选择文件', false);
    }
});

// ===== 测试 2: FileReader + Canvas =====
document.getElementById('test-compress-btn').addEventListener('click', () => {
    document.getElementById('test-compress-input').click();
});

document.getElementById('test-compress-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    log(`开始压缩: ${file.name}...`, 'info');
    try {
        const thumbnail = await compressImage(file, 80, 0.6);
        log(`✅ 缩略图生成成功 (${(thumbnail.length/1024).toFixed(1)}KB base64)`, 'success');
        
        const fullImage = await compressImage(file, 800, 0.85);
        log(`✅ 压缩图生成成功 (${(fullImage.length/1024).toFixed(1)}KB base64)`, 'success');
        
        // 显示预览
        const preview = document.getElementById('compress-preview');
        const item = document.createElement('div');
        item.className = 'preview-item';
        const img = document.createElement('img');
        img.src = thumbnail;
        img.alt = '缩略图';
        bindImageErrorFallback(img);
        item.appendChild(img);
        preview.appendChild(item);
        
        const item2 = document.createElement('div');
        item2.className = 'preview-item';
        item2.style.width = '160px';
        const img2 = document.createElement('img');
        img2.src = fullImage;
        img2.alt = '压缩图';
        bindImageErrorFallback(img2);
        item2.appendChild(img2);
        preview.appendChild(item2);
        
        showResult('test2-result', '✅ 通过: FileReader + Canvas 正常工作', true);
    } catch (err) {
        log(`❌ 压缩失败: ${err.message}`, 'error');
        showResult('test2-result', `❌ 失败: ${err.message}`, false);
    }
});

// ===== 测试 3: fetch 上传 =====
document.getElementById('test-upload-btn').addEventListener('click', () => {
    document.getElementById('test-upload-input').click();
});

document.getElementById('test-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    log(`开始上传到 ImgVault: ${file.name}...`, 'info');
    try {
        const result = await uploadToImgVault(file);
        log(`✅ 上传成功! imageId=${result.id}, uuid=${result.imageUuid}`, 'success');
        
        // 生成缩略图 URL 并预览
        const thumbUrl = getImgVaultProcessUrl(result.id, { width: 80, height: 80, format: 'webp', quality: 60 });
        log(`缩略图 URL: ${thumbUrl}`, 'info');
        
        const preview = document.getElementById('upload-preview');
        const item = document.createElement('div');
        item.className = 'preview-item';
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = 'ImgVault 缩略图';
        bindImageErrorFallback(img);
        item.appendChild(img);
        preview.appendChild(item);
        
        showResult('test3-result', `✅ 通过: 上传成功 (ID: ${result.id})`, true);
    } catch (err) {
        log(`❌ 上传失败: ${err.message}`, 'error');
        showResult('test3-result', `❌ 失败: ${err.message}`, false);
        
        // 尝试回退到 base64
        log('尝试回退到本地 base64 压缩方案...', 'warn');
        try {
            const thumb = await compressImage(file, 80, 0.6);
            const preview = document.getElementById('upload-preview');
            const item = document.createElement('div');
            item.className = 'preview-item';
            const img = document.createElement('img');
            img.src = thumb;
            img.alt = 'base64 回退';
            bindImageErrorFallback(img);
            item.appendChild(img);
            preview.appendChild(item);
            
            showResult('test3-result', '⚠ ImgVault 不可用，已回退到本地 base64 方案', null);
        } catch (err2) {
            showResult('test3-result', `❌ base64 回退也失败: ${err2.message}`, false);
        }
    }
});

// ===== 测试 4: 完整流程 =====
const fullUploadArea = document.getElementById('full-upload-area');
const fullUploadInput = document.getElementById('full-upload-input');

fullUploadArea.addEventListener('click', () => fullUploadInput.click());

// 拖拽支持
fullUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fullUploadArea.style.borderColor = '#64b5f6';
    fullUploadArea.style.background = 'rgba(100,181,246,0.08)';
});
fullUploadArea.addEventListener('dragleave', () => {
    fullUploadArea.style.borderColor = '';
    fullUploadArea.style.background = '';
});
fullUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fullUploadArea.style.borderColor = '';
    fullUploadArea.style.background = '';
    if (e.dataTransfer.files.length > 0) {
        handleFullUpload(e.dataTransfer.files);
    }
});

fullUploadInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFullUpload(e.target.files);
    }
});

async function handleFullUpload(files) {
    const preview = document.getElementById('full-preview');
    
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        
        log(`[完整流程] 处理: ${file.name} (${(file.size/1024).toFixed(1)}KB)`, 'info');
        
        // 创建加载占位
        const item = document.createElement('div');
        item.className = 'preview-item uploading';
        item.innerHTML = '<div class="spinner">⟳</div>';
        preview.appendChild(item);
        
        try {
            // 优先尝试 ImgVault
            log('[完整流程] 尝试上传到 ImgVault...', 'info');
            const result = await uploadToImgVault(file);
            const thumbUrl = getImgVaultProcessUrl(result.id, { width: 80, height: 80, format: 'webp', quality: 60 });
            
            log(`[完整流程] ✅ ImgVault 上传成功, ID=${result.id}`, 'success');
            
            item.classList.remove('uploading');
            item.innerHTML = '';
            const img = document.createElement('img');
            img.src = thumbUrl;
            img.alt = '预览';
            bindImageErrorFallback(img);
            item.appendChild(img);
            
            showResult('test4-result', `✅ 图片 "${file.name}" 上传并预览成功 (ImgVault ID: ${result.id})`, true);
            
        } catch (err) {
            log(`[完整流程] ImgVault 失败: ${err.message}, 回退到 base64...`, 'warn');
            
            try {
                const thumb = await compressImage(file, 80, 0.6);
                item.classList.remove('uploading');
                item.innerHTML = '';
                const img = document.createElement('img');
                img.src = thumb;
                img.alt = '预览(base64)';
                bindImageErrorFallback(img);
                item.appendChild(img);
                
                showResult('test4-result', `⚠ 图片 "${file.name}" 已使用 base64 回退方案`, null);
                log(`[完整流程] ✅ base64 回退成功`, 'success');
            } catch (err2) {
                item.remove();
                log(`[完整流程] ❌ 全部失败: ${err2.message}`, 'error');
                showResult('test4-result', `❌ 图片 "${file.name}" 处理完全失败`, false);
            }
        }
    }
}

// ===== 自动测试（无需用户选择文件） =====
async function runAutoTest() {
    log('===== 开始自动化测试 =====', 'info');
    
    // 创建测试用的 Canvas 图片
    log('生成测试图片 (Canvas)...', 'info');
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    // 渐变背景
    const grad = ctx.createLinearGradient(0, 0, 200, 200);
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(0.5, '#64b5f6');
    grad.addColorStop(1, '#81c784');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Test Image', 100, 105);
    
    // 转为 Blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const testFile = new File([blob], 'test-image.png', { type: 'image/png' });
    log(`✅ 测试图片创建成功: ${testFile.name} (${(testFile.size/1024).toFixed(1)}KB)`, 'success');
    
    // 测试 A: FileReader + Canvas 压缩
    log('--- 测试 A: FileReader + Canvas 压缩 ---', 'info');
    try {
        const thumb = await compressImage(testFile, 80, 0.6);
        log(`✅ 缩略图: ${(thumb.length/1024).toFixed(1)}KB`, 'success');
        
        const preview = document.getElementById('compress-preview');
        const item = document.createElement('div');
        item.className = 'preview-item';
        const img = document.createElement('img');
        img.src = thumb;
        img.alt = '自动测试缩略图';
        bindImageErrorFallback(img);
        item.appendChild(img);
        preview.appendChild(item);
        
        showResult('test2-result', '✅ 自动测试通过: FileReader + Canvas 正常', true);
    } catch (err) {
        log(`❌ 压缩失败: ${err.message}`, 'error');
        showResult('test2-result', `❌ 自动测试失败: ${err.message}`, false);
    }
    
    // 测试 B: fetch 上传到 ImgVault
    log('--- 测试 B: fetch 上传到 ImgVault ---', 'info');
    try {
        const result = await uploadToImgVault(testFile);
        log(`✅ 上传成功! id=${result.id}, uuid=${result.imageUuid}`, 'success');
        
        const thumbUrl = getImgVaultProcessUrl(result.id, { width: 80, height: 80, format: 'webp', quality: 60 });
        log(`缩略图 URL: ${thumbUrl}`, 'info');
        
        const preview = document.getElementById('upload-preview');
        const item = document.createElement('div');
        item.className = 'preview-item';
        const img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = 'ImgVault 预览';
        bindImageErrorFallback(img);
        item.appendChild(img);
        preview.appendChild(item);
        
        showResult('test3-result', `✅ 自动测试通过: ImgVault 上传成功 (ID: ${result.id})`, true);
    } catch (err) {
        log(`⚠ ImgVault 上传失败: ${err.message}`, 'warn');
        showResult('test3-result', `⚠ ImgVault 不可用: ${err.message}（回退到 base64 即可）`, null);
    }
    
    log('===== 自动化测试完成 =====', 'info');
}

// ===== 初始化 =====
log('测试页面已加载', 'info');
log(`CSP 模式: script-src 'self' (模拟 Chrome 扩展)`, 'info');
log(`ImgVault API: ${IMGVAULT_API}`, 'info');
log('---', 'info');

// 自动运行测试
setTimeout(runAutoTest, 500);
