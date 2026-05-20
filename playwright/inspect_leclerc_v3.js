const { chromium } = require('playwright');

async function run() {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
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
      return;
    }

    const info = await targetPage.evaluate(() => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        return style && style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      };

      const inputs = Array.from(document.querySelectorAll('input'))
        .filter(isVisible)
        .map(i => ({
          type: i.type,
          placeholder: i.placeholder,
          name: i.name,
          id: i.id
        }));

      const productLikeElements = Array.from(document.querySelectorAll('article, li, div, button, a'))
        .filter(el => {
          if (!isVisible(el)) return false;
          const text = el.innerText || '';
          return (text.includes('€') || /[0-9]+,[0-9]{2}/.test(text));
        })
        .slice(0, 15)
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          classes: el.className,
          testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '',
          productId: el.getAttribute('data-product-id') || el.getAttribute('data-id') || '',
          text: (el.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 100)
        }));

      return {
        url: window.location.href,
        title: document.title,
        inputs,
        productLikeElements
      };
    });

    console.log(`URL: ${info.url}`);
    console.log(`Title: ${info.title}`);
    console.log('\nVisible Inputs:');
    info.inputs.forEach(i => console.log(`  - Type: ${i.type}, Name: ${i.name}, ID: ${i.id}, Placeholder: ${i.placeholder}`));
    
    console.log('\nProduct-like Elements (First 15):');
    info.productLikeElements.forEach((el, index) => {
      console.log(`${index + 1}. Tag: ${el.tag}`);
      console.log(`   Classes: ${el.classes}`);
      console.log(`   IDs: TestID="${el.testid}", ProductID="${el.productId}"`);
      console.log(`   Text: ${el.text}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (browser) await browser.close();
  }
}

run();
