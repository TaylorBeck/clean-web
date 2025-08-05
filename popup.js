// DOM element cache
const elements = {
  scrape: document.getElementById("scrape"),
  copy: document.getElementById("copy"),
  download: document.getElementById("download"),
  bulkDownload: document.getElementById("bulk-download"),
  clearHistory: document.getElementById("clear-history"),
  status: document.getElementById("status"),
  progressSection: document.getElementById("progress-section"),
  progressBar: document.getElementById("progress-bar"),
  actionButtons: document.getElementById("action-buttons"),
  metadata: document.getElementById("metadata"),
  output: document.getElementById("output"),
  content: document.getElementById("content"),
  historySection: document.getElementById("history-section"),
  historyList: document.getElementById("history-list"),
  statWords: document.getElementById("stat-words"),
  statSentences: document.getElementById("stat-sentences"),
  statAvg: document.getElementById("stat-avg"),
  statQuality: document.getElementById("stat-quality")
};

let currentData = null;
let historyData = [];
let currentHistoryId = null;

// Utility Functions
const ButtonStateManager = {
  setState(button, state, duration = 0) {
    // Remove all states
    button.classList.remove("loading", "success", "error");
    button.disabled = false;
    
    if (state === "loading") {
      button.classList.add("loading");
      button.disabled = true;
    } else if (state === "success" || state === "error") {
      button.classList.add(state);
      if (duration > 0) {
        setTimeout(() => {
          button.classList.remove(state);
        }, duration);
      }
    }
  }
};

const UIManager = {
  showElements(...elements) {
    elements.forEach(el => el.style.display = "block");
  },
  
  hideElements(...elements) {
    elements.forEach(el => el.style.display = "none");
  },
  
  toggleExpanded(expand) {
    document.body.classList.toggle('expanded', expand);
    elements.content.style.display = expand ? "block" : "none";
  },
  
  showActionButtons() {
    elements.actionButtons.classList.add("show");
  },
  
  hideActionButtons() {
    elements.actionButtons.classList.remove("show");
  }
};

const StorageManager = {
  async get(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.error('Storage get error:', error);
      return {};
    }
  },
  
  async set(data) {
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  },
  
  async remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }
};

// Progress bar animation helper
function animateProgressBar() {
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5;
    if (progress > 90) progress = 90;
    elements.progressBar.style.width = progress + '%';
  }, 200);
  
  return {
    complete() {
      clearInterval(interval);
      elements.progressBar.style.width = '100%';
    }
  };
}

// Event Handlers
async function handleScrape() {
  elements.scrape.disabled = true;
  elements.scrape.textContent = "Scraping...";
  UIManager.hideElements(elements.status);
  UIManager.showElements(elements.progressSection);
  UIManager.hideActionButtons();
  UIManager.hideElements(elements.metadata, elements.output);

  const progressAnimation = animateProgressBar();
  window.currentProgressInterval = progressAnimation; // For cleanup on completion

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (error) {
    progressAnimation.complete();
    UIManager.hideElements(elements.progressSection);
    elements.status.innerHTML = "Error: Could not access the current page. Make sure you're on a valid webpage.";
    UIManager.showElements(elements.status);
    elements.scrape.disabled = false;
    elements.scrape.textContent = "Scrape & Clean";
  }
}

async function handleCopy() {
  if (!currentData) return;
  
  ButtonStateManager.setState(elements.copy, "loading");
  
  try {
    const textToCopy = formatDataForCopy(currentData);
    await navigator.clipboard.writeText(textToCopy);
    ButtonStateManager.setState(elements.copy, "success", 2000);
  } catch (error) {
    ButtonStateManager.setState(elements.copy, "error", 2000);
  }
}

async function handleDownload() {
  if (!currentData) return;
  
  ButtonStateManager.setState(elements.download, "loading");
  
  try {
    const textToDownload = formatDataForCopy(currentData);
    downloadFile(textToDownload, `scrape-${new Date().toISOString().slice(0, 10)}.txt`);
    
    setTimeout(() => {
      ButtonStateManager.setState(elements.download, "success", 1500);
    }, 800);
  } catch (error) {
    console.error('Download failed:', error);
    setTimeout(() => {
      ButtonStateManager.setState(elements.download, "error", 2000);
    }, 500);
  }
}

async function handleBulkDownload() {
  if (!historyData?.length) return;
  
  ButtonStateManager.setState(elements.bulkDownload, "loading");
  
  try {
    const combinedText = generateBulkDownloadText();
    downloadFile(combinedText, `scrapes-${new Date().toISOString().slice(0, 10)}.txt`);
    
    setTimeout(() => {
      ButtonStateManager.setState(elements.bulkDownload, "success", 1500);
    }, 800);
  } catch (error) {
    console.error('Bulk download failed:', error);
    setTimeout(() => {
      ButtonStateManager.setState(elements.bulkDownload, "");
    }, 500);
  }
}

async function handleClearHistory() {
  if (!confirm("Clear all history? This cannot be undone.")) return;
  
  await StorageManager.remove(['scrapedHistory', 'currentHistoryId']);
  historyData = [];
  currentHistoryId = null;
  renderHistory();
  
  if (currentData) {
    currentData = null;
    UIManager.hideElements(elements.metadata, elements.output);
    UIManager.hideActionButtons();
  }
  
  if (historyData.length === 0 && !currentData) {
    UIManager.toggleExpanded(false);
  }
}

// Helper Functions
function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateBulkDownloadText() {
  let text = `BULK-\n`;
  text += `Generated: ${new Date().toLocaleString()}\n`;
  text += `Total Items: ${historyData.length}\n`;
  text += `${'='.repeat(80)}\n\n`;
  
  historyData.forEach((entry, index) => {
    const data = entry.data;
    text += `[${index + 1}/${historyData.length}] ${entry.displayTitle}\n`;
    text += `URL: ${data.url}\n`;
    text += `Scraped: ${new Date(entry.timestamp).toLocaleString()}\n`;
    text += `Words: ${data.metadata.wordCount} | Sentences: ${data.metadata.sentenceCount} | Quality: ${data.metadata.qualityScore}\n`;
    text += `${'-'.repeat(40)}\n\n`;
    
    data.content.forEach((item) => {
      const prefix = item.type === 'heading' ? `# ` : 
                   item.type === 'list-item' ? `• ` : '';
      text += `${prefix}${item.text}\n\n`;
    });
    
    text += `\n${'='.repeat(80)}\n\n`;
  });
  
  return text;
}

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
  
  const result = await StorageManager.get(['scrapedHistory']);
  let history = result.scrapedHistory || [];
  
  // Add new entry to the beginning
  history.unshift(historyEntry);
  
  // Keep only the last 20 entries
  if (history.length > 20) {
    history = history.slice(0, 20);
  }
  
  await StorageManager.set({ 
    scrapedHistory: history,
    currentHistoryId: historyEntry.id
  });
  historyData = history;
  currentHistoryId = historyEntry.id;
  renderHistory();
}

async function loadHistory() {
  const result = await StorageManager.get(['scrapedHistory', 'currentHistoryId']);
  historyData = result.scrapedHistory || [];
  currentHistoryId = result.currentHistoryId || null;
  renderHistory();
}

// Helper function to save current history ID to storage
async function saveCurrentHistoryId(id) {
  await StorageManager.set({ currentHistoryId: id });
  currentHistoryId = id;
}

function renderHistory() {
  const bulkDownloadBtn = elements.bulkDownload;
  
  if (historyData.length === 0) {
    elements.historyList.innerHTML = '<div class="no-history">No scraped pages yet</div>';
    elements.historySection.style.display = "none";
    if (bulkDownloadBtn) bulkDownloadBtn.style.display = "none";
    return;
  }
  
  elements.historySection.style.display = "block";
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
  
  elements.historyList.innerHTML = historyHtml;
  
  // Add click listeners to history items
  elements.historyList.querySelectorAll('.history-item').forEach(item => {
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
  UIManager.toggleExpanded(true);
  
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
  UIManager.toggleExpanded(true);
  
  // Update metadata stats
  elements.statWords.textContent = data.metadata.wordCount;
  elements.statSentences.textContent = data.metadata.sentenceCount;
  elements.statAvg.textContent = data.metadata.avgSentenceLength;
  elements.statQuality.textContent = data.metadata.qualityScore;

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
  
  elements.output.innerHTML = contentHtml;

  // Show elements
  UIManager.showElements(elements.metadata, elements.output);
  UIManager.showActionButtons();
}

// Message listener
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'displayScrapedData') {
    const data = message.data;
    currentData = data;

    // Complete progress bar animation
    if (window.currentProgressInterval) {
      window.currentProgressInterval.complete();
    }
    
    setTimeout(() => {
      UIManager.hideElements(elements.progressSection);
      
      // Reset scrape button
      elements.scrape.disabled = false;
      elements.scrape.textContent = "Scrape & Clean";

      // Get the actual tab title for better display and save to history
      getActualDisplayTitle(data.title, data.url).then(displayTitle => {
        saveToHistory(data);
        displayData(data, displayTitle);
      });
    }, 300);
  }
});

// Initialize history and event listeners on popup load
document.addEventListener('DOMContentLoaded', async () => {
  await loadHistory();
  
  // Restore previously selected history item if it exists
  if (currentHistoryId && historyData.find(item => item.id === currentHistoryId)) {
    await loadHistoryEntry(currentHistoryId);
  }
  
  // Check if we should show expanded view (has history or current data)
  if (historyData.length > 0 || currentData) {
    UIManager.toggleExpanded(true);
  }
  
  // Add all event listeners
  elements.scrape.addEventListener("click", handleScrape);
  elements.copy.addEventListener("click", handleCopy);
  elements.download.addEventListener("click", handleDownload);
  elements.bulkDownload.addEventListener("click", handleBulkDownload);
  elements.clearHistory.addEventListener("click", handleClearHistory);
});