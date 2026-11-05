import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseXwininfo,
  parseActiveWindowId,
  findWindowIdByTitle,
  clipToScreen,
} from "../src/x11_window.js";

const XWININFO = `
xwininfo: Window id: 0x5a00007 "Image Cleanup"

  Absolute upper-left X:  2170
  Absolute upper-left Y:  48
  Relative upper-left X:  0
  Relative upper-left Y:  0
  Width: 1400
  Height: 900
  Depth: 24
`;

test("parseXwininfo reads the absolute rectangle", () => {
  assert.deepEqual(parseXwininfo(XWININFO), { x: 2170, y: 48, w: 1400, h: 900 });
});

test("parseXwininfo rejects incomplete or empty geometry", () => {
  assert.equal(parseXwininfo("Width: 10\nHeight: 10"), null);
  assert.equal(parseXwininfo(XWININFO.replace("Width: 1400", "Width: 0")), null);
});

test("parseActiveWindowId", () => {
  assert.equal(parseActiveWindowId("_NET_ACTIVE_WINDOW(WINDOW): window id # 0x5a00007"), "0x5a00007");
  assert.equal(parseActiveWindowId("_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"), null);
  assert.equal(parseActiveWindowId("_NET_ACTIVE_WINDOW:  not found."), null);
});

const TREE = `
xwininfo: Window id: 0x1e9 (the root window) (has no name)
  Root window id: 0x1e9 (the root window) (has no name)
     3 children:
     0x5a00001 "Image Cleanup": ("image_cleanup_gui.py" "Tk")  10x10+-100+-100  +-100+-100
     0x5a00007 "Image Cleanup": ("image_cleanup_gui.py" "Tk")  1400x900+0+0  +2170+48
     0x3200003 "OC | 30 issues": ("kitty" "kitty")  1900x1000+0+0  +60+30
`;

test("findWindowIdByTitle picks the largest case-insensitive match", () => {
  assert.equal(findWindowIdByTitle(TREE, "image cleanup"), "0x5a00007");
  assert.equal(findWindowIdByTitle(TREE, "30 issues"), "0x3200003");
  assert.equal(findWindowIdByTitle(TREE, "nope"), null);
});

test("clipToScreen clips to the screen and evens the size", () => {
  assert.deepEqual(clipToScreen({ x: -10, y: 5, w: 101, h: 51 }, 3840, 1080), { x: 0, y: 5, w: 90, h: 50 });
  assert.deepEqual(clipToScreen({ x: 3800, y: 0, w: 200, h: 100 }, 3840, 1080), { x: 3800, y: 0, w: 40, h: 100 });
  assert.equal(clipToScreen({ x: 4000, y: 0, w: 10, h: 10 }, 3840, 1080), null);
});
