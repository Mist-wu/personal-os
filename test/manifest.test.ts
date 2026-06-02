import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEFAULT_METHOD, loadApiKey, USER_ID } from "../src/config.js";

test("package manifest declares the pi extension entry", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    main?: string;
    files?: string[];
    pi?: { extensions?: string[] };
  };

  assert.equal(pkg.main, "src/index.ts");
  assert.ok(pkg.files?.includes("src"));
  assert.ok(pkg.pi?.extensions?.includes("./src/index.ts"));
});

test("fixed config defaults for personal-os", () => {
  assert.equal(USER_ID, "wu");
  assert.equal(DEFAULT_METHOD, "hybrid");
});

test("loadApiKey prefers the EVEROS_API_KEY env var", () => {
  const previous = process.env.EVEROS_API_KEY;
  process.env.EVEROS_API_KEY = "test-key-123";
  try {
    assert.equal(loadApiKey(), "test-key-123");
  } finally {
    if (previous === undefined) delete process.env.EVEROS_API_KEY;
    else process.env.EVEROS_API_KEY = previous;
  }
});
