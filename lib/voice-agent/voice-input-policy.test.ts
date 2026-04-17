import test from "node:test";
import assert from "node:assert/strict";

import { isNoiseLikeTranscript, shouldDropSegment } from "@/lib/voice-agent/voice-input-policy";

test("idle_rotate with meaningful qualified frames is not auto-dropped", () => {
  const result = shouldDropSegment({
    dropReason: "idle_rotate",
    hadSpeech: true,
    qualifiedVoicedFrames: 4,
    qualifiedSpeechMs: 420,
    minSttQualifiedVoicedFrames: 3,
    minSttQualifiedSpeechMs: 300,
    minIdleRotateQualifiedFrames: 3,
  });

  assert.equal(result.shouldDrop, false);
  assert.equal(result.skippedByQualityGate, false);
});

test("idle_rotate with zero qualified frames is dropped", () => {
  const result = shouldDropSegment({
    dropReason: "idle_rotate",
    hadSpeech: false,
    qualifiedVoicedFrames: 0,
    qualifiedSpeechMs: 0,
    minSttQualifiedVoicedFrames: 3,
    minSttQualifiedSpeechMs: 300,
    minIdleRotateQualifiedFrames: 3,
  });

  assert.equal(result.shouldDrop, true);
  assert.equal(result.skippedByQualityGate, false);
});

test("segment without strict speech confirmation is dropped even with pre-speech hints", () => {
  const result = shouldDropSegment({
    dropReason: "none",
    hadSpeech: false,
    qualifiedVoicedFrames: 8,
    qualifiedSpeechMs: 700,
    minSttQualifiedVoicedFrames: 3,
    minSttQualifiedSpeechMs: 300,
    minIdleRotateQualifiedFrames: 3,
  });

  assert.equal(result.shouldDrop, true);
  assert.equal(result.skippedByQualityGate, false);
});

test("quality gate accepts brief valid utterance under relaxed thresholds", () => {
  const result = shouldDropSegment({
    dropReason: "none",
    hadSpeech: true,
    qualifiedVoicedFrames: 3,
    qualifiedSpeechMs: 300,
    minSttQualifiedVoicedFrames: 3,
    minSttQualifiedSpeechMs: 300,
    minIdleRotateQualifiedFrames: 3,
  });

  assert.equal(result.shouldDrop, false);
});

test("transcript guard allows short valid answers and blocks filler noise", () => {
  assert.equal(isNoiseLikeTranscript("yes"), false);
  assert.equal(isNoiseLikeTranscript("no"), false);
  assert.equal(isNoiseLikeTranscript("ok"), false);
  assert.equal(isNoiseLikeTranscript("um"), true);
  assert.equal(isNoiseLikeTranscript("..."), true);
});
