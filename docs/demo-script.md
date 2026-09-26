# Demo walkthrough

## No-account demo

1. Run `npm run dev` and open http://127.0.0.1:5173.
2. Select Squat and choose **Try the demo** → **Start landmark demo**.
3. Wait about 6 seconds for the first rep. The next cycle is deliberately shallow; the third includes a torso-lean cue. The 14.4-second stored sequence loops.
4. Turn voice on to hear browser coaching, subject to installed browser/OS voices.
5. Pause and resume. The analyzer resets and waits for a straight starting position. A partial rep after resuming is not credited.
6. End the session. Inspect the angle chart, rep table, measured fault count, and deterministic next-session focus.
7. Open History, reload the browser, and reopen the report. Demo badges remain visible and demo reps do not increase training totals.
8. Repeat with curl or push-up to exercise the other analyzers.

The fixtures are synthetic. This demonstrates software behavior, not validated real-world tracking accuracy.

## Live camera

1. Select an exercise and choose **Enable camera & start**.
2. Grant permission. Use a bright side view and keep required joints in frame.
3. Hold your starting position with legs extended for squat or arms extended for curl/push-up. Wait for calibration.
4. Move slowly through complete cycles. Missing landmarks pause judgments and require a fresh calibration.
5. End the session and review observations. Absence of a cue is not proof of correct technique.

If camera permission is denied, the camera is missing/busy, or the model cannot initialize, follow the displayed recovery instructions or switch to the landmark demo.

## Connected walkthrough

Complete README environment setup first. Sign in through Auth0, complete a workout, and end it. The local backup is uploaded in batches to FastAPI/Tiger Data. The report requests Gemini once; on failure it retains measured statistics and provides a retry. With voice enabled, the coach requests ElevenLabs audio and falls back to browser speech. Open account history from another signed-in browser to verify remote persistence.
