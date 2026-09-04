import { expect, test, type Page } from "@playwright/test";

/**
 * The two journeys this product exists to make easy, driven end to end at
 * 360px in a real browser.
 *
 * Every assertion here maps to something the legacy workbook got wrong.
 */

const gotoOffer = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Offer a ride/ }).first().click();
};

const pickZone = async (page: Page, field: "from" | "to", name: string) => {
  await page.locator(`#zone-${field}`).fill(name);
  await page
    .getByRole("group", { name: field === "from" ? "From" : "To" })
    .getByRole("button", { name, exact: true })
    .click();
};

/** The driver must see and accept the computed route before the stops appear. */
const approveRoute = async (page: Page) => {
  await page.getByRole("button", { name: "Use this route" }).click();
  await expect(page.getByText("Route confirmed")).toBeVisible();
};

test("no page error on any screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  for (const tab of ["Offer a ride", "Find a ride", "My rides", "Admin"]) {
    await page.getByRole("button", { name: tab }).last().click();
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);
});

test("the declaration from the legacy form is visible while entering data", async ({ page }) => {
  await gotoOffer(page);
  // Verbatim from UserForm1 label Label9x7 in the workbook.
  const declaration = page.getByText(/You are entering your Ride sharing information by yourself, voluntarily/);
  await expect(declaration).toBeVisible();

  // It stays visible on every step, and is not collapsible.
  await pickZone(page, "from", "Uttara");
  await pickZone(page, "to", "Gulshan-2");
  await approveRoute(page);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(declaration).toBeVisible();
});

test("a driver publishes a journey no corridor list contained", async ({ page }) => {
  await gotoOffer(page);
  await pickZone(page, "from", "Mirpur-12");
  await pickZone(page, "to", "Motijheel");

  // The route is computed, not looked up, and shown for the driver to accept.
  const route = page.locator(".routeline");
  await expect(route).toBeVisible();
  await expect(route).toContainText("Mirpur-12");
  await expect(route).toContainText("Motijheel");
  await expect(page.locator(".routeline .chip.via").first()).toBeVisible();

  await approveRoute(page);

  // Only now do the stops appear, and only those on this route — not the
  // whole zone set.
  const stops = page.locator('[aria-label="Where will you stop?"] button');
  await expect(stops.first()).toBeVisible();
  expect(await stops.count()).toBeLessThan(12);

  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // The working is shown, with its provenance.
  await expect(page.locator(".working")).toContainText("km ×");
  await expect(page.locator(".working")).toContainText("octane at Tk 145/L");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: "My rides" })).toBeVisible();
});

test("the zone picker filters a closed set and absorbs legacy spellings", async ({ page }) => {
  await gotoOffer(page);
  // "Empori" is what colleagues actually typed in the workbook; it must resolve
  // to the seeded zone rather than creating a new free-text place.
  await page.locator("#zone-from").fill("empori");
  await expect(
    page.getByRole("group", { name: "From" }).getByRole("button", { name: "Gulshan-2", exact: true }),
  ).toBeVisible();

  await page.locator("#zone-from").fill("Atlantis");
  await expect(page.getByText(/No place by that name/)).toBeVisible();
});

test("a rider searches, and cannot confirm without answering the counterfactual", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Find a ride/ }).first().click();
  await page.getByRole("button", { name: "Search" }).click();

  const first = page.locator(".result").first();
  await expect(first).toBeVisible();
  // Every result must say why it matched.
  await expect(first.locator(".badge").first()).toBeVisible();

  await page.getByRole("button", { name: "Request seat" }).first().click();

  // The counterfactual gates Confirm. It is never dropped to save a tap.
  const confirm = page.getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("button", { name: "Bus", exact: true }).click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText(/We've asked them/)).toBeVisible();
});

test("a search with no match offers an alert rather than a dead end", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Find a ride/ }).first().click();
  await page.locator(".toggle").first().click();
  // The search is pre-filled from the saved commute, so the picker shows the
  // chosen zone as a chip. Tapping it clears the choice and reveals the filter.
  await page.getByRole("button", { name: /Uttara, tap to change/ }).click();
  await page.locator("#zone-from").fill("Savar");
  await page
    .getByRole("group", { name: "From" })
    .getByRole("button", { name: "Savar", exact: true })
    .click();
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText(/No match yet/)).toBeVisible();
  const alert = page.getByRole("button", { name: /Alert me/ });
  await expect(alert).toBeEnabled();
  await alert.click();
  await expect(alert).toBeDisabled();
  // And the chance to drive it instead.
  await expect(page.getByRole("button", { name: "Offer a seat" })).toBeVisible();
});

test("the admin can see the stale-rate alarm and confirm the rate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Admin" }).last().click();
  // Octane at Tk 145 is correct but unconfirmed for over 35 days.
  await expect(page.getByText(/has not been confirmed for over 35 days/)).toBeVisible();
  await page.getByRole("button", { name: "Still correct" }).click();
  await expect(page.getByText(/Confirmed today/)).toBeVisible();
  await expect(page.getByText(/has not been confirmed/)).toHaveCount(0);
});

test("the strapline spells the builder's name down its initials", async ({ page }) => {
  await page.goto("/");
  const initials = await page.locator(".strapline .lead").allInnerTexts();
  expect(initials.join("")).toBe("RUMAN");
  // Each line must still read as a whole sentence to a screen reader.
  const spoken = await page.locator(".strapline .sr-only").allInnerTexts();
  expect(spoken[0]).toBe("Ride together, not alone.");
  await expect(page.getByText("Built for us, by Ruman")).toBeVisible();
});

test("the whole interface switches to Bangla", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "বাংলা" }).click();
  await expect(page.getByRole("heading", { name: /একপথে/ })).toBeVisible();
  await expect(page.getByText("রাইড অফার করুন").first()).toBeVisible();
  // Numbers use Bangla-Indic digits, not Latin ones.
  await expect(page.locator(".card").filter({ hasText: "সহকর্মী" })).toContainText(/[০-৯]/);
});

test("touch targets meet the 44px minimum", async ({ page }) => {
  await page.goto("/");
  const buttons = await page.getByRole("button").all();
  const tooSmall: string[] = [];
  for (const b of buttons) {
    const box = await b.boundingBox();
    if (box && box.height > 0 && box.height < 44) {
      tooSmall.push(`${(await b.innerText()).slice(0, 24)} = ${Math.round(box.height)}px`);
    }
  }
  expect(tooSmall).toEqual([]);
});

test("the page never scrolls horizontally at 360px", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Offer a ride", "Find a ride", "My rides", "Admin"]) {
    await page.getByRole("button", { name: tab }).last().click();
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${tab} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});
