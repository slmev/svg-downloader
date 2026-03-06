let foundSvgs = [];
let selectedSvgs = new Set();

document.addEventListener('DOMContentLoaded', () => {
  // ... 获取 DOM 元素 ...
  
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const previewBtn = document.getElementById('previewBtn');
  const logDiv = document.getElementById('log');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const previewContainer = document.getElementById('previewContainer');
  const svgList = document.getElementById('svgList');
  const searchBox = document.getElementById('searchBox');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const invertSelectBtn = document.getElementById('invertSelectBtn');
  const selectedCount = document.getElementById('selectedCount');

  // 初始状态
  updateStatus("🔍 正在扫描页面...");

  // 获取 SVG 数据
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      statusDiv.textContent = "❌ 无法获取当前标签页";
      statusDiv.style.color = "#d32f2f";
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: 'getSvgs' }, (response) => {
      const error = chrome.runtime.lastError;
      
      if (error) {
        console.error('消息发送错误:', error);
        statusDiv.textContent = "❌ 请刷新页面后重试";
        statusDiv.style.color = "#d32f2f";
        addLog("提示：请刷新页面");
        return;
      }

      if (response && response.success && response.svgs) {
        foundSvgs = response.svgs;
        const count = response.count;
        
        // 默认全选
        selectedSvgs.clear();
        for (let i = 0; i < foundSvgs.length; i++) {
          selectedSvgs.add(i);
        }
        
        updateStatus("✓ 扫描完成", "#2e7d32");
        addLog(`发现 ${count} 个 SVG`);
        
        if (count > 0) {
          statusDiv.textContent = `✅ 发现 ${count} 个 SVG`;
          statusDiv.style.color = "#2e7d32";
          downloadBtn.disabled = false;
          previewBtn.disabled = false;
          previewBtn.textContent = `预览列表 (${count})`;
          updateSelectedCount();
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

  // 预览列表按钮
  previewBtn.addEventListener('click', () => {
    if (previewContainer.style.display === 'block') {
      previewContainer.style.display = 'none';
      previewBtn.textContent = `预览列表 (${foundSvgs.length})`;
    } else {
      renderSvgList();
      previewContainer.style.display = 'block';
      previewBtn.textContent = '隐藏列表';
    }
  });

  // 全选按钮
  selectAllBtn.addEventListener('click', () => {
    const visibleCheckboxes = svgList.querySelectorAll('input[type="checkbox"]');
    const allVisibleSelected = Array.from(visibleCheckboxes)
      .filter(cb => cb.closest('.svg-item').style.display !== 'none')
      .every(cb => cb.checked);
    
    visibleCheckboxes.forEach(checkbox => {
      if (checkbox.closest('.svg-item').style.display !== 'none') {
        checkbox.checked = !allVisibleSelected;
        const index = parseInt(checkbox.dataset.index);
        if (!allVisibleSelected) {
          selectedSvgs.add(index);
        } else {
          selectedSvgs.delete(index);
        }
      }
    });
    
    updateSelectedCount();
  });

  // 反选按钮
  invertSelectBtn.addEventListener('click', () => {
    const checkboxes = svgList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      if (checkbox.closest('.svg-item').style.display !== 'none') {
        checkbox.checked = !checkbox.checked;
        const index = parseInt(checkbox.dataset.index);
        if (checkbox.checked) {
          selectedSvgs.add(index);
        } else {
          selectedSvgs.delete(index);
        }
      }
    });
    
    updateSelectedCount();
  });

  // 搜索框
  searchBox.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = svgList.querySelectorAll('.svg-item');
    
    items.forEach(item => {
      const name = item.querySelector('.svg-name').textContent.toLowerCase();
      if (name.includes(searchTerm)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
    
    updateSelectedCount();
  });

  // 下载按钮
  downloadBtn.addEventListener('click', async () => {
    const selectedIndices = Array.from(selectedSvgs).sort((a, b) => a - b);
    
    if (selectedIndices.length === 0) {
      addLog("❌ 请选择至少一个 SVG");
      return;
    }

    const selectedData = selectedIndices.map(i => foundSvgs[i]);
    
    downloadBtn.disabled = true;
    downloadBtn.textContent = `⏳ 打包中... (${selectedIndices.length})`;
    previewBtn.disabled = true;
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    logDiv.innerHTML = "";
    addLog(`📦 开始打包 ${selectedIndices.length} 个 SVG...`);

    try {
      const zip = new JSZip();
      const svgFolder = zip.folder("svgs");

      for (let i = 0; i < selectedData.length; i++) {
        const svg = selectedData[i];
        updateProgress(i + 1, selectedData.length);

        try {
          if (svg.type === 'inline') {
            if (!svg.data || svg.data.length === 0) {
              addLog("✗ " + svg.name + " (数据为空)");
              continue;
            }
            
            svgFolder.file(svg.name, svg.data);
            addLog("✓ " + svg.name);
            
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
            }
          }
        } catch (fileError) {
          addLog("✗ " + svg.name + " (处理失败)");
        }

        await new Promise(r => setTimeout(r, 30));
      }

      updateProgress(selectedData.length, selectedData.length);
      addLog("<br>📦 生成 ZIP...");

      const content = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE"
      });
      
      const url = URL.createObjectURL(content);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `svgs-${timestamp}.zip`;

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          addLog("❌ 下载失败：" + chrome.runtime.lastError.message);
          downloadBtn.textContent = "❌ 下载失败";
          resetButtons();
          return;
        }
        
        URL.revokeObjectURL(url);
        addLog(`<br>✅ 下载完成：${filename}`);
        downloadBtn.textContent = "✅ 下载完成";
        
        setTimeout(() => {
          resetButtons();
        }, 2000);
      });

    } catch (error) {
      console.error('Zip error:', error);
      addLog("<br>❌ 错误：" + error.message);
      downloadBtn.textContent = "❌ 下载失败";
      resetButtons();
    }
  });

  // 渲染 SVG 列表
  function renderSvgList() {
    svgList.innerHTML = '';
    
    foundSvgs.forEach((svg, index) => {
      const item = document.createElement('div');
      item.className = 'svg-item';
      
      // 创建预览图
      let previewImg = null;
      if (svg.type === 'inline' && svg.data) {
        try {
          const base64 = btoa(unescape(encodeURIComponent(svg.data)));
          previewImg = document.createElement('img');
          previewImg.src = `data:image/svg+xml;base64,${base64}`;
          previewImg.className = 'svg-preview';
          previewImg.alt = svg.name;
        } catch (e) {
          previewImg = createPlaceholderImg();
        }
      } else if (svg.type === 'external') {
        previewImg = document.createElement('img');
        previewImg.src = svg.url;
        previewImg.className = 'svg-preview';
        previewImg.alt = svg.name;
        
        // 修复：用 addEventListener 替代 onerror
        previewImg.addEventListener('error', function() {
          this.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23ddd%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%23999%22%3E SVG %3C/text%3E%3C/svg%3E';
        });
      } else {
        previewImg = createPlaceholderImg();
      }
      
      // 文件大小
      const size = svg.data ? formatSize(svg.data.length) : 'N/A';
      const typeLabel = svg.type === 'inline' ? '内联' : '外部';
      const typeClass = svg.type === 'inline' ? 'type-inline' : 'type-external';
      
      // 创建复选框
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.index = index;
      checkbox.checked = selectedSvgs.has(index);
      checkbox.title = svg.name;
      
      // 修复：用 addEventListener 替代 onchange
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedSvgs.add(index);
        } else {
          selectedSvgs.delete(index);
        }
        updateSelectedCount();
      });
      
      // 创建信息区域
      const infoDiv = document.createElement('div');
      infoDiv.className = 'svg-info';
      infoDiv.innerHTML = `
        <div class="svg-name" title="${escapeHtml(svg.name)}">${escapeHtml(svg.name)}</div>
        <div class="svg-meta">
          ${size} 
          <span class="svg-type ${typeClass}">${typeLabel}</span>
        </div>
      `;
      
      // 组装元素
      item.appendChild(checkbox);
      item.appendChild(previewImg);
      item.appendChild(infoDiv);
      
      svgList.appendChild(item);
    });
    
    updateSelectedCount();
  }

  // 创建占位图片
  function createPlaceholderImg() {
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f5f5f5%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%23ccc%22%3E ? %3C/text%3E%3C/svg%3E';
    img.className = 'svg-preview';
    return img;
  }

  // HTML 转义（防止 XSS）
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 更新选中数量显示
  function updateSelectedCount() {
    const total = foundSvgs.length;
    const selected = selectedSvgs.size;
    selectedCount.textContent = `(${selected}/${total} 已选)`;
    
    if (selected > 0) {
      downloadBtn.textContent = `下载选中 (${selected})`;
    } else {
      downloadBtn.textContent = '下载全部 (ZIP)';
    }
  }

  // 工具函数
  function updateStatus(msg, color = '#666') {
    const statusLog = document.getElementById('statusLog');
    if (statusLog) {
      statusLog.innerHTML = msg;
      statusLog.style.color = color;
    } else {
      const div = document.createElement('div');
      div.id = 'statusLog';
      div.innerHTML = msg;
      div.style.color = color;
      div.style.marginBottom = '8px';
      logDiv.insertBefore(div, logDiv.firstChild);
    }
  }

  function addLog(msg) {
    const div = document.createElement('div');
    div.innerHTML = msg;
    div.style.marginBottom = "4px";
    logDiv.appendChild(div);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function updateProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    progressFill.style.width = percent + "%";
    statusDiv.textContent = `处理中... ${current}/${total}`;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function resetButtons() {
    downloadBtn.disabled = false;
    downloadBtn.textContent = `下载选中 (${selectedSvgs.size})`;
    previewBtn.disabled = false;
    progressBar.style.display = 'none';
    progressFill.style.width = '0%';
  }
});