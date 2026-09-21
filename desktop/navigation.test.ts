import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isAtlasUrl, isExternalUrl } = require("./navigation.cjs");

describe("Desktop-Navigation", () => {
  it("behält Atlas-Seiten einschließlich Login im App-Fenster", () => {
    expect(isAtlasUrl("https://atlas-ten-orpin.vercel.app/login?next=%2Flernen")).toBe(true);
  });

  it.each([
    "https://atlas-ten-orpin.vercel.app.evil.example",
    "https://atlas-ten-orpin.vercel.app@evil.example",
    "http://atlas-ten-orpin.vercel.app",
    "https://atlas-ten-orpin.vercel.app:444",
    "invalid",
  ])("verhindert fremde Origins im App-Fenster: %s", (url) => {
    expect(isAtlasUrl(url)).toBe(false);
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,test", "smb://server/share", "invalid"])(
    "übergibt keine unsicheren Protokolle an macOS: %s", (url) => {
      expect(isExternalUrl(url)).toBe(false);
    },
  );

  it.each(["https://example.com/file.pdf", "http://example.com", "mailto:teacher@example.com"])(
    "öffnet normale externe Links: %s", (url) => {
      expect(isExternalUrl(url)).toBe(true);
    },
  );
});
