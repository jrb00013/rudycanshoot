import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseDshowDevices,
  buildCaptureArgs,
  webcamFilename,
  parseSize,
  isJpeg,
  detectBackend,
} from "../src/webcam.js";

test("parseDshowDevices reads ffmpeg 6+ tagged output", () => {
  const out = [
    '[in#0 @ 000001] "USB Camera A" (video)',
    '[in#0 @ 000001]   Alternative name "@device_pnp_\\\\?\\usb#vid_1234"',
    '[in#0 @ 000001] "Microphone (USB Camera A)" (audio)',
    '[in#0 @ 000001]   Alternative name "@device_cm_{X}\\wave_{Y}"',
    '[in#0 @ 000001] "Virtual Cam" (video)',
    "Error opening input file dummy.",
  ].join("\r\n");
  const devs = parseDshowDevices(out);
  assert.deepEqual(
    devs.map((d) => [d.name, d.type]),
    [
      ["USB Camera A", "video"],
      ["Microphone (USB Camera A)", "audio"],
      ["Virtual Cam", "video"],
    ]
  );
  assert.match(devs[0].altName, /^@device_pnp_/);
});

test("parseDshowDevices reads older section-header output", () => {
  const out = [
    "[dshow @ 0000] DirectShow video devices (some may be both video and audio devices)",
    '[dshow @ 0000]  "Old Cam"',
    '[dshow @ 0000]     Alternative name "@device_pnp_x"',
    "[dshow @ 0000] DirectShow audio devices",
    '[dshow @ 0000]  "Old Mic"',
  ].join("\n");
  assert.deepEqual(
    parseDshowDevices(out).map((d) => [d.name, d.type]),
    [
      ["Old Cam", "video"],
      ["Old Mic", "audio"],
    ]
  );
});

test("buildCaptureArgs uses video= for dshow and omits size when unset", () => {
  const a = buildCaptureArgs({ backend: "dshow", device: "Cam X", size: null, output: "C:\\out.jpg" });
  assert.deepEqual(a.slice(a.indexOf("-i"), a.indexOf("-i") + 2), ["-i", "video=Cam X"]);
  assert.ok(!a.includes("-video_size"));
  assert.ok(!a.includes("-vsync"));
  assert.equal(a.at(-1), "C:\\out.jpg");

  const b = buildCaptureArgs({ backend: "v4l2", device: "/dev/video2", size: "1280x720", output: "/x.jpg" });
  assert.deepEqual(b.slice(b.indexOf("-f"), b.indexOf("-f") + 2), ["-f", "v4l2"]);
  assert.deepEqual(b.slice(b.indexOf("-video_size"), b.indexOf("-video_size") + 2), ["-video_size", "1280x720"]);
  assert.deepEqual(b.slice(b.indexOf("-i"), b.indexOf("-i") + 2), ["-i", "/dev/video2"]);
});

test("webcamFilename defaults and appends .jpg", () => {
  assert.match(webcamFilename(), /^webcam-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.jpg$/);
  assert.equal(webcamFilename("desk"), "desk.jpg");
  assert.equal(webcamFilename("desk.jpeg"), "desk.jpeg");
});

test("parseSize validates WIDTHxHEIGHT", () => {
  assert.equal(parseSize(undefined), null);
  assert.equal(parseSize("1920X1080"), "1920x1080");
  assert.throws(() => parseSize("big"), /Invalid webcam size/);
});

test("detectBackend honors explicit choice and rejects unknown", () => {
  assert.equal(detectBackend("v4l2"), "v4l2");
  assert.equal(detectBackend("DSHOW"), "dshow");
  assert.throws(() => detectBackend("avfoundation"), /Unknown webcam backend/);
});

test("isJpeg checks the SOI marker", () => {
  const p = join(tmpdir(), `rudycanshoot_webcam_test_${Date.now()}.jpg`);
  writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]));
  assert.equal(isJpeg(p), true);
  writeFileSync(p, "not a jpeg");
  assert.equal(isJpeg(p), false);
  unlinkSync(p);
  assert.equal(isJpeg(p), false);
});
