// content.js

/**
 * 序列化 SVG 节点为字符串
 */
function serializeSvg(svgElement) {
  try {
    const clone = svgElement.cloneNode(true);
    
    // 设置宽高
    if (!clone.getAttribute('width')) {
      const width = svgElement.getBoundingClientRect().width || 100;
      clone.setAttribute('width', width);
    }
    if (!clone.getAttribute('height')) {
      const height = svgElement.getBoundingClientRect().height || 100;
      clone.setAttribute('height', height);
    }
    
    // 确保有 xmlns
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    
    // 移除 style 属性
    clone.removeAttribute('style');
    
    // 序列化
    let svgData = new XMLSerializer().serializeToString(clone);
    
    // 验证序列化结果
    if (!svgData || svgData.length < 10) {
      console.warn('[序列化警告] SVG 内容过短:', svgData);
      return null;
    }
    
    // 添加 XML 声明
    if (!svgData.trim().startsWith('<?xml')) {
      svgData = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgData;
    }
    
    return svgData;
  } catch (e) {
    console.error('[序列化错误]', e);
    return null;
  }
}

/**
 * 生成文件名
 */
function generateSvgName(svgElement, index) {
  try {
    const title = svgElement.querySelector('title');
    if (title && title.textContent.trim()) {
      return title.textContent.trim()
        .replace(/[<>:"/\\|？*]/g, '_')
        .replace(/\s+/g, '_') + '.svg';
    }
  } catch (e) {}
  return 'svg-' + (index + 1) + '.svg';
}

/**
 * 从指定根节点递归提取 SVG
 */
function extractSvgsFromRoot(root, startIndex = 0) {
  const results = [];
  let index = startIndex;
  
  if (!root) return results;
  
  // 1. 获取当前根节点的所有 SVG
  try {
    const svgs = root.querySelectorAll('svg');
    svgs.forEach(svg => {
      const svgData = serializeSvg(svg);
      if (svgData) {  // 只添加有效的 SVG
        results.push({
          type: 'inline',
          data: svgData,  // 确保字段名是 data
          name: generateSvgName(svg, index++)
        });
      }
    });
  } catch (e) {
    console.warn('[查询 SVG 失败]', e);
  }
  
  // 2. 递归查找 Shadow DOM
  try {
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowResults = extractSvgsFromRoot(el.shadowRoot, index);
        results.push(...shadowResults);
        index += shadowResults.length;
      }
    }
  } catch (e) {
    console.warn('[遍历 Shadow DOM 失败]', e);
  }
  
  return results;
}

/**
 * 提取内联 SVG
 */
function extractInlineSvgs() {
  console.log('[SVG Downloader] 开始提取内联 SVG...');
  const results = extractSvgsFromRoot(document);
  console.log('[SVG Downloader] 提取完成，共', results.length, '个内联 SVG');
  
  // 验证数据
  results.forEach((svg, i) => {
    console.log(`  SVG #${i}: ${svg.name} (${svg.data?.length || 0} 字节)`);
  });
  
  return results;
}

/**
 * 提取外部 SVG
 */
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
      
      try {
        name = decodeURIComponent(name);
      } catch (e) {}
      
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

/**
 * 提取 CSS 背景 SVG
 */
function extractCssBackgroundSvgs() {
  const results = [];
  const seen = new Set();
  
  try {
    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        
        for (const rule of rules) {
          if (rule.style && rule.style.backgroundImage) {
            const bgImage = rule.style.backgroundImage;
            if (bgImage.includes('.svg')) {
              const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
              if (match && match[1]) {
                const url = match[1];
                if (!seen.has(url)) {
                  seen.add(url);
                  const name = url.split('/').pop() || 'css-bg-' + (results.length + 1) + '.svg';
                  results.push({
                    type: 'external',
                    url: url,
                    name: name
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.warn('[CSS 提取失败]', e);
  }
  
  return results;
}

/**
 * 去重
 */
function deduplicateSvgs(svgs) {
  const seenInline = new Set();
  const seenExternal = new Set();
  const results = [];
  
  svgs.forEach((svg, index) => {
    if (svg.type === 'inline') {
      if (svg.data) {
        const normalized = svg.data
          .replace(/<\?xml[^>]*\?>/i, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        
        if (!seenInline.has(normalized)) {
          seenInline.add(normalized);
          results.push(svg);
        }
      } else {
        results.push(svg);  // 保留没有 data 的（虽然不应该发生）
      }
    } else if (svg.type === 'external') {
      if (svg.url && !seenExternal.has(svg.url)) {
        seenExternal.add(svg.url);
        results.push(svg);
      }
    } else {
      results.push(svg);
    }
  });
  
  console.log(`[SVG Downloader] 去重：${svgs.length} -> ${results.length}`);
  return results;
}

/**
 * 发送响应
 */
function sendSvgsResponse(sendResponse) {
  console.log('[SVG Downloader] 准备发送响应...');
  
  const inlineSvgs = extractInlineSvgs();
  const externalSvgs = extractExternalSvgs();
  const cssSvgs = extractCssBackgroundSvgs();
  
  const allSvgs = [...inlineSvgs, ...externalSvgs, ...cssSvgs];
  const uniqueSvgs = deduplicateSvgs(allSvgs);
  
  // 验证最终数据
  console.log('[SVG Downloader] 最终数据验证:');
  uniqueSvgs.forEach((svg, i) => {
    if (svg.type === 'inline') {
      console.log(`  #${i} ${svg.name}: ${svg.data?.length || 0} 字节`);
    } else {
      console.log(`  #${i} ${svg.name}: ${svg.url}`);
    }
  });
  
  sendResponse({ 
    success: true, 
    count: uniqueSvgs.length, 
    svgs: uniqueSvgs,
    stats: {
      inline: inlineSvgs.length,
      external: externalSvgs.length,
      css: cssSvgs.length
    }
  });
}

/**
 * 监听消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSvgs') {
    console.log('[SVG Downloader] 收到获取 SVG 请求');
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => sendSvgsResponse(sendResponse), 500);
      });
      return true;
    }
    
    setTimeout(() => sendSvgsResponse(sendResponse), 300);
    return true;
  }
  return true;
});

console.log('[SVG Downloader] content.js 已加载');