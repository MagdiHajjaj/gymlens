# Verification notes

Automated checks exercise the rebuilt application in `frontend/` and `backend/` only.

Verified locally: **17 movement tests, 20 API/migration tests, and 5 Chromium browser tests passed (42 total)**. Frontend ESLint/TypeScript, production build, Python Ruff, and the locked dependency check passed. The running API returned `status: ok` with authentication correctly reported as unconfigured.

- Movement tests: full and shallow cycles for all three exercises; geometry; aspect ratio; front-view rejection; calibration; minimum duration; tracking loss and frame gaps; cooldowns.
- API tests: signed RS256 tokens; invalid claims/signature; authentication on all routes; owner isolation; idempotency; counts; timestamp checks; payload bounds; speech/cache/fallback; rate limits; structured insight persistence and rejection.
- Chromium: complete local replay, pause/resume, report persistence after reload, history, camera errors and fallback, mobile selection/navigation, and real MediaPipe model initialization with a synthetic browser camera.
- Production frontend TypeScript/build and Python lint checks.

External providers are tested with mocked responses. Live credentials and managed-database availability are not assumed. No real-person webcam recording is included; synthetic fixtures are labeled. Human movement accuracy needs real-athlete validation before making reliability claims beyond these tests.

Upstream dependencies currently emit deprecation notices for Starlette's httpx TestClient compatibility and Google GenAI's use of a Python typing alias on Python 3.14. These do not prevent tests or the API from running.
