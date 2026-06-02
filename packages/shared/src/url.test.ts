import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSource, isSupportedUrl, hashUrl } from "./url.js";

test("detects youtube urls", () => {
  assert.equal(detectSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
  assert.equal(detectSource("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.equal(detectSource("https://www.youtube.com/shorts/abc123"), "youtube");
  assert.equal(detectSource("https://music.youtube.com/watch?v=abc"), "youtube");
});

test("detects instagram urls", () => {
  assert.equal(detectSource("https://www.instagram.com/reel/Cabc/"), "instagram");
  assert.equal(detectSource("https://instagram.com/p/Cabc/"), "instagram");
});

test("rejects unsupported and malformed urls", () => {
  assert.equal(detectSource("https://tiktok.com/@x/video/1"), null);
  assert.equal(detectSource("not a url"), null);
  assert.equal(detectSource("ftp://youtube.com/x"), null);
  assert.equal(isSupportedUrl("https://example.com"), false);
});

test("hashUrl is stable and hex", () => {
  const a = hashUrl("https://youtu.be/dQw4w9WgXcQ");
  const b = hashUrl("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, hashUrl("https://youtu.be/other"));
});
