# A12 — Daily sales Y-axis spacing

- **Baseline:** A11_Sales_Visual_Refinement
- **Root cause:** The Y-axis numeric labels end only 28 SVG units before the plot area; at the left edge of the chart they appear crowded against the first plotted point/area.
- **Impact:** Cosmetic readability only; no financial calculation changes.
- **Scope:** `assets/js/sales-reports.js` only.
- **Change:** Increase daily chart left padding from 144 to 184 SVG units and increase Y-axis label offset from 28 to 54 SVG units. Tick labels remain anchored inside the SVG.
- **CSS Ownership/Cascade Audit:** No CSS changed or added.
- **Regression Risk:** Low for business logic; low-to-medium for responsive SVG rendering until live visual validation.
- **Regression checks:** JS syntax PASS; 4/4 targeted assertions PASS; exactly two source substitutions relative to A11.
- **Live browser visual validation:** Pending.
- **Result:** Local PASS; live verification pending.
