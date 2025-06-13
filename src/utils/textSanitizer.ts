/**
 * Sanitizes HTML content to plain text by removing HTML tags and decoding HTML entities
 * Preserves list formatting by converting to plain text bullets
 */
export function sanitizeHtmlToText(html: string): string {
  if (!html) return '';
  
  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Convert lists to plain text with bullets before getting text content
  const listItems = tempDiv.querySelectorAll('li');
  listItems.forEach(li => {
    const bullet = document.createTextNode('• ');
    const lineBreak = document.createTextNode('\n');
    li.insertBefore(bullet, li.firstChild);
    li.appendChild(lineBreak);
  });
  
  // Convert ordered list items to numbered format
  const orderedLists = tempDiv.querySelectorAll('ol');
  orderedLists.forEach(ol => {
    const items = ol.querySelectorAll('li');
    items.forEach((li, index) => {
      // Remove the bullet we added earlier for ordered lists
      if (li.firstChild && li.firstChild.textContent === '• ') {
        li.removeChild(li.firstChild);
      }
      const number = document.createTextNode(`${index + 1}. `);
      li.insertBefore(number, li.firstChild);
    });
  });
  
  // Add line breaks after block elements
  const blockElements = tempDiv.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, ul, ol, li, br');
  blockElements.forEach(element => {
    if (element.tagName !== 'LI') { // Don't add extra breaks for list items
      const lineBreak = document.createTextNode('\n');
      element.appendChild(lineBreak);
    }
  });
  
  // Get text content (automatically handles HTML entity decoding)
  let text = tempDiv.textContent || tempDiv.innerText || '';
  
  // Clean up extra whitespace but preserve single line breaks
  text = text.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Replace multiple line breaks with double
  text = text.trim();
  
  return text;
}

/**
 * Truncates text to a specified length and adds ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  
  const sanitized = sanitizeHtmlToText(text);
  
  if (sanitized.length <= maxLength) {
    return sanitized;
  }
  
  return sanitized.substring(0, maxLength).trim() + '...';
}

/**
 * Sanitizes and truncates HTML content for display
 */
export function sanitizeAndTruncate(html: string, maxLength: number): string {
  return truncateText(html, maxLength);
} 