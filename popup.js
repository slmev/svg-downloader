let foundSvgs = [];

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewBtn = document.getElementById('previewBtn');
  const logDiv = document.getElementById('log');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');

  // 初始化日志
  addLog("🔍 正在扫描页面...");

  // 获取当前标签页并获取 SVG 数据
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      statusDiv.textContent = "❌ 无法获取当前标签页";
      statusDiv.style.color = "#d32f2f";
      return;
    }

    const tabId = tabs[0].id;
    
    // 发送消息给 content.js
    chrome.tabs.sendMessage(tabId, { action: 'getSvgs' }, (response) => {
      const error = chrome.runtime.lastError;
      
      if (error) {
        console.error('消息发送错误:', error);
        statusDiv.textContent = "❌ 请刷新页面后重试";
        statusDiv.style.color = "#d32f2f";
        addLog("提示：请刷新页面，确保 content.js 已加载");
        return;
      }

      if (response && response.success && response.svgs) {
        foundSvgs = response.svgs;
        const count = response.count;
        
        if (count > 0) {
          statusDiv.textContent = "✅ 发现 " + count + " 个 SVG";
          statusDiv.style.color = "#2e7d32";
          downloadBtn.disabled = false;
          previewBtn.disabled = false;
          previewBtn.textContent = "预览列表 (" + count + ")";
          addLog("✓ 扫描完成，找到 " + count + " 个 SVG");
        } else {
          statusDiv.textContent = "⚠️ 未找到 SVG 图片";
          statusDiv.style.color = "#f57c00";
          addLog("提示：页面可能没有内联或外部 SVG");
        }
      } else {
        statusDiv.textContent = "❌ 获取数据失败";
        statusDiv.style.color = "#d32f2f";
        addLog("错误：" + (response?.error || "未知错误"));
      }
    });
  });

  // 预览列表
  previewBtn.addEventListener('click', () => {
    logDiv.innerHTML = "<strong>📋 SVG 列表:</strong><br>";
    foundSvgs.forEach((svg, i) => {
      const type = svg.type === 'inline' ? '📄 内联' : '🔗 外部';
      logDiv.innerHTML += (i + 1) + ". " + type + " - " + svg.name + "<br>";
    });
  });

  // 下载逻辑 (使用 JSZip)
  downloadBtn.addEventListener('click', async () => {
    if (foundSvgs.length === 0) {
      addLog("❌ 没有可下载的 SVG");
      return;
    }

    downloadBtn.disabled = true;
    downloadBtn.textContent = "⏳ 打包中...";
    previewBtn.disabled = true;
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    logDiv.innerHTML = "";
    addLog("📦 开始打包 SVG 文件...");

    try {
      const zip = new JSZip();
      const svgFolder = zip.folder("svgs");

      // 处理所有 SVG
      for (let i = 0; i < foundSvgs.length; i++) {
        const svg = foundSvgs[i];
        updateProgress(i + 1, foundSvgs.length);

        try {
          if (svg.type === 'inline') {
            // 内联 SVG 直接添加内容（指定 UTF-8 编码）
            svgFolder.file(svg.name, svg.data, {
              binary: false,
              encoding: "UTF-8"
            });
            addLog("✓ " + svg.name);
          } else if (svg.type === 'external') {
            // 外部 SVG 需要 fetch 获取内容
            try {
              const response = await fetch(svg.url);
              if (response.ok) {
                const svgText = await response.text();
                svgFolder.file(svg.name, svgText, {
                  binary: false,
                  encoding: "UTF-8"
                });
                addLog("✓ " + svg.name);
              } else {
                addLog("✗ " + svg.name + " (HTTP " + response.status + ")");
              }
            } catch (fetchError) {
              addLog("✗ " + svg.name + " (网络错误)");
              console.error('Fetch error:', fetchError);
            }
          }
        } catch (fileError) {
          addLog("✗ " + svg.name + " (处理失败)");
          console.error('File error:', fileError);
        }

        // 避免阻塞 UI
        await new Promise(r => setTimeout(r, 30));
      }

      updateProgress(foundSvgs.length, foundSvgs.length);
      addLog("<br>📦 生成 ZIP 文件中...");

      // 生成 ZIP 文件（指定编码）
      const content = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      // 创建下载链接
      const url = URL.createObjectURL(content);
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, -5);
      const filename = "svgs-" + timestamp + ".zip";

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          addLog("❌ 下载失败：" + chrome.runtime.lastError.message);
          downloadBtn.textContent = "❌ 下载失败";
          downloadBtn.disabled = false;
          previewBtn.disabled = false;
          return;
        }
        
        URL.revokeObjectURL(url);
        addLog("<br>✅ 下载完成：" + filename);
        downloadBtn.textContent = "✅ 下载完成";
        
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.textContent = "下载全部 (ZIP)";
          previewBtn.disabled = false;
          progressBar.style.display = 'none';
          progressFill.style.width = '0%';
        }, 2000);
      });

    } catch (error) {
      console.error('Zip error:', error);
      addLog("<br>❌ 错误：" + error.message);
      downloadBtn.textContent = "❌ 下载失败";
      downloadBtn.disabled = false;
      previewBtn.disabled = false;
    }
  });

  // 更新进度条
  function updateProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = percent + "%";
    statusDiv.textContent = "处理中... " + current + "/" + total;
  }

  // 添加日志
  function addLog(msg) {
    const div = document.createElement('div');
    div.innerHTML = msg;
    div.style.marginBottom = "4px";
    logDiv.appendChild(div);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
});