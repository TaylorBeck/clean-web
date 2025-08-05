(function() {
// Helper to check if an element is visible
function isVisible(element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    !element.hasAttribute('aria-hidden') &&
    element.getBoundingClientRect().height > 0
  );
}

// Helper to clean and normalize text
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/(\n|\r)+/g, ' ') // Remove newlines
    .replace(/[“”]/g, '"') // Normalize quotes
    .replace(/[‘’]/g, "'") // Normalize apostrophes
    .replace(/[^\w\s.,!?]/g, '') // Remove special characters (keep basic punctuation)
    .replace(/\s+/g, ' ') // Re-normalize after replacements
    .trim();
}

// Helper to detect boilerplate phrases
const boilerplatePhrases = [
  'subscribe now',
  'all rights reserved',
  'cookie policy',
  'terms of service',
  'follow us',
  'sign up for our newsletter',
];

// Helper to score text blocks for relevance (higher is better)
function scoreTextBlock(element) {
  const textLength = element.innerText.length;
  const linkCount = element.querySelectorAll('a').length;
  const imageCount = element.querySelectorAll('img').length;
  const tagName = element.tagName.toLowerCase();
  const isMainContent = element.closest('main, article, [role="main"]') !== null;

  let score = textLength / 100; // Base score on length
  if (isMainContent) score += 2; // Boost for main content areas
  if (tagName === 'p' || tagName.match(/^h[1-3]$/)) score += 1; // Boost for paragraphs and headings
  if (linkCount > textLength / 50) score -= 2; // Penalize link-heavy blocks
  if (imageCount > 0) score -= 1; // Penalize image-heavy blocks
  if (element.closest('nav, footer, aside, .ad, .cookie, .banner')) score -= 3; // Penalize boilerplate areas

  return score;
}

// Helper to segment text into sentences (basic, no external library)
function segmentSentences(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => cleanText(s)).filter(s => s.length > 10); // Filter short sentences
}

// Main content extraction function
function extractMainContent() {
  const content = [];
  const elements = document.body.querySelectorAll('p, h1, h2, h3, li, article, section, div');
  const textBlocks = Array.from(elements)
    .filter(el => isVisible(el) && el.innerText && scoreTextBlock(el) > 0)
    .sort((a, b) => scoreTextBlock(b) - scoreTextBlock(a)) // Sort by relevance
    .slice(0, 50); // Limit to top 50 elements to avoid noise

  for (const el of textBlocks) {
    const text = cleanText(el.innerText);
    if (!text || text.length < 30) continue; // Skip short fragments
    if (boilerplatePhrases.some(phrase => text.toLowerCase().includes(phrase))) continue; // Skip boilerplate

    const type = el.tagName.toLowerCase() === 'li' ? 'list-item' : 
                 el.tagName.toLowerCase().match(/^h[1-3]$/) ? 'heading' : 'paragraph';
    const level = type === 'heading' ? parseInt(el.tagName[1]) : undefined;
    
    // Segment into sentences for coherence
    const sentences = segmentSentences(text);
    if (sentences.length === 0) continue;

    content.push({
      type,
      level,
      text: sentences.join(' '),
    });
  }

  return content;
}

// Quality metrics for the extracted content
function computeQualityMetrics(content) {
  const allText = content.map(item => item.text).join(' ');
  const words = allText.split(/\s+/).filter(Boolean);
  const sentences = segmentSentences(allText);
  const avgSentenceLength = sentences.length ? words.length / sentences.length : 0;
  const punctuationRatio = (allText.match(/[.,!?]/g) || []).length / words.length;

  // Basic quality score (0-1)
  let qualityScore = 1;
  if (avgSentenceLength < 5 || avgSentenceLength > 50) qualityScore -= 0.3; // Penalize extreme sentence lengths
  if (punctuationRatio < 0.05 || punctuationRatio > 0.5) qualityScore -= 0.2; // Penalize odd punctuation
  if (content.length < 3) qualityScore -= 0.2; // Penalize very short content

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: avgSentenceLength.toFixed(1),
    qualityScore: Math.max(0, qualityScore).toFixed(2),
  };
}

// Main execution
const cleanedData = {
  url: window.location.href,
  title: cleanText(document.title),
  content: extractMainContent(),
  metadata: computeQualityMetrics(extractMainContent()),
};

// Send data to popup.js for display
chrome.runtime.sendMessage({
  action: 'displayScrapedData',
  data: cleanedData,
});

// Log for debugging
console.log('Cleaned Data:', cleanedData);

})(); // End of IIFE