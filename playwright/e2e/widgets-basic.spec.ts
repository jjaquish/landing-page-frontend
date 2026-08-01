import { expect, test } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { TIMEOUTS } from '../constants';

const DEFAULT_WIDGETS = [
  {
    id: 'landing-./RhelWidget-widget',
    name: 'RHEL',
    linkPattern: /\/insights\//,
  },
  {
    id: 'landing-./AnsibleWidget-widget',
    name: 'Ansible',
    linkPattern: /\/ansible\/ansible-dashboard/,
  },
  {
    id: 'landing-./OpenShiftWidget-widget',
    name: 'OpenShift',
    linkPattern: /\/openshift/,
  },
  {
    id: 'landing-./OpenShiftAiWidget-widget',
    name: 'OpenShift AI',
    linkPattern:
      /redhat\.com\/en\/technologies\/cloud-computing\/openshift\/openshift-ai\/trial/,
  },
  {
    id: 'landing-./AcsWidget-widget',
    name: 'ACS',
  },
  {
    id: 'landing-./ExploreCapabilities-widget',
    name: 'Explore Capabilities',
  },
  {
    id: 'landing-./RecentlyVisited-widget',
    name: 'Recently Visited',
  },
  {
    id: 'chrome-./DashboardFavorites-widget',
    name: 'My Favorite Services',
  },
  {
    id: 'landing-./ImageBuilderWidget-widget',
    name: 'Image Builder',
  },
  {
    id: 'subscriptionInventory-./SubscriptionsWidget-widget',
    name: 'Subscriptions',
  },
] as const;

test.describe('Landing page widgets - basic presence and links', () => {
  test.describe.configure({ timeout: TIMEOUTS.TEST_EXTENDED });

  test('default widgets appear, can be removed, and restore on reset', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 2000 });
    const landing = new LandingPage(page);
    await landing.gotoAndWaitForLayout();
    await landing.resetToDefaultLayout();

    await test.step('Verify default widgets are present', async () => {
      for (const w of DEFAULT_WIDGETS) {
        await expect(landing.widget(w.id)).toBeVisible({
          timeout: TIMEOUTS.WIDGET_VISIBLE,
        });
      }
    });

    await test.step('Verify widget links', async () => {
      for (const w of DEFAULT_WIDGETS) {
        if ('linkPattern' in w) {
          await expect(landing.widget(w.id).locator('a')).toHaveAttribute(
            'href',
            w.linkPattern,
          );
        }
      }
      await expect(landing.widget('landing-./AcsWidget-widget')).toContainText(
        'Fully hosted software as a service for protecting cloud-native applications and Kubernetes.',
      );
    });

    for (const w of DEFAULT_WIDGETS) {
      await test.step(`Remove ${w.name} widget`, async () => {
        await landing.removeWidget(w.id);
      });
    }

    await test.step('Verify empty dashboard state', async () => {
      const container = page.locator('#widget-layout-container');
      await expect(
        container.getByRole('heading', { name: /no dashboard content/i }),
      ).toBeVisible({ timeout: TIMEOUTS.WIDGET_VISIBLE });
    });

    await test.step('Reset to default and verify all widgets restored', async () => {
      await landing.resetToDefaultLayout();
      for (const w of DEFAULT_WIDGETS) {
        await expect(landing.widget(w.id)).toBeVisible({
          timeout: TIMEOUTS.WIDGET_VISIBLE,
        });
      }
    });
  });
});
