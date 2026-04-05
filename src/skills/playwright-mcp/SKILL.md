---
name: playwright-mcp-tools
description: >
  Playwright MCP browser automation patterns. Teaches agents the correct
  tool names, screenshot techniques, limitations, and workarounds.
  Used by the Operator (screenshots, monitoring) and QA Guardian (E2E tests).
  Does NOT install anything. See PREREQUISITES.md §7 for setup.
---

# Playwright MCP — Browser Automation Skill

## Critical Rules

1. **Tool names always have the `playwright-` prefix.** Use `playwright-browser_navigate`, NOT `browser_navigate`.
2. **NEVER install anything.** Do not run `npx playwright install`, `npm install playwright`, or any install command. The MCP server manages its own browser.
3. **NEVER use `npx` or `npm` for Playwright operations.** All browser interaction goes through the `playwright-browser_*` MCP tools.

## Available Tools

| Tool | Purpose |
|------|---------|
| `playwright-browser_navigate` | Go to a URL |
| `playwright-browser_snapshot` | Get accessibility tree (DOM structure as text) — use to understand page layout |
| `playwright-browser_take_screenshot` | Capture screenshot (viewport or element) |
| `playwright-browser_click` | Click an element (use ref from snapshot) |
| `playwright-browser_type` | Type text into an input field |
| `playwright-browser_fill_form` | Fill multiple form fields at once |
| `playwright-browser_select_option` | Select dropdown option |
| `playwright-browser_press_key` | Press a keyboard key (Enter, Escape, PageDown, Tab) |
| `playwright-browser_wait_for` | Wait for text to appear/disappear or a timeout |
| `playwright-browser_hover` | Hover over an element |
| `playwright-browser_resize` | Resize the browser viewport |
| `playwright-browser_close` | Close the browser |

## Screenshot Techniques

### Viewport screenshot (default)

Captures what's currently visible in the browser window.

```
1. playwright-browser_navigate → URL
2. playwright-browser_take_screenshot
```

Best for: quick captures, dashboard panels, visible content.

### Full-page screenshot

Captures the entire scrollable page. **⚠️ Limit: fails if page exceeds 8000px in any dimension.**

```
1. playwright-browser_navigate → URL
2. playwright-browser_take_screenshot (with fullPage option if available)
```

Best for: short pages, landing pages, single-screen views.

### Element screenshot (by selector)

Captures a specific DOM element only. **⚠️ Same 8000px limit applies to the element's bounding box.**

```
1. playwright-browser_navigate → URL
2. playwright-browser_snapshot → find the element ref
3. playwright-browser_take_screenshot targeting that element ref
```

Best for: specific panels, widgets, cards. Fails on long articles or infinite-scroll content.

### Narrow viewport trick (hide sidebar/ads)

Resize the viewport to a narrow width to trigger responsive/mobile layout. This naturally hides sidebars, ad columns, and navigation drawers.

```
1. playwright-browser_navigate → URL
2. playwright-browser_resize → width: 600, height: 1200
3. playwright-browser_snapshot → verify layout is clean
4. playwright-browser_take_screenshot
```

Best for: article content without sidebar clutter, mobile-first captures. **This is the most reliable way to get clean content from ad-heavy sites.**

### Multi-panel captures

Capture specific sections of a page individually (e.g., Grafana panels).

```
1. playwright-browser_navigate → dashboard URL
2. playwright-browser_snapshot → identify panel elements
3. For each panel:
   a. playwright-browser_click on the panel ref (to scroll it into view)
   b. playwright-browser_take_screenshot targeting that element
   c. Save with descriptive name: {dashboard}-{panel-name}-{timestamp}.png
```

Use the same timestamp across all panels from one session for grouping.

## Common Patterns

### Dismiss cookie consent / overlays

Almost every site shows a consent banner. Always dismiss before capturing.

```
1. playwright-browser_navigate → URL
2. playwright-browser_snapshot → look for consent banners
3. Look for buttons labeled: "Accept All", "Accept", "Agree", "OK", "Got it", "Continue"
4. playwright-browser_click → click the accept button ref
5. playwright-browser_snapshot → confirm overlay is gone
6. If no recognizable button: playwright-browser_press_key → "Escape"
```

### Wait for dynamic content

SPAs and dashboards load data asynchronously. Wait before capturing.

```
1. playwright-browser_navigate → URL
2. playwright-browser_wait_for → wait for expected text or element
3. playwright-browser_take_screenshot
```

### Scroll and capture

For content below the fold:

```
1. playwright-browser_press_key → "PageDown" (scroll one viewport)
2. playwright-browser_take_screenshot → capture current view
3. Repeat for more sections
```

## Known Limitations

| Limitation | Workaround |
|-----------|------------|
| **>8000px screenshot fails** | Use viewport screenshot, narrow viewport, or scroll+capture instead of full-page/element |
| **Authentication walls** | Report: "Page requires login. Provide a pre-authenticated session or use a public URL." Do NOT attempt to enter credentials. |
| **iframe content** | Playwright can't screenshot cross-origin iframes. Report the gap. |
| **Headed mode pops up browser** | Add `"--headless"` to MCP config args (see PREREQUISITES.md §7) |
| **Dynamic loading** | Use `playwright-browser_wait_for` before capturing |
| **Cookie consent blocks content** | Always dismiss first (see pattern above) |

## Error Handling

| Error | What to do |
|-------|-----------|
| Tool not found / MCP error | Report: "Playwright MCP is not available. See PREREQUISITES.md §7." Do NOT install anything. |
| Navigation timeout | Report the URL and timeout. Suggest checking if the URL is reachable. |
| Element not found | Use `playwright-browser_snapshot` to examine page structure. Try alternative selectors. |
| Screenshot dimension error | Switch from element/full-page to viewport screenshot with `playwright-browser_resize`. |
| Connection closed | Playwright MCP server may have crashed. Report the error. The user needs to restart Copilot CLI. |

## Configuration Reference

**Headless (recommended for automation):**
```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@0.0.28", "--headless"]
  }
}
```

**Headed (for debugging):**
```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@0.0.28"]
  }
}
```

Config location: `~/.copilot/mcp-config.json` (global) or `.github/copilot/mcp.json` (per-project).

> **Always pin to a specific version.** Use `@latest` only for evaluation.
