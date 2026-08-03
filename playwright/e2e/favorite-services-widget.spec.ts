import { type Locator, type Page, expect, test } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { TIMEOUTS } from '../constants';

test.describe('My Favorite Services widget', () => {
  test.describe.configure({ timeout: TIMEOUTS.TEST_DEFAULT });
  const widgetId = 'chrome-./DashboardFavorites-widget';

  async function openServicesMenu(page: Page): Promise<Locator> {
    // This button toggles the All Services sidebar/dropdown in chrome.
    const toggle = page.getByRole('button', {
      name: /Red Hat Hybrid Cloud Console/i,
    });
    await expect(toggle).toBeVisible({ timeout: TIMEOUTS.PAGE_INTERACTIVE });
    await toggle.click();

    const sidebarRoot = page
      .locator('.pf-v6-c-sidebar, .pf-v5-c-sidebar')
      .first();
    await expect(sidebarRoot).toBeVisible({
      timeout: TIMEOUTS.PAGE_INTERACTIVE,
    });
    return sidebarRoot;
  }

  async function closeServicesMenu(page: Page): Promise<void> {
    const toggle = page.getByRole('button', {
      name: /Red Hat Hybrid Cloud Console/i,
    });
    if (await toggle.isVisible()) {
      await toggle.click();
    }
  }

  async function clickAutomationCategoryIfPresent(
    sidebar: Locator,
  ): Promise<void> {
    // Different chrome variants render this in a left-nav, a tablist, or as a link/button.
    // We search the entire services menu container (not just the content panel).
    const candidates = [
      sidebar.getByRole('tab', { name: /^Automation$/i }),
      sidebar.getByRole('button', { name: /^Automation$/i }),
      sidebar.getByRole('link', { name: /^Automation$/i }),
      sidebar.getByText(/^Automation$/i),
      sidebar.getByText(/automation/i),
    ];

    for (const c of candidates) {
      if (await c.first().isVisible({ timeout: TIMEOUTS.ELEMENT_PROBE })) {
        await c.first().scrollIntoViewIfNeeded();
        await c.first().click();
        return;
      }
    }
  }

  async function setTasksFavorite(
    page: Page,
    shouldBeFavorited: boolean,
  ): Promise<boolean> {
    const sidebar = await openServicesMenu(page);
    await clickAutomationCategoryIfPresent(sidebar);

    const sidebarContent = sidebar
      .locator('.pf-v6-c-sidebar__content, .pf-v5-c-sidebar__content')
      .first();

    const tasksLink = sidebarContent
      .getByRole('link', { name: /^Tasks$/ })
      .or(sidebarContent.locator('a[href*="/insights/tasks"]'))
      .first();
    await expect(tasksLink).toBeVisible({ timeout: TIMEOUTS.PAGE_INTERACTIVE });
    await tasksLink.scrollIntoViewIfNeeded();

    // In the topbar services dropdown, each service is rendered as a tile/link that contains
    // a `.chr-c-favorite-trigger` container and a `...-FavoriteToggle` plain button.
    const trigger = tasksLink.locator('.chr-c-favorite-trigger').first();
    await expect(trigger).toBeVisible({ timeout: TIMEOUTS.PAGE_INTERACTIVE });

    const isFavorited = async () =>
      (await trigger.getAttribute('class'))?.includes('chr-c-icon-favorited') ??
      false;

    const before = await isFavorited();
    if (before === shouldBeFavorited) {
      await closeServicesMenu(page);
      return before;
    }

    // Prefer the dropdown tile's FavoriteToggle button (no aria-label), but fall back to the
    // legacy list variant which uses an Icon with aria-label "Favorite {title}".
    const starButton = tasksLink
      .locator('button[data-ouia-component-id$="-FavoriteToggle"]')
      .first();
    const starIconFallback = tasksLink
      .getByLabel(/(unfavorite|favorite)\s+tasks/i)
      .first();

    if (await starButton.isVisible({ timeout: TIMEOUTS.ELEMENT_PROBE })) {
      await starButton.click();
    } else {
      await expect(starIconFallback).toBeVisible({
        timeout: TIMEOUTS.PAGE_INTERACTIVE,
      });
      await starIconFallback.click();
    }

    await page.waitForResponse(
      (resp) => {
        const url = resp.url();
        const method = resp.request().method();
        return (
          url.includes('/api/chrome-service/v1/favorite-pages') &&
          (method === 'POST' || method === 'DELETE') &&
          resp.status() >= 200 &&
          resp.status() < 400
        );
      },
      { timeout: TIMEOUTS.WIDGET_REMOVAL },
    );
    await expect
      .poll(isFavorited, { timeout: TIMEOUTS.PAGE_INTERACTIVE })
      .toBe(shouldBeFavorited);

    await closeServicesMenu(page);
    return before;
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2000 });
  });

  test('appears in the default layout', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();

    await expect(landing.widget(widgetId)).toBeVisible({
      timeout: TIMEOUTS.WIDGET_VISIBLE,
    });
  });

  test('disappears when removed from the layout', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();

    await landing.removeWidget(widgetId);
  });

  test('shows empty state when no favorites are set', async ({ page }) => {
    const landing = new LandingPage(page);

    const favoritesResp = page
      .waitForResponse((resp) => {
        return (
          resp.request().method() === 'GET' &&
          resp.url().includes('/api/chrome-service/v1/user') &&
          resp.status() >= 200 &&
          resp.status() < 400
        );
      })
      .then(
        () => undefined,
        () => undefined,
      );

    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();
    await favoritesResp;

    await expect(landing.widget(widgetId)).toBeVisible({
      timeout: TIMEOUTS.WIDGET_VISIBLE,
    });
    await expect(
      landing.widget(widgetId).getByRole('heading', { level: 3 }),
    ).toContainText(/no favorited services/i, {
      timeout: TIMEOUTS.WIDGET_VISIBLE,
    });
  });

  // Skipped 2026-07-31: Chrome's DashboardFavorites widget never displays
  // favorites due to a data lookup bug in useFavoritedServices.
  // Tracking: RHCLOUD-49898
  test.skip('shows favorites when they are set', async ({ page }) => {
    const landing = new LandingPage(page);

    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();

    // Use the real UI to favorite a service — stubbing the API doesn't
    // propagate into chrome's internal state for the federated widget.
    const wasFavorited = await setTasksFavorite(page, true);

    try {
      // The widget reads favorites on init; reload so it picks up the change.
      // Chrome's federated widget may serve a cached empty state, so retry
      // with full page navigations until the cache expires.
      await landing.gotoAndWaitForLayout();

      const widget = landing.widget(widgetId);
      const emptyText = widget.getByText(/no favorited services/i);
      let retries = 3;

      while (retries > 0) {
        await expect(widget).toBeVisible({ timeout: TIMEOUTS.WIDGET_VISIBLE });
        if ((await emptyText.count()) === 0) break;
        retries--;
        if (retries > 0) {
          await landing.gotoAndWaitForLayout();
        }
      }

      await expect(emptyText).toHaveCount(0, {
        timeout: TIMEOUTS.WIDGET_VISIBLE,
      });
    } finally {
      await setTasksFavorite(page, wasFavorited);
    }
  });
});
