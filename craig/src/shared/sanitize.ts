/**
 * sanitizeGitHubContent — LLM output sanitizer for GitHub issue content.
 *
 * Prevents prompt-injection attacks where malicious code in reviewed
 * repositories tricks the LLM into producing:
 * - @mention spam (pinging real users)
 * - Phishing links (external URLs rendered as clickable)
 * - Tracking pixels (invisible <img> tags)
 * - XSS payloads (<script>, <iframe>, etc.)
 *
 * Applied to all issue titles and bodies before GitHub API calls.
 *
 * @see https://github.com/vbomfim/sdlc-guardian-agents/issues/40
 *
 * [CLEAN-CODE] Pure function, no side effects, single responsibility
 * [DRY] Centralized sanitization — all issue creation paths use this
 * [SOLID] SRP — this module does one thing: sanitize untrusted text
 *
 * @module shared/sanitize
 */

/** Zero-width space character used to neutralize @mentions. */
const ZERO_WIDTH_SPACE = "\u200B";

/**
 * Dangerous HTML tags that should be stripped entirely.
 * These tags enable tracking pixels, XSS, phishing, or content injection.
 */
const DANGEROUS_TAG_NAMES = [
  "img",
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "link",
  "meta",
  "svg",
  "video",
  "audio",
  "source",
  "base",
  "style",
] as const;

/**
 * GitHub domains are considered safe — they're same-platform links.
 * External URLs are defanged by wrapping in backticks to prevent clickability.
 */
const SAFE_URL_HOSTS = ["github.com"] as const;

/**
 * Regex to match fenced code blocks (``` ... ```).
 * Content inside code blocks is left untouched — it's already inert.
 */
const FENCED_CODE_BLOCK_REGEX = /```[\s\S]*?```/g;

/**
 * Sanitize text content destined for GitHub issues or comments.
 *
 * Applies three defensive transformations:
 * 1. Neutralize @mentions (insert zero-width space to prevent pinging)
 * 2. Strip dangerous HTML tags (img, script, iframe, etc.)
 * 3. Defang external URLs (wrap in backticks to prevent clickability)
 *
 * Content inside fenced code blocks (```) is preserved untouched.
 *
 * @param text - Raw text from LLM output
 * @returns Sanitized text safe for GitHub issue creation
 */
export function sanitizeGitHubContent(text: string): string {
  if (!text) {
    return text;
  }

  return processWithCodeBlockProtection(text, (segment) => {
    let result = segment;
    result = stripDangerousHtmlTags(result);
    result = defangExternalUrls(result);
    result = neutralizeMentions(result);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Internal transformation functions (pure, no side effects)
// ---------------------------------------------------------------------------

/**
 * Split text into code-block and non-code-block segments.
 * Apply the transform only to non-code-block segments.
 *
 * [CLEAN-CODE] Separation of concerns — code block detection vs. sanitization
 */
function processWithCodeBlockProtection(
  text: string,
  transform: (segment: string) => string,
): string {
  const parts: string[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(FENCED_CODE_BLOCK_REGEX)) {
    const matchStart = match.index;

    // Transform the text before this code block
    if (matchStart > lastIndex) {
      parts.push(transform(text.slice(lastIndex, matchStart)));
    }

    // Preserve the code block untouched
    parts.push(match[0]);
    lastIndex = matchStart + match[0].length;
  }

  // Transform any remaining text after the last code block
  if (lastIndex < text.length) {
    parts.push(transform(text.slice(lastIndex)));
  }

  return parts.join("");
}

/**
 * Neutralize @mentions by inserting a zero-width space after @.
 *
 * Matches @username patterns where @ is preceded by start-of-string
 * or whitespace (not by a word character — that would be an email).
 * Skips mentions already escaped with a zero-width space.
 *
 * [CLEAN-CODE] Regex is anchored to avoid false positives on emails
 */
function neutralizeMentions(text: string): string {
  // Match @ that is:
  // - At start of string or preceded by a non-word character (not email)
  // - NOT already followed by zero-width space
  // - Followed by a GitHub username pattern [a-zA-Z0-9_-]
  return text.replace(
    /(?<=^|[^a-zA-Z0-9.])@(?!\u200B)([a-zA-Z0-9][a-zA-Z0-9_-]*)/g,
    `@${ZERO_WIDTH_SPACE}$1`,
  );
}

/**
 * Strip dangerous HTML tags that could enable tracking, XSS, or phishing.
 *
 * Handles both self-closing tags (<img />) and paired tags
 * (<script>...</script>). Case-insensitive matching.
 *
 * [CLEAN-CODE] Allowlist approach — only strip known-dangerous tags
 */
function stripDangerousHtmlTags(text: string): string {
  let result = text;

  for (const tagName of DANGEROUS_TAG_NAMES) {
    // Strip paired tags with content: <script>...</script>
    const pairedRegex = new RegExp(
      `<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      "gi",
    );
    result = result.replace(pairedRegex, "");

    // Strip self-closing or opening-only tags: <img ... /> or <img ...>
    const selfClosingRegex = new RegExp(`<${tagName}[^>]*\\/?>`, "gi");
    result = result.replace(selfClosingRegex, "");
  }

  return result;
}

/**
 * Defang external URLs by wrapping them in backticks.
 *
 * GitHub renders backtick-wrapped URLs as inline code, preventing
 * them from becoming clickable links. GitHub.com URLs are preserved
 * (same-platform links are considered safe).
 *
 * Skips URLs already inside inline backticks.
 *
 * [CLEAN-CODE] Allowlist for safe hosts — deny by default
 */
function defangExternalUrls(text: string): string {
  // Match URLs not already inside backticks
  // Negative lookbehind for backtick, negative lookahead for backtick
  return text.replace(
    /(?<!`)https?:\/\/[^\s)`\]>]+(?!`)/g,
    (url) => {
      if (isSafeUrl(url)) {
        return url;
      }
      return `\`${url}\``;
    },
  );
}

/**
 * Check if a URL belongs to a safe host (GitHub).
 *
 * [CLEAN-CODE] Extracted predicate — readable and testable
 */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_URL_HOSTS.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}
