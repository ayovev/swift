import "@testing-library/jest-dom/vitest";
// jsdom doesn't implement IndexedDB; this installs it as a global for every
// test, the same way jest-dom matchers are installed above.
import "fake-indexeddb/auto";

// The landing splash only shows to a visitor with no stored choice; every
// other test is about what comes after it. landingSplash.test.tsx clears this.
import { beforeEach } from "vitest";
beforeEach(() => {
  localStorage.setItem("swift.audience", "athlete");
});
