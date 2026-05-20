import { chromium } from 'playwright';

async function run() {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    let targetPage = null;
    for (const context of contexts) {
      const pages = context.pages();
      for (const page of pages) {
        if (page.url().includes('fd4-courses.leclercdrive.fr')) {
          targetPage = page;
          break;
        }
      }
      if (targetPage) break;
    }

    if (!targetPage) {
      console.log('No Leclerc catalog page found on fd4-courses.leclercdrive.fr');
      await browser.close();
      return;
    }

    console.log(`URL: ${targetPage.url()}`);
    console.log(`Title: ${await targetPage.title()}`);

    const searchInputs = await targetPage.locator('input[type="search"], input[placeholder*="rechercher" i], input[placeholder*="search" i]').all();
    console.log('\nVisible Search Inputs:');
    for (const input of searchInputs) {
      if (await input.isVisible()) {
        const placeholder = await input.getAttribute('placeholder');
        const id = await input.getAttribute('id');
        console.log(`- ID: ${id}, Placeholder: ${placeholder}`);
      }
    }

    const selectors = ['article', 'li', 'div', 'button', 'a'];
    const candidates = await targetPage.locator(selectors.join(', ')).evaluateAll(elements => {
      const results = [];
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
        if (!isVisible) continue;

        const text = el.innerText || '';
        const hasEuro = text.includes('€');
        const productKeywords = ['g', 'kg', 'l', 'ml', 'cl', 'x', 'unit', 'pièce'];
        const hasProductText = productKeywords.some(kw => new RegExp(`\\s\\d+\\s*${kw}(\\s|$)`, 'i').test(text));

        if (hasEuro || hasProductText) {
          results.push({
            tag: el.tagName.toLowerCase(),
            classes: el.className,
            testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id'),
            productId: el.getAttribute('data-product-id') || el.getAttribute('data-id'),
            text: text.replace(/\n/g, ' ').slice(0, 100).trim()
          });
        }
        if (results.length >= 10) break;
      }
      return results;
    });

    console.log('\nFirst 10 Product-like Elements:');
    candidates.forEach((c, i) => {
      console.log(`${i + 1}. [${c.tag}] classes: "${c.classes}", testid: "${c.testid}", productId: "${c.productId}"`);
      console.log(`   Snippet: "${c.text}"`);
    });

    await browser.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
