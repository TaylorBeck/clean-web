let currentData = null;
let historyData = [];
let currentHistoryId = null;

document.getElementById("scrape").addEventListener("click", async () => {
  const scrapeBtn = document.getElementById("scrape");
  const status = document.getElementById("status");
  const progressSection = document.getElementById("progress-section");
  const progressBar = document.getElementById("progress-bar");
  const actionButtons = document.getElementById("action-buttons");
  const metadata = document.getElementById("metadata");
  const output = document.getElementById("output");

  // Show loading state with progress bar
  scrapeBtn.disabled = true;
  scrapeBtn.textContent = "Scraping...";
  status.style.display = "none";
  progressSection.style.display = "block";
  actionButtons.classList.remove("show");
  metadata.style.display = "none";
  output.style.display = "none";

  // Animate progress bar
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15 + 5; // Random increment between 5-20%
    if (progress > 90) progress = 90; // Cap at 90% until completion
    progressBar.style.width = progress + '%';
  }, 200);

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    
    // Store interval for cleanup on completion
    window.currentProgressInterval = progressInterval;
  } catch (error) {
    clearInterval(progressInterval);
    progressSection.style.display = "none";
    status.innerHTML = "Error: Could not access the current page. Make sure you're on a valid webpage.";
    status.style.display = "block";
    scrapeBtn.disabled = false;
    scrapeBtn.textContent = "Scrape & Clean";
  }
});

// Copy to clipboard functionality
document.getElementById("copy").addEventListener("click", async () => {
  if (!currentData) return;
  
  const copyBtn = document.getElementById("copy");
  
  try {
    const textToCopy = formatDataForCopy(currentData);
    await navigator.clipboard.writeText(textToCopy);
    
    copyBtn.classList.add("success");
    
    setTimeout(() => {
      copyBtn.classList.remove("success");
    }, 2000);
  } catch (error) {
    copyBtn.classList.add("error");
    setTimeout(() => {
      copyBtn.classList.remove("error");
    }, 2000);
  }
});

// Download functionality
document.getElementById("download").addEventListener("click", async () => {
  if (!currentData) return;
  
  const downloadBtn = document.getElementById("download");
  
  // Show loading state
  downloadBtn.classList.add("loading");
  downloadBtn.disabled = true;
  
  try {
    const textToDownload = formatDataForCopy(currentData);
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `clean-web-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Show success briefly
    setTimeout(() => {
      downloadBtn.classList.remove("loading");
      downloadBtn.disabled = false;
      downloadBtn.classList.add("success");
      
      setTimeout(() => {
        downloadBtn.classList.remove("success");
      }, 1500);
    }, 800);
    
  } catch (error) {
    console.error('Download failed:', error);
    
    setTimeout(() => {
      downloadBtn.classList.remove("loading");
      downloadBtn.disabled = false;
      downloadBtn.classList.add("error");
      
      setTimeout(() => {
        downloadBtn.classList.remove("error");
      }, 2000);
    }, 500);
  }
});

// Format data for copying
function formatDataForCopy(data) {
  let text = `URL: ${data.url}\n`;
  text += `Title: ${data.title}\n\n`;
  text += `=== METADATA ===\n`;
  text += `Word Count: ${data.metadata.wordCount}\n`;
  text += `Sentence Count: ${data.metadata.sentenceCount}\n`;
  text += `Average Sentence Length: ${data.metadata.avgSentenceLength} words\n`;
  text += `Quality Score: ${data.metadata.qualityScore}\n\n`;
  text += `=== CONTENT ===\n\n`;
  
  data.content.forEach((item, index) => {
    const prefix = item.type === 'heading' ? `# ` : 
                  item.type === 'list-item' ? `• ` : '';
    text += `${prefix}${item.text}\n\n`;
  });
  
  return text;
}

// Helper function to truncate and clean tab titles
function getDisplayTitle(title, url) {
  if (!title || title.trim() === '') {
    // Extract domain from URL as fallback
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return 'Current Page';
    }
  }
  
  // Clean and truncate the title
  const cleanTitle = title.trim();
  if (cleanTitle.length <= 50) {
    return cleanTitle;
  }
  
  return cleanTitle.substring(0, 47) + '...';
}

// Listen for scraped data from content.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'displayScrapedData') {
    const data = message.data;
    currentData = data;
    
    const scrapeBtn = document.getElementById("scrape");
    const progressSection = document.getElementById("progress-section");
    const progressBar = document.getElementById("progress-bar");

    // Complete progress bar animation
    if (window.currentProgressInterval) {
      clearInterval(window.currentProgressInterval);
    }
    
    // Finish progress bar
    progressBar.style.width = '100%';
    
    setTimeout(() => {
      progressSection.style.display = "none";
      
      // Reset scrape button
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = "Scrape & Clean";

      // Get the actual tab title for better display and save to history
      getActualDisplayTitle(data.title, data.url).then(displayTitle => {
        saveToHistory(data);
        displayData(data, displayTitle);
      });
    }, 300);
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// History management functions
async function saveToHistory(data) {
  const historyEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    displayTitle: await getActualDisplayTitle(data.title, data.url),
    data: data
  };
  
  try {
    const result = await chrome.storage.local.get(['scrapedHistory']);
    let history = result.scrapedHistory || [];
    
    // Add new entry to the beginning
    history.unshift(historyEntry);
    
    // Keep only the last 20 entries
    if (history.length > 20) {
      history = history.slice(0, 20);
    }
    
    await chrome.storage.local.set({ 
      scrapedHistory: history,
      currentHistoryId: historyEntry.id
    });
    historyData = history;
    currentHistoryId = historyEntry.id;
    renderHistory();
  } catch (error) {
    console.error('Error saving to history:', error);
  }
}

async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(['scrapedHistory', 'currentHistoryId']);
    historyData = result.scrapedHistory || [];
    currentHistoryId = result.currentHistoryId || null;
    renderHistory();
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

async function clearHistory() {
  try {
    await chrome.storage.local.remove(['scrapedHistory', 'currentHistoryId']);
    historyData = [];
    currentHistoryId = null;
    renderHistory();
    
    // Clear current display if showing history item
    if (currentData) {
      currentData = null;
      document.getElementById("metadata").style.display = "none";
      document.getElementById("output").style.display = "none";
      document.getElementById("action-buttons").classList.remove("show");
    }
    
    // Collapse the window if no data to show
    if (historyData.length === 0 && !currentData) {
      document.body.classList.remove('expanded');
    }
  } catch (error) {
    console.error('Error clearing history:', error);
  }
}

// Helper function to save current history ID to storage
async function saveCurrentHistoryId(id) {
  try {
    await chrome.storage.local.set({ currentHistoryId: id });
    currentHistoryId = id;
  } catch (error) {
    console.error('Error saving current history ID:', error);
  }
}

function renderHistory() {
  const historySection = document.getElementById("history-section");
  const historyList = document.getElementById("history-list");
  const bulkDownloadBtn = document.getElementById("bulk-download");
  
  if (historyData.length === 0) {
    historyList.innerHTML = '<div class="no-history">No scraped pages yet</div>';
    historySection.style.display = "none";
    if (bulkDownloadBtn) bulkDownloadBtn.style.display = "none";
    return;
  }
  
  historySection.style.display = "block";
  if (bulkDownloadBtn) bulkDownloadBtn.style.display = "flex";
  
  let historyHtml = '';
  historyData.forEach((entry) => {
    const timeAgo = getTimeAgo(entry.timestamp);
    const isActive = entry.id === currentHistoryId ? 'active' : '';
    
    historyHtml += `
      <div class="history-item ${isActive}" data-id="${entry.id}">
        <div class="history-info">
          <div class="history-item-title">${escapeHtml(entry.displayTitle)}</div>
          <div class="history-meta">
            <span>${entry.data.metadata.wordCount}w</span>
            <span>${entry.data.metadata.sentenceCount}s</span>
            <span>Q: ${entry.data.metadata.qualityScore}</span>
          </div>
        </div>
        <div class="history-time">${timeAgo}</div>
      </div>
    `;
  });
  
  historyList.innerHTML = historyHtml;
  
  // Add click listeners to history items
  historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      await loadHistoryEntry(id);
    });
  });
}

async function loadHistoryEntry(id) {
  const entry = historyData.find(item => item.id === id);
  if (!entry) return;
  
  currentData = entry.data;
  
  // Save the current selection to storage
  await saveCurrentHistoryId(id);
  
  // Expand the window when loading history
  document.body.classList.add('expanded');

  const content = document.getElementById("content");
  content.style.display = "block";
  
  // Update the display
  displayData(entry.data, entry.displayTitle);
  
  // Update active state in history
  renderHistory();
}

async function getActualDisplayTitle(title, url) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return getDisplayTitle(tab.title, url);
  } catch {
    return getDisplayTitle(title, url);
  }
}

function getTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function displayData(data, displayTitle) {
  const metadata = document.getElementById("metadata");
  const output = document.getElementById("output");
  const actionButtons = document.getElementById("action-buttons");
  const content = document.getElementById("content");
  
  // Expand the window when showing data
  document.body.classList.add('expanded');
  content.style.display = "block";
  
  // Update metadata stats
  document.getElementById("stat-words").textContent = data.metadata.wordCount;
  document.getElementById("stat-sentences").textContent = data.metadata.sentenceCount;
  document.getElementById("stat-avg").textContent = data.metadata.avgSentenceLength;
  document.getElementById("stat-quality").textContent = data.metadata.qualityScore;

  // Display content with better formatting
  let contentHtml = '';
  data.content.forEach((item, index) => {
    const typeLabel = item.type === 'heading' ? `H${item.level}` : 
                     item.type === 'list-item' ? 'LIST' : 'PARA';
    contentHtml += `<div class="content-item">`;
    contentHtml += `<div class="content-type">${typeLabel}</div>`;
    contentHtml += `<div>${escapeHtml(item.text)}</div>`;
    contentHtml += `</div>`;
  });
  
  output.innerHTML = contentHtml;

  // Show elements
  metadata.style.display = "block";
  output.style.display = "block";
  actionButtons.classList.add("show");
}

// Bulk download all history
async function bulkDownloadHistory() {
  if (!historyData || historyData.length === 0) return;
  
  const bulkDownloadBtn = document.getElementById("bulk-download");
  
  // Show loading state
  bulkDownloadBtn.classList.add("loading");
  bulkDownloadBtn.disabled = true;
  
  try {
    let combinedText = `CLEAN WEB - BULK DOWNLOAD\n`;
    combinedText += `Generated: ${new Date().toLocaleString()}\n`;
    combinedText += `Total Items: ${historyData.length}\n`;
    combinedText += `${'='.repeat(80)}\n\n`;
    
    historyData.forEach((entry, index) => {
      const data = entry.data;
      combinedText += `[${index + 1}/${historyData.length}] ${entry.displayTitle}\n`;
      combinedText += `URL: ${data.url}\n`;
      combinedText += `Scraped: ${new Date(entry.timestamp).toLocaleString()}\n`;
      combinedText += `Words: ${data.metadata.wordCount} | Sentences: ${data.metadata.sentenceCount} | Quality: ${data.metadata.qualityScore}\n`;
      combinedText += `${'-'.repeat(40)}\n\n`;
      
      data.content.forEach((item) => {
        const prefix = item.type === 'heading' ? `# ` : 
                     item.type === 'list-item' ? `• ` : '';
        combinedText += `${prefix}${item.text}\n\n`;
      });
      
      combinedText += `\n${'='.repeat(80)}\n\n`;
    });
    
    const blob = new Blob([combinedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `clean-web-bulk-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Show success briefly
    setTimeout(() => {
      bulkDownloadBtn.classList.remove("loading");
      bulkDownloadBtn.disabled = false;
      bulkDownloadBtn.classList.add("success");
      
      setTimeout(() => {
        bulkDownloadBtn.classList.remove("success");
      }, 1500);
    }, 800);
    
  } catch (error) {
    console.error('Bulk download failed:', error);
    
    setTimeout(() => {
      bulkDownloadBtn.classList.remove("loading");
      bulkDownloadBtn.disabled = false;
    }, 500);
  }
}

// Initialize history on popup load
document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  
  // Restore previously selected history item if it exists
  if (currentHistoryId && historyData.find(item => item.id === currentHistoryId)) {
    await loadHistoryEntry(currentHistoryId);
  }
  
  // Check if we should show expanded view (has history or current data)
  if (historyData.length > 0 || currentData) {
    const content = document.getElementById("content");
    content.style.display = "block";
    document.body.classList.add('expanded');
  }
  
  // Add bulk download button listener
  document.getElementById("bulk-download").addEventListener("click", async () => {
    await bulkDownloadHistory();
  });
  
  // Add clear history button listener
  document.getElementById("clear-history").addEventListener("click", async () => {
    if (confirm("Clear all history? This cannot be undone.")) {
      await clearHistory();
      
      // If no history left, collapse the window
      if (historyData.length === 0 && !currentData) {
        document.body.classList.remove('expanded');
        const content = document.getElementById("content");
        content.style.display = "none";
      }
    }
  });
});