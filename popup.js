let foundSvgs = [];

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewBtn = document.getElementById('previewBtn');
  const logDiv = document.getElementById('log');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');

  addLog("🔍 正在扫描页面...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      statusDiv.textContent = "❌ 无法获取当前标签页";
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: 'getSvgs' }, (response) => {
      const error = chrome.runtime.lastError;
      
      if (error) {
        console.error('消息发送错误:', error);
        statusDiv.textContent = "❌ 请刷新页面后重试";
        addLog("提示：请刷新页面");
        return;
      }

      if (response && response.success && response.svgs) {
        foundSvgs = response.svgs;
        const count = response.count;
        
        // 验证数据
        console.log('[Popup] 收到 SVG 数据:', {
          count: count,
          firstSvg: foundSvgs[0] ? {
            name: foundSvgs[0].name,
            type: foundSvgs[0].type,
            dataLength: foundSvgs[0].data?.length || 0
          } : null
        });
        
        if (count > 0) {
          statusDiv.textContent = "✅ 发现 " + count + " 个 SVG";
          statusDiv.style.color = "#2e7d32";
          downloadBtn.disabled = false;
          previewBtn.disabled = false;
          previewBtn.textContent = "预览列表 (" + count + ")";
          addLog("✓ 扫描完成");
        } else {
          statusDiv.textContent = "⚠️ 未找到 SVG 图片";
          statusDiv.style.color = "#f57c00";
        }
      } else {
        statusDiv.textContent = "❌ 获取数据失败";
        statusDiv.style.color = "#d32f2f";
        addLog("错误：" + (response?.error || "未知错误"));
      }
    });
  });

  previewBtn.addEventListener('click', () => {
    logDiv.innerHTML = "<strong>📋 SVG 列表:</strong><br>";
    foundSvgs.forEach((svg, i) => {
      const type = svg.type === 'inline' ? '📄 内联' : '🔗 外部';
      const size = svg.data ? Math.round(svg.data.length / 1024 * 100) / 100 + ' KB' : 'N/A';
      logDiv.innerHTML += (i + 1) + ". " + type + " - " + svg.name + " (" + size + ")<br>";
    });
  });

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
    addLog("📦 开始打包...");

    try {
      const zip = new JSZip();
      const svgFolder = zip.folder("svgs");

      for (let i = 0; i < foundSvgs.length; i++) {
        const svg = foundSvgs[i];
        updateProgress(i + 1, foundSvgs.length);

        try {
          if (svg.type === 'inline') {
            // 关键修复：确保 data 存在且不为空
            if (!svg.data || svg.data.length === 0) {
              addLog("✗ " + svg.name + " (数据为空，跳过)");
              console.warn('[跳过] SVG 数据为空:', svg.name);
              continue;
            }
            
            // 写入文件
            svgFolder.file(svg.name, svg.data);
            addLog("✓ " + svg.name + " (" + Math.round(svg.data.length / 1024 * 100) / 100 + " KB)");
            
          } else if (svg.type === 'external') {
            try {
              const response = await fetch(svg.url);
              if (response.ok) {
                const svgText = await response.text();
                if (svgText && svgText.length > 0) {
                  svgFolder.file(svg.name, svgText);
                  addLog("✓ " + svg.name);
                } else {
                  addLog("✗ " + svg.name + " (内容为空)");
                }
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

        await new Promise(r => setTimeout(r, 30));
      }

      updateProgress(foundSvgs.length, foundSvgs.length);
      addLog("<br>📦 生成 ZIP...");

      // 验证 ZIP 内容
      const zipContent = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE"
      });
      
      console.log('[Popup] ZIP 文件大小:', zipContent.size, '字节');
      
      // 验证 ZIP 中的文件
      const zipCheck = new JSZip();
      await zipCheck.loadAsync(zipContent);
      console.log('[Popup] ZIP 中的文件:', Object.keys(zipCheck.files));
      
      const url = URL.createObjectURL(zipContent);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
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

  function updateProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = percent + "%";
    statusDiv.textContent = "处理中... " + current + "/" + total;
  }

  function addLog(msg) {
    const div = document.createElement('div');
    div.innerHTML = msg;
    div.style.marginBottom = "4px";
    logDiv.appendChild(div);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
});