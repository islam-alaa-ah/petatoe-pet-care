# A8 — Sales comparison charts layout and change colors

STATUS: LOCAL PASS / BROWSER VISUAL VERIFICATION PENDING

ROOT CAUSE:
- Previous/current bar positions used the same center offset, causing the bars and their numeric labels to collide.
- The SVG had limited vertical label headroom and was constrained by a CSS max-height while width was responsive.
- Percentage RTL presentation placed negative signs ambiguously; zero changes were styled green.

IMPACT: Visualization/readability only; financial calculations remain unchanged.

SCOPE:
- assets/js/sales-reports.js
- assets/css/sales-reports.css (canonical owner)

CHANGES:
- True non-overlapping paired bar coordinates, with category-scaled sizing and more top space.
- Two vertical value-label lanes, tabular digits, stroked labels for contrast.
- Positive green, negative red, unchanged neutral; bdi for sign direction in RTL.

DATABASE / RPC: No changes.
BUSINESS LOGIC: No changes.
DESKTOP / TABLET / MOBILE: Existing scroll behavior retained; browser screenshots pending.
CSS OWNERSHIP AUDIT: Existing canonical selectors amended in-place, not appended override layers.
TESTS: JS syntax PASS; A7 regression 12/12 PASS; A8 checks 12/12 PASS.
REGRESSION RISK: Low for data, moderate for responsive chart rendering until live visual QA.
NEXT: Browser visual verification in desktop/mobile using actual data.
