let currentData = null;

document.getElementById("scrape").addEventListener("click", async () => {
  const scrapeBtn = document.getElementById("scrape");
  const status = document.getElementById("status");
  const copyBtn = document.getElementById("copy");
  const metadata = document.getElementById("metadata");
  const output = document.getElementById("output");

  // Show loading state
  scrapeBtn.disabled = true;
  scrapeBtn.textContent = "Scraping...";
  status.innerHTML = '<div class="loading">🔄 Extracting and cleaning content...</div>';
  copyBtn.style.display = "none";
  metadata.style.display = "none";
  output.style.display = "none";

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (error) {
    status.textContent = "❌ Error: Could not access the current page. Make sure you're on a valid webpage.";
    scrapeBtn.disabled = false;
    scrapeBtn.textContent = "Scrape & Clean";
  }
});

// Copy to clipboard functionality
document.getElementById("copy").addEventListener("click", async () => {
  if (!currentData) return;
  
  const copyBtn = document.getElementById("copy");
  const originalText = copyBtn.textContent;
  
  try {
    const textToCopy = formatDataForCopy(currentData);
    await navigator.clipboard.writeText(textToCopy);
    
    copyBtn.textContent = "✅ Copied!";
    copyBtn.style.background = "#27ae60";
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = "#27ae60";
    }, 2000);
  } catch (error) {
    copyBtn.textContent = "❌ Failed";
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
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

// Listen for scraped data from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'displayScrapedData') {
    const data = message.data;
    currentData = data;
    
    const scrapeBtn = document.getElementById("scrape");
    const status = document.getElementById("status");
    const copyBtn = document.getElementById("copy");
    const metadata = document.getElementById("metadata");
    const output = document.getElementById("output");

    // Reset scrape button
    scrapeBtn.disabled = false;
    scrapeBtn.textContent = "Scrape & Clean";

    // Show success status
    status.innerHTML = `✅ Successfully extracted content from:<br><strong>${data.title}</strong>`;

    // Display metadata in grid
    metadata.innerHTML = `
      <div>
        <div class="label">Words</div>
        <div class="value">${data.metadata.wordCount}</div>
      </div>
      <div>
        <div class="label">Sentences</div>
        <div class="value">${data.metadata.sentenceCount}</div>
      </div>
      <div>
        <div class="label">Avg Length</div>
        <div class="value">${data.metadata.avgSentenceLength}</div>
      </div>
      <div>
        <div class="label">Quality</div>
        <div class="value">${data.metadata.qualityScore}</div>
      </div>
    `;

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
    metadata.style.display = "grid";
    output.style.display = "block";
    copyBtn.style.display = "block";
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}