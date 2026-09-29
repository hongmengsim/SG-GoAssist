import assert from "node:assert/strict";
import {
  createBrowserHarness,
  artifactDirectory,
} from "./e2e/browser-harness.mjs";
import { passengerControlAudit } from "./e2e/passenger-control-audit.mjs";

const appUrl = process.env.GOASSIST_APP_URL ?? "http://localhost:8081/";
const modes = [
  { name: "light", lightMode: true, textSize: "STANDARD" },
  { name: "dark", lightMode: false, textSize: "STANDARD" },
  {
    name: "large-high-contrast",
    lightMode: true,
    highContrast: true,
    textSize: "LARGE",
  },
  {
    name: "extra-large-dark",
    lightMode: false,
    highContrast: true,
    textSize: "EXTRA_LARGE",
    largerControls: true,
  },
  {
    name: "larger-controls",
    lightMode: true,
    textSize: "STANDARD",
    largerControls: true,
  },
  {
    name: "simplified",
    lightMode: true,
    textSize: "LARGE",
    simplifiedJourney: true,
    reducedMotion: true,
  },
];
let browser;
const results = [];
try {
  browser = await createBrowserHarness({ appUrl, debugPort: 9345 });
  await browser.waitFor(
    'document.body.innerText.includes("Find your bus")',
    "journey home",
  );
  for (const mode of modes) {
    await browser.evaluate(
      `localStorage.setItem("sg-goassist.preferences.v1", ${JSON.stringify(JSON.stringify({ version: 2, accessibilityPreferences: mode }))})`,
    );
    await browser.client.send("Page.reload");
    await browser.waitFor(
      'document.body.innerText.includes("Find your bus")',
      mode.name,
    );
    const expectedIcon =
      mode.textSize === "EXTRA_LARGE"
        ? 40
        : mode.textSize === "LARGE" || mode.largerControls
          ? 36
          : 32;
    await browser.waitFor(
      `(() => {
      const icons = [...document.querySelectorAll('[aria-label*=", tab,"] svg')];
      return icons.length === 3 && icons.every(icon => icon.getBoundingClientRect().width >= ${expectedIcon});
    })()`,
      `${mode.name} applied sizes`,
    );
    for (const width of [360, 441, 526]) {
      await browser.client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: 731,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: 731,
      });
      await browser.evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      for (const tab of ["Journey", "Assist", "Profile"]) {
        await browser.clickLabel(`${tab}, tab,`, { contains: true });
        const audit = await browser.evaluate(passengerControlAudit);
        assert.ok(audit.iconCount >= 3, "sized icons must be present");
        assert.equal(
          audit.horizontalOverflow,
          false,
          `${mode.name}/${width}/${tab}: horizontal overflow`,
        );
        assert.deepEqual(
          audit.undersizedIcons,
          [],
          `${mode.name}/${width}/${tab}: small icons`,
        );
        assert.deepEqual(
          audit.undersizedControls,
          [],
          `${mode.name}/${width}/${tab}: small controls`,
        );
        assert.deepEqual(
          audit.lowContrastIcons,
          [],
          `${mode.name}/${width}/${tab}: icon contrast`,
        );
        assert.deepEqual(
          audit.lowContrastLabels,
          [],
          `${mode.name}/${width}/${tab}: label contrast`,
        );
        results.push({ mode: mode.name, width, tab, icons: audit.iconCount });
      }
    }
  }
  console.log(
    JSON.stringify({ ok: true, layouts: results.length, results }, null, 2),
  );
} catch (error) {
  if (browser)
    console.error(
      await browser.captureFailureArtifacts(
        artifactDirectory(import.meta.url),
        "sizing",
      ),
    );
  throw error;
} finally {
  await browser?.close();
}
