# 🎭 Playwright Self-Healing Library

**Heuristic-powered non -AI self-healing locators for Playwright**  
Automatically recovers when selectors break due to DOM changes by leveraging stored candidates and rule-based regeneration (no AI required).

---

## ✨ Features
- 🔄 **Self-healing locators** – automatically retries candidates and regenerates using predefined strategies.
- 📦 **Drop-in replacement** for Playwright’s `page.locator()`.
- 🧩 **Heuristic strategies**: CSS by id/class/data-*, XPath absolute/relative, text synonyms, sibling/parent relationships.
- 📝 **JSON memory (`healingStore.json`)** – successful selectors are reused across runs.
- ⚡ **Configurable logging** – silent, info, debug (with warn + error built-in).
- ✅ Works with React, Tailwind, Semantic UI, and Material UI apps.
- 🌐 **Offline** – no API calls or external dependencies.

---

## 📦 Installation
```bash
npm install playwright-selfheal
```

---

## 🚀 Usage

### 1. Import `SelfHealingPage`
```ts
import { test } from "@playwright/test";
import { SelfHealingPage } from "playwright-selfheal";

test("Login with HeuristicHeal self-healing", async ({ page }) => {
  const shp = new SelfHealingPage(page, { logLevel: "debug" });

  await page.goto("http://localhost:3000/login");

  // Use shp.locator() instead of page.locator()
  await shp.locator("//button[text()='Login']").click();
});
```

### 2. Run Tests
```bash
AI_ENABLED=false npx playwright test tests/login.spec.ts --headed
```

---

### 3. How It Works
1. Tries the **original selector**.
2. If it fails → retries **stored candidates** from `healingStore.json`.
3. If none work → applies heuristic strategies (CSS, XPath, synonyms, parent/child).
4. Validated selector is saved back to JSON for future runs.
5.  Heuristic-powered non-AI stores will automatically remove locators older than 30 days

---

### 4. Logging
Configure logging level when creating `SelfHealingPage`:

```ts
const shp = new SelfHealingPage(page, { logLevel: "debug" });
```

Available levels:
- `"silent"` – no logs (only errors).
- `"info"` – info + warn + error.
- `"debug"` – debug + info + warn + error.

---

## 📂 Example `healingStore.json`
```json
{
  "//button[text()='Login']": {
    "original": "//button[text()='Login']",
    "healed": "//button[contains(text(),'Sign In')]",
    "candidates": [
      { "type": "xpath-text", "selector": "//button[contains(text(),'Sign In')]", "score": 85 },
      { "type": "css-attribute", "selector": "button[type='submit']", "score": 70 }
    ],
    "meta": { "lastSeen": "09/06/2025 05:19:12", "aiGenerated": false }
  }
}
```

---

## 🔄 Architecture Flow

```text
   ┌───────────────────┐
   │    Playwright     │
   │   Test Script     │
   │ shp.locator(...). │
   │       click()     │
   └─────────┬─────────┘
             │
             ▼
   ┌───────────────────┐
   │ SelfHealingPage   │
   │  (Proxy wrapper)  │
   └─────────┬─────────┘
             │ intercepts method
             ▼
   ┌───────────────────┐
   │ SelfHealingHelper │
   │   .find(selector) │
   └─────────┬─────────┘
       tries original
             │
 ┌───────────┴───────────┐
 │                       │
 ▼                       ▼
Success              Failure
 │                       │
 │                       ▼
 │         ┌─────────────────────────┐
 │         │ LocatorStore (JSON)     │
 │         │ - stored candidates     │
 │         │ - lastSeen/healed meta  │
 │         └─────────┬───────────────┘
 │                   │
 │             candidates fail?
 │                   │
 │                   ▼
 │         ┌─────────────────────────┐
 │         │ HealingStrategies       │
 │         │ - generates new locators│
 │         │ - CSS/XPath/synonyms    │
 │         └─────────────────────────┘
 │
 ▼
Locator executes
(click/fill/etc.)
```

---

## 📜 License
MIT © sathyasri kapisetti (https://www.linkedin.com/in/sathya-sri-kapisetti-5a69a6158/)
