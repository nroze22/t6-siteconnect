import { chromium } from 'playwright';

const SCREENSHOT_DIR = './docs/screenshots';
const BASE_URL = 'http://localhost:1420';

async function dismissOverlays(page) {
  // Force remove all high z-index overlays via DOM
  await page.evaluate(() => {
    document.querySelectorAll('[class*="fixed"][class*="inset-0"]').forEach(el => {
      const z = window.getComputedStyle(el).zIndex;
      if (parseInt(z) > 100) el.remove();
    });
    // Also remove any backdrop-blur overlays
    document.querySelectorAll('[class*="backdrop-blur"]').forEach(el => {
      if (el.classList.contains('fixed') || el.closest('.fixed')) {
        const parent = el.closest('.fixed') || el;
        parent.remove();
      }
    });
  });
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture the onboarding screen
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-onboarding.png`, fullPage: false });
  console.log('Captured: onboarding');

  // Skip onboarding by clicking "Skip for now"
  try {
    await page.click('text=Skip for now', { timeout: 3000 });
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log('No skip button found, trying to dismiss overlays');
  }

  // Force dismiss ALL overlays
  await dismissOverlays(page);
  await page.waitForTimeout(500);

  // Also try localStorage to mark onboarding as complete
  await page.evaluate(() => {
    localStorage.setItem('onboarding-complete', 'true');
    localStorage.setItem('site-onboarding-complete', 'true');
    localStorage.setItem('welcome-dismissed', 'true');
  });

  // Reload to get clean state without overlays
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await dismissOverlays(page);
  await page.waitForTimeout(500);

  // Now capture dashboard
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-dashboard.png`, fullPage: false });
  console.log('Captured: dashboard');

  const pages = [
    { name: 'screening', label: 'Screening', index: '03' },
    { name: 'import', label: 'Import', index: '04' },
    { name: 'trials', label: 'Trial Discovery', index: '05' },
    { name: 'review', label: 'Review', index: '06' },
    { name: 'pipeline', label: 'Pipeline', index: '07' },
    { name: 'analytics', label: 'Analytics', index: '08' },
    { name: 'cohort', label: 'Cohort', index: '09' },
    { name: 'intelligence', label: 'Intelligence', index: '10' },
    { name: 'performance', label: 'Performance', index: '11' },
    { name: 'settings', label: 'Settings', index: '12' },
  ];

  for (const pg of pages) {
    try {
      // Force dismiss overlays before each navigation
      await dismissOverlays(page);

      // Navigate by dispatching custom event or clicking sidebar
      // Use evaluate to find and click sidebar buttons by text
      const clicked = await page.evaluate((label) => {
        // Find sidebar items by their text content
        const allElements = document.querySelectorAll('aside button, aside a, nav button, nav a, [role="navigation"] button');
        for (const el of allElements) {
          if (el.textContent.includes(label)) {
            el.click();
            return true;
          }
        }
        // Also try any element with the label text
        const byText = document.querySelectorAll('button, a, [role="button"]');
        for (const el of byText) {
          if (el.textContent.trim().startsWith(label) && el.closest('aside, nav, [role="navigation"]')) {
            el.click();
            return true;
          }
        }
        return false;
      }, pg.label);

      if (!clicked) {
        // Try keyboard shortcut as fallback
        const keyMap = {
          'screening': '1', 'import': '2', 'trials': '3', 'review': '4',
          'pipeline': '5', 'analytics': '6', 'cohort': '7',
          'intelligence': '8', 'performance': '9', 'settings': '0'
        };
        // Blur any focused element first
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press(keyMap[pg.name]);
      }

      await page.waitForTimeout(1500);
      await dismissOverlays(page);
      await page.waitForTimeout(300);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/${pg.index}-${pg.name}.png`,
        fullPage: false
      });
      console.log(`Captured: ${pg.name}`);
    } catch (e) {
      console.log(`Failed ${pg.name}: ${e.message?.slice(0, 100)}`);
    }
  }

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/screenshots/');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
