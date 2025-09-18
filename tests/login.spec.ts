import { test } from "@playwright/test";
import { getSelfHealingPage } from "../src/SelfHealingFactory";

test("Login with self-healing", async ({ page }) => {
    const shPage = await getSelfHealingPage(page);
    await page.goto(`file://${process.cwd()}/tests/login.html`);
    const loginBtn = shPage.locator("//button[text()='Login']");
    await loginBtn.click();
    await page.pause();
});
