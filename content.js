// content.js

function extractInlineSvgs() {
  const svgs = document.querySelectorAll('svg');
  const results = [];
  
  svgs.forEach((svg, index) => {
    const clone = svg.cloneNode(true);
    
    // 设置宽高
    if (!clone.getAttribute('width')) {
      const width = svg.getBoundingClientRect().width || 100;
      clone.setAttribute('width', width);
    }
    if (!clone.getAttribute('height')) {
      const height = svg.getBoundingClientRect().height || 100;
      clone.setAttribute('height', height);
    }
    
    // 移除可能影响显示的样式
    clone.removeAttribute('style');
    
    // 序列化为字符串
    let svgData = new XMLSerializer().serializeToString(clone);
    
    // 添加 XML 声明，确保 UTF-8 编码（解决中文乱码关键）
    if (!svgData.startsWith('<?xml')) {
      svgData = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgData;
    }
    
    // 生成文件名（支持中文）
    const title = svg.querySelector('title');
    let name = 'svg-' + (index + 1) + '.svg';
    if (title && title.textContent.trim()) {
      // 保留中文，只替换特殊字符
      name = title.textContent.trim()
        .replace(/[<>:"/\\|？*]/g, '_')
        .replace(/\s+/g, '_') + '.svg';
    }
    
    results.push({
      type: 'inline',
      data: svgData,
      name: name
    });
  });
  
  return results;
}

function extractExternalSvgs() {
  const images = document.querySelectorAll('img, object, embed');
  const results = [];
  const seen = new Set();

  images.forEach(img => {
    const src = img.src || img.data;
    if (src && src.toLowerCase().endsWith('.svg') && !seen.has(src)) {
      seen.add(src);
      
      const urlParts = src.split('/');
      let name = urlParts[urlParts.length - 1] || 'external-' + (results.length + 1) + '.svg';
      
      // 解码 URL 编码的中文
      try {
        name = decodeURIComponent(name);
      } catch (e) {
        // 忽略解码错误
      }
      
      // 清理文件名
      name = name.replace(/[<>:"/\\|？*]/g, '_');
      
      results.push({
        type: 'external',
        url: src,
        name: name
      });
    }
  });
  
  return results;
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSvgs') {
    try {
      const inlineSvgs = extractInlineSvgs();
      const externalSvgs = extractExternalSvgs();
      const allSvgs = [...inlineSvgs, ...externalSvgs];
      
      sendResponse({ 
        success: true, 
        count: allSvgs.length, 
        svgs: allSvgs 
      });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error.message 
      });
    }
  }
  return true; // 保持消息通道开放
});

// 页面加载完成后通知 popup
window.addEventListener('load', () => {
  console.log('SVG Downloader: 页面加载完成，content.js 已就绪');
});