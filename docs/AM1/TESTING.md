# AM1R1 local verification

Tests do not require a Supabase connection and never write to Production. Test dependencies belong outside the application repository; they are not runtime dependencies.

Example with Node 24 on Linux:

```bash
npm install --prefix /tmp/petatoe-am1-test-deps --ignore-scripts --no-audit --no-fund --package-lock=false @electric-sql/pglite@0.3.14 linkedom@0.18.12 @napi-rs/canvas@0.1.80 typescript@5.9.3 @supabase/supabase-js@2.119.0
PETATOE_AM1_TEST_DEPS=/tmp/petatoe-am1-test-deps/node_modules node --test scripts/am1-attachment-management.test.mjs scripts/am1-ui.test.mjs
```

The PostgreSQL tests create isolated in-memory schemas, roles and sample records. They execute the delivered migration, guards and operational SQL. They are not a copy of the Production database. The Edge tests use injected Auth/Storage transports and the actual installed SDK; no real Storage service is contacted. The isolated PostgreSQL fixture now includes both managed triggers observed in Production, version/current-row columns and indexes. Its permissive Storage RLS policy is a test fixture, not Production authorization logic. DOM tests execute the actual module and permission-matrix function, with simulated dialogs/file input. They do not measure native browser layout or remote concurrency.

To generate two synthetic PDF archives, two pages each:

```bash
PETATOE_AM1_TEST_DEPS=/tmp/petatoe-am1-test-deps/node_modules node scripts/am1-pdf-fixture.mjs /tmp/petatoe-am1-pdf
pdftoppm -png /tmp/petatoe-am1-pdf/AM1-TEST-ar.pdf /tmp/petatoe-am1-pdf/ar
pdftoppm -png /tmp/petatoe-am1-pdf/AM1-TEST-en.pdf /tmp/petatoe-am1-pdf/en
python3 scripts/am1-extract-archive.py /tmp/petatoe-am1-pdf/AM1-TEST-ar.pdf /tmp/petatoe-am1-restored-ar
```

Extraction requires `pypdf` and an empty destination. It validates every original SHA-256, never overwrites an existing output, rejects unsafe paths, and makes no network requests. Large archives require sufficient disk space and memory for local extraction.

`TEST_RESULTS.json` records the executed suites and limitations. Three historical release-number assertions from P3/P5/SC1 are excluded by name because they pin their old releases. Their functional cases remain covered; AM1R1 has its own 18.56.145 release/cache/navigation checks. Existing test files were preserved without editing their expected versions.

Native browser, real account authorization, Storage trigger ordering, source-table metadata correspondence, remote concurrency, actual deletion outcomes and device/language/theme testing must be reviewed in Production before enabling deletion.
