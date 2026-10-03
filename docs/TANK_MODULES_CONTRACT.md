# Tank modules contract — Shop Tank & Site Tank

Single source of truth shared by:
- **Agent 1** (MegaEngineeringSuite: library refactor, runners, Local Agent)
- **Agent 2** (mega-agent-api)
- **Console** (mega-agent-console UI, built against this file)

Do not change a name or shape here without updating all three. Module ids are
exactly `"ShopTank"` and `"SiteTank"` (same casing as `"TubeSheet"` etc.).

---

## 1. Submit — `POST /api/jobs`

```jsonc
{
  "module": "ShopTank",                    // or "SiteTank"
  "projectInfo": {                         // all optional; same fields as today + date
    "customerName": "MEGA CLIENT", "drawingTitle": "RECTIFIER COLUMN REFLUX TANK",
    "projectNo": "25-005", "drawingNo": "25-005-WFD-TK-1442-R0", "revision": "0",
    "date": "02-10-2026",                  // NEW, dd-MM-yyyy, optional (default: today)
    "preparedBy": "NSS", "checkedBy": "ASK", "approvedBy": "ASK"
  },
  "shopTank": {                            // present only when module == "ShopTank"
    "shellId": 1200,                       // mm, > 0 (chart 300..2199; up to 3000 uses top band + warning)
    "shellHeight": 1500,                   // mm, > 0
    "designPressureType": "Atmospheric",   // "Atmospheric" | "Full Vacuum"
    "courseHeight": 1250,                  // mm, > 0
    "supportType": "LEG SUPPORT",          // "LEG SUPPORT" | "LUG SUPPORT" | "SADDLE SUPPORT" | "SKIRT SUPPORT"
    "noOfStiffeners": 0,                   // int >= 0; forced to 0 when Atmospheric
    "straightFlangeSF": 25                 // mm, > 0
  },
  "siteTank": {                            // present only when module == "SiteTank"
    "courseHeight": 1500,                  // mm, > 0
    "requiredVolume": 675,                 // m³, > 0
    "hdRatio": 1.15,                       // > 0
    "bottomSlopeRatio": 25,                // the X in "1 : X", > 0
    "topConeAngle": 15,                    // deg, 0 <= x < 90
    "designCode": "API 650"                // "API 650" | "API 620" | "IS 803" | "EN 14015"
  },
  "overrides": { "SHELL_THK": "4" }        // optional: Estimated-column overrides, key -> value (see §3)
}
```

Responses:
- `201/200` → the existing `JobSummary` shape. `shellId` = Shop Tank input Shell I.D.
  (rounded int) / Site Tank **calculated** Shell I.D. (calculation is pure and fast,
  so it runs at submit time, exactly like HX thermal sizing does today).
- `400` → `{ "error": "Please correct highlighted input fields.", "fieldErrors": { "shopTank.shellId": "Shell I.D. must be > 0." } }`
  Field keys are `"<shopTank|siteTank>.<field>"`. Messages = the desktop form's messages.
- Unknown `module` → `400 { "error": "Unknown module 'X'." }` (whitelist all 5 modules).

## 2. Read — `GET /api/jobs/{id}` (JobDetail)

Existing fields unchanged. Tank jobs additionally carry `tankData`, and reuse the
existing `bom` array (`BomRow`: itemNo, description, moc, dimension, qty, weightKg, remark).
`engineeringData` is absent for tank jobs.

```jsonc
"tankData": {
  "module": "ShopTank",
  "inputs": { /* echo of the shopTank or siteTank object as stored */ },
  "overrides": { "SHELL_THK": "4" },
  "parameters": [                          // the desktop "ENGINEERING PARAMETERS" grid, in desktop order
    { "key": "SHELL_THK", "label": "Shell Thickness", "unit": "mm", "group": "Thicknesses",
      "actual": "3", "estimated": "4", "editable": true }
  ],
  "summary": [                             // KPI tiles (volumes, weights, counts)
    { "key": "DESIGN_VOLUME", "label": "Design Volume", "value": "1.696", "unit": "m³" }
  ],
  "warnings": [ "Shell I.D. 2500 is above the thickness chart (max 2199); the top band was used." ]
}
```
`actual`/`estimated`/`value` are display strings, already formatted exactly like the
desktop grid (e.g. `"0.000"` for H/D, `"1 : 25"` for slope). `estimated == actual` unless overridden.

## 3. Parameter keys (parameters[].key, also the override keys)

### Shop Tank — desktop grid order, then extras
| key | label | unit | group | editable |
|---|---|---|---|---|
| SHELL_ID | Shell I.D. | mm | Geometry | no (input) |
| SHELL_HT | Shell Height | mm | Geometry | no (input) |
| HD_RATIO | H/D Ratio | – | Geometry | no |
| DESIGN_VOLUME | Design Volume | m³ | Geometry | no |
| COURSE_HT | Course Height | mm | Geometry | no (input) |
| SUPPORT_TYPE | Support Type | – | Support | no (input) |
| NO_OF_STIFFENERS | No. of Stiffeners | – | Stiffeners | no (input) |
| SHELL_THK | Shell Thickness | mm | Thicknesses | yes |
| TOP_DISH_THK | Top Dish Thickness | mm | Thicknesses | yes |
| BOTTOM_DISH_THK | Bottom Dish Thickness | mm | Thicknesses | yes |
| TOP_ROOT_TYPE | Top Root Type | – | Heads | yes (DISH/FLAT/CONICAL) |
| BOTTOM_ROOT_TYPE | Bottom Root Type | – | Heads | yes (DISH/FLAT/CONICAL) |
| LEG_PIPE_SIZE | Leg Pipe Size | NB | Support | yes |
| NO_OF_LEGS | No. of Legs | – | Support | yes (3 or 4; changing it flips 1st leg 0↔45 like desktop) |
| FIRST_LEG_ORIENTATION | 1st Leg Orientation | ° | Support | yes |
| STIFFENER_SIZE | Stiffener Size | mm | Stiffeners | yes (0 when Atmospheric) |
| STIFFENER_THK | Stiffener Thickness | mm | Stiffeners | yes (0 when Atmospheric) |
| BASE_PLATE_SIZE | Base Plate Size | mm | Support | yes |
| BASE_PLATE_THK | Base Plate Thickness | mm | Support | yes |
| NO_OF_COURSES | No. of Courses | – | Geometry | no |
| STRAIGHT_FLANGE_SF | Straight Flange (SF) | mm | Heads | no (input) |

Shop Tank `summary`: DESIGN_VOLUME (m³), SHELL_FINISH_WEIGHT, DISHEND_FINISH_WEIGHT,
BACKING_STRIP_FINISH_WEIGHT, BASE_PLATE_FINISH_WEIGHT, TOTAL_WEIGHT (sum, kg), NO_OF_LEGS.
Weights must equal what the drawing prints (i.e. use `ShopTankCadFormatter` values,
golden overrides included) so BOM, summary and DWG never disagree.

### Site Tank — desktop grid order
SHELL_ID, TANK_HEIGHT, HD_RATIO, ACTUAL_VOLUME, NO_OF_COURSES, NO_OF_FULL_COURSES,
NO_OF_PARTIAL_COURSES, PARTIAL_COURSE_HEIGHT, COURSE_{1..N}_THK, ROOF_PLATE_THK,
BASE_PLATE_THK, BOTTOM_SLOPE (`"1 : X"`), BOTTOM_SLOPE_ANGLE (°), TOP_CONE_ANGLE (°).
Labels/units = desktop labels (e.g. "Shell I.D. (mm)" → label "Shell I.D.", unit "mm").
Groups: Geometry (first 8 + slope/cone), Thicknesses (course/roof/base). All editable
except ACTUAL_VOLUME, NO_OF_COURSES, BOTTOM_SLOPE_ANGLE. Overrides behave like the
desktop: they change the drawing (GetEffective*), not the re-computed volume/weights.

Plus read-only group "Roof Structure" from the thickness chart (SiteTankPlateData):
CENTRAL_DRUM_DIA, CENTRAL_DRUM_THK, MAIN_RAFTER, CENTRAL_RAFTER, CURB_CHANNEL,
CURB_WIDTH, RAFTER_QTY, ANCHOR_CHAIR_QTY.

Site Tank `summary`: GROSS_VOLUME (m³), WORKING_VOLUME (m³), EMPTY_WEIGHT,
FULL_OF_WATER_WEIGHT, OPERATING_WEIGHT (kg), NO_OF_COURSES.

## 4. BOM rows (existing `BomRow`)

**Shop Tank** (4 rows, values = drawing values): 1 Shell Plate (`ShellPlateSizeFormatted`,
qty 1, ShellFinishWeight) · 2 Torispherical Dishend (`DishendSizeFormatted`, qty 2,
DishendFinishWeight) · 3 Backing Strip (`BackingStripSizeFormatted`, qty 1) ·
4 Base Plate (`BasePlateSizeFormatted`, qty = NoOfLegs). MOC: read from
`Templates\Shop Tank BOM Details.xlsx` if it has a matching row, else `"IS 2062 Gr. E250"`.

**Site Tank** (new — desktop has none; steel density 7850):
1. Shell course plates, one row per thickness group: `"{t} THK x {courseH} x {round(π·(ID+t))}"`,
   qty = courses in group, weight = π·(ID+t)/1000 · courseH/1000 · t/1000 · 7850 · qty.
2. Bottom plate: `"{t} THK x Ø{ID+100}"`, weight = π/4·((ID+100)/1000)²·t/1000·7850.
3. Roof cone plate: `"{t} THK x R{rCone}"` with rCone = (ID/2+75)/cos(cone), weight = π·rCone²/1e6·(1−cut/360)·t/1000·7850 (cut = 360·(1−cos cone)).
4. Main rafters: `"{MainRafter}"`, qty RafterQty, weight = qty · L · kg/m with L = (ID/2 − drumØ/2)/cos(cone)/1000.
5. Central rafters (only if CentralRafter set): same formula, qty RafterQty.
6. Curb channel: `"{CurbChannel} x {CurbWidth}"`, length π·ID/1000 m.
7. Central drum: `"Ø{drum} x {drumThk} THK"`, qty 1 (if drum > 0).
8. Anchor chairs: qty AnchorChairQty, weight 0 (remark "per std. detail").
ISMC kg/m: 75 → 6.8, 100 → 9.2, 150 → 16.4, 200 → 22.1. MOC `"IS 2062 Gr. E250"`.

## 5. Drawing — unchanged endpoints

`POST /api/jobs/{id}/generate-drawing` (with or without `agentId`) works for tanks.
Agent path: `PendingAgentJobDto` gains `tankSpec` — the stored submit payload
`{ module, projectInfo, shopTank|siteTank, overrides }` as a JSON object. The agent
deserialises it into `ShopTankJobSpec` / `SiteTankJobSpec` (§6). Completion reporting unchanged.

## 6. .NET runner API (Agent 1 provides, Agent 2 consumes)

Namespace `MegaEngineeringSuite.RemoteJob` (records in `MegaEngineeringSuite.Engineering`;
runners in `MegaEngineeringSuite.CadAutomation`, next to the existing three runners):

```csharp
public sealed record TankParameter(string Key, string Label, string? Unit, string Group, string Actual, string Estimated, bool Editable);
public sealed record TankSummaryItem(string Key, string Label, string Value, string? Unit);
public sealed record TankBomRow(string ItemNo, string Description, string Moc, string Dimension, int Qty, double WeightKg, string Remark);
public sealed record TankCalculationResult(int ShellId, IReadOnlyList<TankParameter> Parameters,
    IReadOnlyList<TankSummaryItem> Summary, IReadOnlyList<TankBomRow> Bom, IReadOnlyList<string> Warnings);
public sealed class TankValidationException : Exception { public IReadOnlyDictionary<string,string> FieldErrors { get; } }

public sealed class ShopTankJobSpec { public RemoteProjectInfo? ProjectInfo; public ShopTankInputs ShopTank; public Dictionary<string,string>? Overrides; }
public sealed class SiteTankJobSpec { public RemoteProjectInfo? ProjectInfo; public SiteTankInputs SiteTank; public Dictionary<string,string>? Overrides; }
// camelCase System.Text.Json, property names exactly as §1. RemoteProjectInfo gains `Date` (string, dd-MM-yyyy).

public static class ShopTankRemoteRunner {
  public static TankCalculationResult Calculate(ShopTankJobSpec spec);   // throws TankValidationException
  public static string Generate(ShopTankJobSpec spec, string jobId, string outputFolder, string defaultTitle); // returns .dwg path
}
public static class SiteTankRemoteRunner { /* same two methods with SiteTankJobSpec */ }
```
`Calculate` is the ONLY place parameters/summary/BOM are built — API and agent both call it.
