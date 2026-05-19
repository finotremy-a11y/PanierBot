import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = defaultContext.pages()[0] || await defaultContext.newPage();

    try {
        await page.goto('https://www.coursesu.com/recherche?q=p%C3%A2tes', { waitUntil: 'networkidle' });

        const getCartCount = async () => {
            const el = await page.locator('.mini-cart__count').first();
            if (await el.isVisible()) {
                return (await el.innerText()).trim();
            }
            return 'not found';
        };

        const snapshotBefore = await getCartCount();

        // Click on the first product's add to bag button
        const addButton = page.locator('.product-button__bag').first();
        await addButton.waitFor({ state: 'visible' });
        await addButton.click();

        // Wait 2s
        await new Promise(resolve => setTimeout(resolve, 2000));

        const snapshotAfter = await getCartCount();

        const counts = {
            product_button_qty: await page.locator('.product-button__qty').count(),
            product_button_container: await page.locator('.product-button__container').count(),
            product_button_dec: await page.locator('.product-button__dec').count(),
            product_button_inc: await page.locator('.product-button__inc').count()
        };

        const ariaLabels = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            return elements
                .map(el => el.getAttribute('aria-label'))
                .filter(label => label && (label.toLowerCase().includes('panier') || label.toLowerCase().includes('quantité')))
                .slice(0, 20);
        });

        console.log(JSON.stringify({
            counts,
            snapshotSuperUCartCount: { before: snapshotBefore, after: snapshotAfter },
            ariaLabels
        }, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // Not closing browser as it's a remote connection
    }
})();
