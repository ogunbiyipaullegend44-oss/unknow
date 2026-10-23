import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstallInstructions } from '../src/utils/installInstructions.js';

test('install guidance gives iPhone users Safari Add to Home Screen steps', () => {
  const instructions = getInstallInstructions({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    platform: 'iPhone',
  });

  assert.match(instructions.heading, /Home Screen/);
  assert.match(instructions.steps.join(' '), /Safari/);
  assert.match(instructions.steps.join(' '), /Share/);
});

test('install guidance supports iPadOS reporting a Mac platform', () => {
  const instructions = getInstallInstructions({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  });

  assert.match(instructions.steps.join(' '), /Add to Home Screen/);
});

test('install guidance explains browser-menu installation on Android', () => {
  const instructions = getInstallInstructions({
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    platform: 'Linux armv8l',
  });

  assert.match(instructions.heading, /device/);
  assert.match(instructions.steps.join(' '), /Install app/);
});

test('install guidance explains installing from desktop browsers', () => {
  const instructions = getInstallInstructions({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
  });

  assert.match(instructions.heading, /computer/);
  assert.match(instructions.steps.join(' '), /address bar/);
});
