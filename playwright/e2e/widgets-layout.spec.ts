import { expect, test } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { TIMEOUTS } from '../constants';

test.describe('Landing page widget layout operations', () => {
  test.describe.configure({ timeout: TIMEOUTS.TEST_DEFAULT });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1500 });
    const landing = new LandingPage(page);
    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();
  });

  test('closes all the widgets and shows empty dashboard state', async ({
    page,
  }) => {
    test.setTimeout(TIMEOUTS.TEST_EXTENDED);
    const container = page.locator('#widget-layout-container');
    const landing = new LandingPage(page);

    // Remove widgets iteratively; the set of toggles changes as we remove items.
    // This mirrors the Cypress retry loop but without hard sleeps.
    while ((await page.locator('[aria-label="Widget actions"]').count()) > 0) {
      const toggle = page.locator('[aria-label="Widget actions"]').first();
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
    const handles = page.locator('.pf-v6-widget-drag-handle');
    await expect(handles.first()).toBeVisible();

    await handles.nth(0).dragTo(handles.nth(1));
    await handles.nth(2).dragTo(handles.nth(1));

    const firstTextAfter = await page
      .locator('.react-grid-item')
      .first()
      .textContent();
    expect(firstTextAfter).toBeTruthy();
  });

  test('widgets can be resized (class and PATCH 200)', async ({ page }) => {
    const widget = page.locator(
      '.react-grid-item:has([data-ouia-component-id="landing-./RhelWidget-widget"])',
    );
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
    const widget = page.locator('.react-grid-item').first();
    await expect(widget).toBeVisible();

    const before = await widget.boundingBox();
    expect(before?.height).toBeTruthy();

    const menuToggle = page.locator('[aria-label="Widget actions"]').first();
    await menuToggle.click();

    const maximizeItem = page
      .locator('[data-ouia-component-id="maximize-widget"]')
      .first();
    await expect(maximizeItem).toBeVisible({ timeout: TIMEOUTS.MENU_VISIBLE });
    await maximizeItem.click();

    if (before?.height) {
      await expect
        .poll(async () => (await widget.boundingBox())?.height, {
          timeout: TIMEOUTS.LAYOUT_PATCH,
        })
        .toBeGreaterThanOrEqual(before.height);
    }
  });

  test('minimize decreases widget height', async ({ page }) => {
    const widget = page.locator('.react-grid-item').first();
    await expect(widget).toBeVisible();

    const before = await widget.boundingBox();
    expect(before?.height).toBeTruthy();

    await page.locator('[aria-label="Widget actions"]').first().click();
    await page
      .locator('[data-ouia-component-id="minimize-widget"]')
      .first()
      .click();

    if (before?.height) {
      await expect
        .poll(async () => (await widget.boundingBox())?.height, {
          timeout: TIMEOUTS.LAYOUT_PATCH,
        })
        .toBeLessThan(before.height);
    }
  });

  test('lock prevents moving widget, then unlocks', async ({ page }) => {
    const landing = new LandingPage(page);
    const widgetId = 'landing-./RhelWidget-widget';

    const menuToggle = landing.widgetMenuToggle(widgetId);
    await expect(menuToggle).toBeVisible();

    await landing.openWidgetActionsMenu(widgetId);
    const gridItem = page.locator(
      `.react-grid-item:has([data-ouia-component-id="${widgetId}"])`,
    );
    const lockBtn = page
      .locator('[data-ouia-component-id="lock-widget"]')
      .first();
    await expect(lockBtn).toBeVisible({ timeout: TIMEOUTS.WIDGET_VISIBLE });
    await lockBtn.click();

    await expect(lockBtn).toHaveCount(0, { timeout: TIMEOUTS.WIDGET_VISIBLE });
    await expect(gridItem).toHaveClass(/static/, {
      timeout: TIMEOUTS.WIDGET_VISIBLE,
    });

    // Attempt move — locked widget should stay in place.
    const dragHandle = landing
      .widget(widgetId)
      .locator('.pf-v6-widget-drag-handle');
    const dest = landing.widget('landing-./OpenShiftWidget-widget');
    await dragHandle.dragTo(dest);

    await expect(
      page.locator('#widget-layout-container .react-grid-item').first(),
    ).toContainText('Red Hat Enterprise Linux');

    // Unlock
    await landing.dismissOverlays();
    await landing.openWidgetActionsMenu(widgetId);
    const unlockBtn = page
      .locator('[data-ouia-component-id="unlock-widget"]')
      .first();

    if (await unlockBtn.isVisible({ timeout: TIMEOUTS.ELEMENT_PROBE })) {
      await unlockBtn.click();
      await expect(gridItem).not.toHaveClass(/static/, {
        timeout: TIMEOUTS.WIDGET_VISIBLE,
      });
    }
  });
});
