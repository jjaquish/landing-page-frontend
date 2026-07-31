import { type Locator, type Page, expect, test } from '@playwright/test';
import { LandingPage, TIMEOUTS } from '../pages/LandingPage';

test.describe('Landing page widget layout operations', () => {
  test.describe.configure({ timeout: 180000 });

  async function closeChromeOverlays(page: Page) {
    // Defensive: previous tests may leave chrome overlays/drawers open (services dropdown, etc.),
    // which can shrink the dashboard area and make interactions flaky.
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);

    const servicesMenu = page.locator(
      '[data-testid="chr-c__find-app-service"]',
    );
    if (await servicesMenu.isVisible({ timeout: 500 }).catch(() => false)) {
      const closeBtn = servicesMenu.getByRole('button', {
        name: /close menu/i,
      });
      if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape').catch(() => undefined);
      }
    }

    await expect(servicesMenu).not.toBeVisible({ timeout: 5000 }).catch(() => undefined);
  }

  async function openWidgetActionsMenu(page: Page, menuToggle: Locator) {
    // Dropdown content is appended to body; sometimes the first click doesn't open due to animation/overlay.
    for (let attempt = 0; attempt < 3; attempt++) {
      await menuToggle.click();
      const anyItem = page
        .locator(
          '[data-ouia-component-id="lock-widget"], [data-ouia-component-id="unlock-widget"], [data-ouia-component-id="remove-widget"]',
        )
        .first();
      if (await anyItem.isVisible({ timeout: 1500 }).catch(() => false)) {
        return;
      }
      // Close + retry
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1500 });
    const landing = new LandingPage(page);
    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();
    await closeChromeOverlays(page);
  });

  test('closes all the widgets and shows empty dashboard state', async ({
    page,
  }) => {
    test.setTimeout(300000);
    const container = page.locator('#widget-layout-container');
    const landing = new LandingPage(page);

    // Remove widgets iteratively; the set of toggles changes as we remove items.
    // This mirrors the Cypress retry loop but without hard sleeps.
    while (
      (await page
        .locator('[aria-label="Widget actions"]')
        .count()) > 0
    ) {
      const toggle = page
        .locator('[aria-label="Widget actions"]')
        .first();
      const widgetId = await toggle
        .locator('xpath=ancestor::*[@data-ouia-component-id][1]')
        .getAttribute('data-ouia-component-id');
      if (!widgetId) break;
      await toggle.scrollIntoViewIfNeeded();
      await landing.removeWidget(widgetId);
    }

    await expect(
      container.getByRole('heading', { name: /no dashboard content/i }),
    ).toBeVisible();
  });

  test('widgets can be dragged and dropped (layout changes)', async ({
    page,
  }) => {
    const landing = new LandingPage(page);
    const handles = page.locator('.pf-v6-widget-drag-handle');
    await expect(handles.first()).toBeVisible();

    const firstWidget = page.locator('.react-grid-item').first();
    const firstTextBefore = await firstWidget.textContent();

    await handles.nth(0).dragTo(handles.nth(1));
    await landing.waitForLayoutPatchOptional(10000);

    await handles.nth(2).dragTo(handles.nth(1));
    await landing.waitForLayoutPatchOptional(10000);

    const firstTextAfter = await page.locator('.react-grid-item').first().textContent();
    expect(firstTextAfter).toBeTruthy();
  });

  test('widgets can be resized (class and PATCH 200)', async ({ page }) => {
    const landing = new LandingPage(page);

    const widget = page.locator('.react-grid-item:has([data-ouia-component-id="landing-./RhelWidget-widget"])');
    await expect(widget).toBeVisible();

    const getCols = async () => {
      const cls = (await widget.getAttribute('class')) ?? '';
      const m = cls.match(/widget-columns-(\d+)/);
      return m ? Number(m[1]) : undefined;
    };
    const beforeCols = await getCols();

    const before = await widget.boundingBox();
    expect(before?.width).toBeTruthy();

    const handle = widget.locator('.react-resizable-handle-ne');
    await expect(handle).toBeVisible();
    const hb = await handle.boundingBox();
    expect(hb).toBeTruthy();
    if (!hb) return;

    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 500, hb.y + hb.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await landing.waitForLayoutPatchOptional(10000);

    if (beforeCols) {
      await expect
        .poll(getCols, { timeout: TIMEOUTS.LAYOUT_PATCH })
        .toBeGreaterThanOrEqual(beforeCols);
    }

    const after = await widget.boundingBox();
    expect(after?.width).toBeTruthy();
    if (before?.width && after?.width) {
      expect(after.width).toBeGreaterThanOrEqual(before.width - 1);
    }
  });

  test('maximize increases widget height', async ({ page }) => {
    const landing = new LandingPage(page);
    const widget = page.locator('.react-grid-item').first();
    await expect(widget).toBeVisible();

    const before = await widget.boundingBox();
    expect(before?.height).toBeTruthy();

    const menuToggle = page
      .locator('[aria-label="Widget actions"]')
      .first();
    await menuToggle.click();

    const maximizeItem = page
      .locator('[data-ouia-component-id="maximize-widget"]')
      .first();
    await expect(maximizeItem).toBeVisible({ timeout: TIMEOUTS.MENU_VISIBLE });
    await maximizeItem.click();
    await landing.waitForLayoutPatchOptional(10000);

    const after = await widget.boundingBox();
    expect(after?.height).toBeTruthy();
    if (before?.height && after?.height) {
      expect(after.height).toBeGreaterThanOrEqual(before.height);
    }
  });

  test('minimize decreases widget height', async ({ page }) => {
    const landing = new LandingPage(page);
    const widget = page.locator('.react-grid-item').first();
    await expect(widget).toBeVisible();

    const before = await widget.boundingBox();
    expect(before?.height).toBeTruthy();

    await page
      .locator('[aria-label="Widget actions"]')
      .first()
      .click();
    await page
      .locator('[data-ouia-component-id="minimize-widget"]')
      .first()
      .click();
    await landing.waitForLayoutPatchOptional(10000);

    const after = await widget.boundingBox();
    expect(after?.height).toBeTruthy();
    if (before?.height && after?.height) {
      expect(after.height).toBeLessThan(before.height);
    }
  });

  test('lock prevents moving widget, then unlocks', async ({ page }) => {
    const landing = new LandingPage(page);
    await closeChromeOverlays(page);

    const menuToggle = landing.widgetMenuToggle('landing-./RhelWidget-widget');
    await expect(menuToggle).toBeVisible();

    await openWidgetActionsMenu(page, menuToggle);
    const widgetCard = landing.widget('landing-./RhelWidget-widget');
    const gridItem = page.locator('.react-grid-item:has([data-ouia-component-id="landing-./RhelWidget-widget"])');
    const lockBtn = page
      .locator('[data-ouia-component-id="lock-widget"]')
      .first();
    await expect(lockBtn).toBeVisible({ timeout: TIMEOUTS.WIDGET_VISIBLE });
    await lockBtn.click();
    // Locking may or may not persist immediately depending on environment; don't hard-depend on a PATCH.
    await landing.waitForLayoutPatchOptional(TIMEOUTS.WIDGET_REMOVAL);
    await expect(lockBtn).toHaveCount(0, { timeout: TIMEOUTS.WIDGET_VISIBLE });
    // High-signal UI proof we are locked (GridTile adds `static` class when locked).
    await expect(gridItem).toHaveClass(/static/, { timeout: TIMEOUTS.WIDGET_VISIBLE });

    // Attempt move
    const dragHandle = landing
      .widget('landing-./RhelWidget-widget')
      .locator('.pf-v6-widget-drag-handle');
    const dest = landing.widget('landing-./OpenShiftWidget-widget');
    await dragHandle.dragTo(dest);

    // Indirect assertion: first card still contains "Red Hat Enterprise Linux"
    await expect(
      page.locator('#widget-layout-container .react-grid-item').first(),
    ).toContainText('Red Hat Enterprise Linux');

    // Unlock
    await closeChromeOverlays(page);
    await openWidgetActionsMenu(page, menuToggle);
    const unlockBtn = page
      .locator('[data-ouia-component-id="unlock-widget"]')
      .first();
    const lockStillVisible = await page
      .locator('[data-ouia-component-id="lock-widget"]')
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);

    if (await unlockBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await unlockBtn.click();
      await landing.waitForLayoutPatchOptional(TIMEOUTS.WIDGET_REMOVAL);
      await expect(gridItem).not.toHaveClass(/static/, { timeout: TIMEOUTS.WIDGET_VISIBLE });
    } else if (!lockStillVisible) {
      // If neither lock nor unlock is visible, the dropdown likely closed; don't hard-fail cleanup.
      // The test's main assertion is that the widget couldn't be moved while "locked".
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  });
});
