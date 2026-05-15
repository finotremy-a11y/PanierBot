import { chromium } from 'playwright';

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        let page;
        
        for (const context of contexts) {
            const pages = context.pages();
            page = pages.find(p => p.url().includes('intermarche.com'));
            if (page) break;
        }

        if (!page) {
            console.log('Intermarché page not found, opening new one...');
            const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
            page = await context.newPage();
            await page.goto('https://www.intermarche.com', { waitUntil: 'domcontentloaded' });
        } else {
            console.log('Found existing Intermarché page.');
            await page.bringToFront();
            await page.waitForLoadState('domcontentloaded');
        }

        const url = page.url();
        const title = await page.title();
        const bodyText = await page.innerText('body');
        
        console.log('URL:', url);
        console.log('Title:', title);
        console.log('Body length:', bodyText.length);

        const antiBotKeywords = ['just a moment', 'captcha', 'enable js', 'datadome'];
        const foundKeywords = antiBotKeywords.filter(kw => bodyText.toLowerCase().includes(kw));
        console.log('Anti-bot keywords found:', foundKeywords);

        const inputs = await page.evaluate(() => {
            const allInputs = Array.from(document.querySelectorAll('input:visible, [role="textbox"]:visible'));
            return allInputs.slice(0, 30).map(el => ({
                name: el.getAttribute('name'),
                id: el.id,
                placeholder: el.getAttribute('placeholder'),
                ariaLabel: el.getAttribute('aria-label'),
                dataTestId: el.getAttribute('data-testid'),
                type: el.getAttribute('type')
            }));
        });
        console.log('Inputs found (first 30):', JSON.stringify(inputs, null, 2));

        const buttonsLinks = await page.evaluate(() => {
            const keywords = ['magasin', 'drive', 'choisir', 'courses', 'commencer'];
            const elements = Array.from(document.querySelectorAll('button:visible, a:visible'));
            const matches = elements.filter(el => {
                const text = (el.innerText || '').toLowerCase();
                return keywords.some(kw => text.includes(kw));
            });
            return matches.slice(0, 40).map(el => ({
                tag: el.tagName,
                text: el.innerText.trim().substring(0, 50),
                id: el.id,
                className: el.className
            }));
        });
        console.log('Buttons/Links found (first 40):', JSON.stringify(buttonsLinks, null, 2));

        await browser.close();
    } catch (error) {
        console.error('Error:', error);
    }
})();
