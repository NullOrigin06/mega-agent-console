NAME: Duty Field: one live heat exchanger as ambient telemetry (master build spec)

CONCEPT: The background is one holographic shell-and-tube heat exchanger, and how it behaves is the live state of the console. All five motifs are views of that one object.

- **Tube field.** The far plane replaces today's blue square grid with an endless tube-sheet plate. It uses the production drilling rule from VesselViewport3D's tubePositions(): 30-degree triangular pitch, mouth OD = pitch/1.25. Every mouth shows its bore wall as a crescent. Each crescent is shaded toward one vanishing point, the projection of the twin's own axis, so the whole plate shares the twin's camera. The lattice never rotates. Only the crescents lean, toward the cursor and toward the twin.
- **Holographic twin.** The twin is the hero. It sits in the one large patch of background engineers actually see on 1366-1440 px laptops: the "stage", the right ~45% of the hero band between the chrome and the first card. Getting this stage needs one approved layout change: the Command Center header is left-aligned at 1024 px and wider.
- **Counter-flow streams.** Inside the glass shell, cold tube-side fluid runs front to rear. Process lines carry it in from the right edge, and its return elbows up into the "pipe rack" under the glass rail.
- **Shell-side flow.** Hot shell-side fluid weaves rear to front over and under the real baffle count. The two flows use separate OKLCH ramps at nearly the same luminance, and the ramps never meet. How far each stream changes colour is the day's "activity": completed jobs in the last 24 h.
- **Agent network.** Paired Local Agents are lit mouths on the plate in the free margins. Their links run along lattice rows and columns into the twin's bolt circles, which act as the hubs. Queued jobs light bolts amber, clockwise from 12 o'clock.
- **Job events.** A dispatch sends a cyan current down a link. A completion lands on the part of the twin that its module owns: a ring on the tube-sheet face, a sequence around the bolt circle, or an emerald scan pass along the shell. It also leaves a fading emerald mouth in the face's 7-day ledger. A failure leaves one rose ring and a "plugged tube". When the API drops, the flow stops and the colour drains out.
- **Pages as camera poses.** Every page is one pose of the same object.
  - Command Center: a 3/4 overview.
  - Jobs: a smaller telemetry view with the network as the hero.
  - Tube Sheet workspace: end-on. The crescents across the whole plate re-aim radially, so the background becomes a converging tube field without moving the lattice.
  - Bonnet Flange workspace: an exploded bonnet with a turning bolt circle.
  - HX Fab workspace: a side section where the tube lanes become literal counter-flow lanes.
  - Large pose changes are hidden in a short haze dip. Small ones tween only the twin inside its stage.

When idle the scene is nearly still: haze drift under 0.5 px/s and a slow twin swing. Motion appears only when work happens. Average luminance stays at 0.012 or below, and text sits in shader-enforced quiet cores. Rendering takes 3 draw calls per frame (4 when the haze refreshes) in raw WebGL2, with a Canvas2D still and a CSS poster as fallbacks. three.js is never in the initial graph.

RATIONALE: **Base: Duty Field.** Both judges picked it (51 and 49 points). It is the only design grounded in the real layout. On 1366-1440 px laptops the cards leave 24-54 px gutters, so the hero band is the only large patch of background, and Duty Field stages the twin there. Its other strengths:
- 'Motion only when work happens' fits a screen engineers stare at all day.
- It has the richest meaning model: activity-driven colour exchange, plugged tubes, the 'you are here' agent, and consideration for CAD.
- It found the missing jobs polling (verified: App.tsx jobs useQuery has no refetchInterval).

**Grafts from Live Section (best engineering, 50 and 48 points):**
- Render plumbing: one attribute-less instanced draw split by gl_InstanceID, RGBA32F data and path textures plus a UBO, half-res RGB10_A2 haze, integer-divisor pacing, the engine singleton, and the renderer-regex static tier.
- Bore crescents instead of 4,000 viewport streaks.
- Network links routed along lattice rows and columns, bolt-circle hubs and a clockwise queue gauge.
- Process lines and pipe-rack risers.
- A flat-luminance OKLCH ramp with an explicit hue path.
- X-ray baffle reveal, typing calm, the fallback quiet guard, the porthole mobile pose, the luminance-budget test, broadcast attribution and the shared twin-spec query.

**Grafts from Bundle Nocturne:**
- The 7-day tube-face ledger.
- Module-owned completion landings.
- Filmic soft-clip into an accumulation target.
- The haze-dip match cut for large pose changes.
- ~~The scroll-synced CSS scrim.~~ Removed (see Lead decision in Text protection).
- Pixel-budget DPR.
- The once-per-session 'print' opening.
- Freeze after 10 min idle.
- Hover linking from tiles and Sidebar items.
- Fake circle-of-confusion sizing and far-plane fog tint.
- The Canvas2D still that shows the twin.
- The wide shot.
- Deterministic stills for Playwright.

**Must-fixes resolved:**
- Polling is in scope.
- Subtitle promotion is mandatory.
- The header layout decision is made, with a sized contingency.
- Twin LOD by projected size.
- No full-viewport sweeps on navigation.
- A full backdrop-filter audit: lines 448 and 864 never sit over the canvas; 1310, 2786 and 2804 suspend the loop; 4145 and 4173 get solid variants; 3291 is only over the r3f twin, while the ambient is suspended.
- The canvas starts below the sticky glass chrome, with a fade.
- Honest attribution and a single meaning for amber.
- Verification gates.
- Finished fallbacks.
- Real GPU-contention signals.
- A motion control that is discoverable when the sidebar is collapsed.

**Corrections the judges flagged:**
- The VP is now derived from the camera, never hand-placed, and the anchors were computed numerically for 1366, 1440 and 1920.
- Memory figures are restated honestly.
- Blur no longer hides completions.

--- LAYER 0: Static CSS poster: the first-paint frame and the permanent underlay. It replaces the .app-shell-body blueprint grid.
placement: `<div class="ambient-root" aria-hidden="true" role="presentation" inert>` is rendered by AmbientBackground as the first child of .app-shell.
- Styles: `position: fixed; left: 0; right: 0; top: var(--ambient-top, 91px); height: calc(100lvh - var(--ambient-top, 91px)); z-index: 0; contain: strict; pointer-events: none`.
- .app-shell-body becomes `position: relative; z-index: 1` with no background-image.
- The sidebar (z 90, solid) covers the root's left edge. The canvas is never reallocated when the sidebar collapses; it is scissored instead.
- --ambient-top = bottom of .console-header plus .pipeline-rail, measured at scroll 0 with a ResizeObserver on both. That is 91 px at 1440x900. Nothing animated ever sits under the two glass bars.
- Children: .ambient-poster, which holds the CSS layers, and the `<canvas>`.
motion: None.
- When the first GL frame is ready, the canvas crossfades in: 600 ms, WAAPI opacity 0 to 1, cubic-bezier(.22,.61,.36,1). The poster then gets visibility:hidden.
- On context loss the poster fades back in over 200 ms.
colour: - Base: body #05070d (L 0.0021).
- Lattice: an SVG data-URI tile, 34 x 294.45 px (10 triangular rows at a 29.445 px row step). Circles have r 13.6 px and a 1 px stroke of #3b82f6 at opacity 0.055. Row 10 is left empty as a pass-partition lane, giving a major rhythm like the old 120 px lines.
- Phones (≤640 px) use a 28 x 242.5 px tile with r 11.2.
- Glow: radial-gradient(30% 26% at 76% 11%, rgba(11,26,51,0.85), transparent 72%) plus radial-gradient(60% 50% at 100% 100%, rgba(6,30,40,0.30), transparent 70%).
- Peak poster luminance is ≤ 0.011.
tech: Plain CSS in src/components/ambient/ambient.css, imported eagerly from AmbientBackground (about 0.6 KB gzip). The canvas lattice uses the identical pitch, row step and origin: x = viewport 0, y = ambient top. The crossfade therefore never jumps.
data: None. Under forced-colors and print it is hidden together with the canvas.

--- LAYER 1: Atmosphere: domain-warped fBm haze (Stripe minigl style), the 'expensive black'. Shared by the tube field and the hologram as their medium.
placement: Covers the whole canvas, scissored from x = sidebar right edge (232, 64 or 0 px) to the viewport right.
- Main pool: an ellipse centred on the stage centre, radii 0.62 x stageW by 0.34 x stageW.
- Secondary pool: bottom-right corner, visible in gutters at 1680 px and up.
- Falls to 35% toward the bottom-left.
- Exactly 0 inside quiet cores (layer 10).
motion: q = fbm(p + t/47 s); r = fbm(p + 1.7q + t/61 s); 3 octaves; p = fragCoord / (0.6 x canvasH).
- ±25% breathing.
- Apparent drift is under 0.5 px/s, so low refresh rates never step visibly.
- Refresh: T3 10 Hz, T2 5 Hz, T1 baked once, then static.
colour: mix(#070c18, #0b1a33, n), plus a #062a33 teal accent of n x 0.4 near the twin. Peak #0a1c2b, L ≤ 0.0107.

Workspace tint, an OKLab hue shift at equal L:
- TubeSheet: 25% chroma toward #3987e5.
- HeatExchangerFab: 25% toward #199e70.
- BonnetFlange: only 15% toward #d95926, because large warm areas advance.

apiOk=false: saturation -85% over 1.2 s.
tech: WebGL2 fullscreen-triangle fragment pass (pass A) into a half-resolution RGB10_A2 FBO. That format is colour-renderable in core WebGL2 and gives 4x the precision of RGBA8 on near-black. The composite (pass B) samples it bilinearly, which acts as free far-plane blur. T1 bakes it once at 0.25x. A 128² tileable value-noise R8 texture is baked on the CPU at init in about 1 ms, and the shader takes 3 taps per octave.
data: - Page intensity: modules 1.0, jobs 0.7, workspace 0.85.
- Module tint follows workspaceModule.
- apiOk sets saturation.
- The pool centre follows the measured stage rect and eases with pose changes (k = 1 - 0.94^(dt x 60)).

--- LAYER 2: Tube field, far plane: an endless tube-sheet plate whose mouths show bore-wall crescents aimed at the twin's vanishing point
placement: Fills the canvas, with its origin fixed at the ambient-root top-left so sidebar collapse never shifts it.
- Pitch 34 CSS px (28 px at ≤640), 30-degree triangular, row step 29.445 px. Mouth radius 13.6 px = pitch/1.25/2 x 2, the real OD rule. Every 10th row is an empty pass-partition lane.
- Halo: an ellipse around the twin's projected bbox (1.25x bbox width by 1.6x bbox height) raises rim alpha.
- Falloff to 40% toward the far bottom-left.
- VP (vanishing point) = P·(axisDir, 0), never hand-placed. In OVERVIEW at 1440x900 it lands at about (-16%, -2%) of the canvas; at 1366x768, (-18%, -2%); at 1920x1080, (-4%, -4%). All are off-canvas top-left, behind the title, so crescents in the gutters all lean up-left toward the hero copy.
motion: The lattice is static in screen space: no rotation and no parallax. That avoids moiré and vection.
- Crescent offset = normalize(VP - m) x min(0.07·|VP - m| / canvasH, 0.30) x p, plus a pointer term of (nx, ny) x 2.0 px low-passed with τ 0.9 s. The plate reads as a drilled plate tilting toward the cursor while no rim moves.
- On a pose change, crescents crossfade (600 ms) between the old and new VP fields. They are never swept.
- The scan band echo raises rims at the matching screen x by +0.02 alpha (Gaussian, σ 40 px).
colour: Rims are #3b82f6 at these alphas:
- 0.060 in open margins
- 0.095 in the twin halo
- 0.035 behind the content column (seen only in the 20-32 px card gaps)
- 0 in quiet cores

The lit bore crescent is #06b6d4 at alpha 0.045, fading with depth. Bore bottoms are #04060b, so holes read darker than the plate, as on machined steel. The area-average contribution is about L 0.0012.
tech: Analytic, in the full-resolution composite (pass B), not in the half-res FBO, so the 1 px rims stay crisp.
- Nearest mouth: 4 candidates from two rectangular grids (p, p√3).
- Ring coverage = 1 - smoothstep(0, fwidth(d), |d - r| - 0.5 px), with a minimum of 1 device px.
- Frequency guard: alpha x (1 - smoothstep(0.35, 0.6, fwidth(cellUV))).
- T1: alpha x 0.6.
data: - Mouths are the slot grid for agent nodes (layer 4).
- Halo +30% while any job is running, eased over 4 s.
- TubeSheet FACE pose: lattice x 1.25 and crescents aimed radially at the face centre.

--- LAYER 3: Tube field depth: bore streaks with exponential fog, used only in the twin halo and the FACE pose
placement: One streak per mouth from the mouth toward the VP, only for mouths inside the twin halo, or inside 2.2 x face radius in the FACE pose.
- Length = clamp(0.12·|VP - m|, 10, 90) px; FACE pose k 0.20, cap 110 px.
- Streaks within 60 px of the VP fade to 0, so there is never a convergence knot.
- Never inside a quiet core or its feather.
- Counts: T3 ≤ 600, T2 ≤ 300, T1 ≤ 120.
motion: No particles travel the far field.
- Endpoints follow the VP, which moves with the twin swing (≤ 0.4 px/s) and with tilt.
- Pose changes crossfade the streak set over 600 ms.
colour: Starts as #3b82f6 at alpha 0.045 at the mouth.
- Fog f = 1 - exp(-3.2·s) tints toward #06b6d4, reaching alpha 0 at the tip.
- x 0.4 in the content column.
- SECTION pose only: alternate rows are tinted with the cold LUT end #5aa3ec and the hot LUT end #c2a975 at alpha 0.022, echoing counter-flow.
tech: Range 0 of the single attribute-less instanced draw (pass C).
- The mouth position comes from gl_InstanceID → (col, row), which uses the halo cell list packed in the UBO as a start-col/row rectangle. No buffer writes when the VP moves.
- 1 device px quads with distance-to-centreline AA.
data: - Alpha x (0.85 + 0.15·min(1, running/3)).
- apiOk=false desaturates.

--- LAYER 4: Agent network: workstation nodes on lattice mouths, routed along lattice rows and columns into the twin's bolt circles (the hubs)
placement: Hubs:
- Front bolt circle (PCD 1.125D, boltQty bolts): primary hub, at about (86%, 13%) at 1440.
- Rear bolt circle: serves stage-strip nodes.

Node slots snap to the nearest mouth, in this preference order:
1. Stage strip: between header text right + 40 px and the rear bonnet, at most 3, linked to the rear hub with short horizontal runs.
2. Right gutter, if ≥ 40 px: column x = the even-row lattice column nearest the gutter centre, at least 12 px from the card edge. v from 30% to 94% of the canvas, spacing ≥ 72 px (7 slots at 1440x900). Linked to the front hub.
3. Left gutter, only if ≥ 160 px wide (viewport ≥ ~1760): routed along the bottom lattice row at canvasH - 20 px to the right gutter column. Hidden behind cards where they cover it, glimpsed in gaps.

Placement rules:
- Clear of quiet cores + feather by ≥ 36 px, and clear of the twin bbox.
- Slot = FNV-1a(agentId) with linear probing, so a workstation keeps its spot across sessions.
- Up to 12 nodes plus one 'n more' cluster node with a double ring.
- Links: a dynamic tether from the nearest bolt to the nearest mouth, then horizontal along that lattice row, then vertical along an even-row column. A vertical run clears odd-row rims by 3.4 px. Inside even-row mouths the link is gapped, so it never draws across a hole; traversed mouths' rims get +0.04 alpha. Turns have a 6 px fillet.
motion: Nodes are static.
- Online nodes breathe ±12% alpha, 6.4 s, with a per-node phase offset.
- Agent online: ring scales 0.6 to 1 over 900 ms and the link draws out from the hub over 1.2 s.
- Agent offline: greys over 1.5 s.
- Running job: its link carries a current, a 3 px on / 9 px off dash flowing hub to node at 14 px/s. With exactly one agent online it is that node's link; with several, every online link at 50% alpha (broadcast). Never more than 3 links animate.
- Queued jobs: front-hub bolts light clockwise from 12 o'clock, one per queued job up to boltQty, each fading in over 600 ms.
colour: - Online node: ring #06b6d4 alpha 0.55, r 4 px; core #a5f3fc alpha 0.70, r 1.5 px.
- This browser's own paired agent (utils/agentPairing.ts): an extra 'you are here' ring at r 8 px, #06b6d4 alpha 0.22.
- Offline node: ring #6b7a94 alpha 0.20, no core. Its link is #4b5870 alpha 0.08, dashed 4 on / 6 off.
- Online link: #06b6d4 alpha 0.12, 1 px.
- Hub bolts: #67e8f9 alpha 0.22. Queued bolts: #f59e0b alpha 0.40 (amber = waiting/warn, matching .status-pill-queued and pipeline-node-warn).
- No agents paired: one dashed ghost slot, #4b5870 alpha 0.22.
- Far-plane fog: nodes and links get a fixed 30% tint toward #0b1a33.
- Jobs page: all network alphas x 1.5.
tech: - Links are range 2 of pass C: at most 32 capsule segments, rewritten into the data texture only when layout or agents change.
- Nodes, bolts and currents are sprite instances with a ring SDF.
- Currents and timing come from the event pool in the UBO (8 x vec4: type, startTime, linkIndex, param). They are evaluated in-shader with no per-frame CPU work.
data: - agents[]: count, online state, agentId slot, local-agent flag.
- Queued count drives the lit bolts.
- Running jobs drive link currents. Attribution is exact only when one agent is online; otherwise broadcast. JobSummary has no agentId.
- apiOk=false: currents stop, links go dashed, and the hub gets a #f59e0b halo at alpha 0.10-0.22 on a 5 s sine (never a flash).

--- LAYER 5: Holographic twin glass: fresnel shell, bonnet volumes, scanlines and scan band
placement: Same object and camera as layer 6.
- Inside the screen bbox only, computed on the CPU and passed as a uniform rect; the shader branches on it.
- At 1440x900 in OVERVIEW the bbox is about x 58-96%, y 2-22% of the canvas.
motion: Scanlines: period 3 device px, 12% modulation, drifting up at 5 px/s. They fade by fwidth near Nyquist. T3 only.

Scan band: an axial Gaussian with σ = 6% of the twin length, sweeping rear to front in 3.2 s with easeInOutSine.
- Idle: every 24 s at 50% strength.
- Any job running: every 12 s at full strength, confined to the running module's region when only one module is running.
- Completion: an immediate sweep, rate-limited to 1 per 8 s.
- Every per-pixel change ramps over ≥ 300 ms with ΔL ≤ 0.06 for area fill.
colour: - Fill: #0e7490 x (0.010 + 0.05·F²), where F = 1 - |n·v|; back faces x 0.5.
- Scan band adds #a5f3fc at alpha 0.06.
- Multiplied by the quiet mask and page intensity.
tech: Inside pass B: analytic ray-cylinder (shell, channels) and ray-ellipsoid (2:1 heads) tests, about 60 ALU, on about 10% of pixels. No mesh. T1: no fill (rim lines only).
data: - Module-region tint follows workspaceModule and hover.
- apiOk=false stops the scan band and applies x 0.5.
- When VesselViewport3D opens: fade to 0 in 400 ms, then the loop suspends.

--- LAYER 6: Holographic twin wireframe: the hero, which also carries the tube-sheet face ledger
placement: OVERVIEW pose, solved for the measured stage rect.
- Camera: vertical FOV 30°, F = (canvasH/2)/tan 15°, principal point = stage centre (lens shift).
- The view direction is 36° off the vessel axis (camera in front of and right of the front face), pitched down 4°.
- Distance d = F / D_px, with D_px = clamp(80, 0.62 x stageH, 132).

Measured at 1440x900 (canvas 1208x809, stage x 614-1196, height 177; D_px 110):

| Feature | Position (% of canvas) | Projected size |
|---|---|---|
| Front bonnet tip | (90.6, 13.2) | |
| Front tube-sheet face centre | (86.2, 12.6) | 123 px |
| Shell mid | (74.9, 10.9) | |
| Rear face | (65.9, 9.6) | 99 px |
| Rear tip | (63.3, 9.3) | |

At 1366x768 the face is at (87.0, 13.1); at 1920x1080 it is at (83.6, 10.2).

Anchoring:
- Saddles at 0.2L and 0.8L may tuck up to 12% of the bbox height behind the teaser card top. Cards slide over it.
- On modules, twin intensity x (1 - 0.65·smoothstep(0, 280, scrollY)).

Geometry from VesselSpec (TYPICAL_VESSEL: L/D 3.75, bonnets 0.625D, tube sheet OD 1.19D, 24 bolts on 1.125D PCD, 6 baffles at 25% cut, N1/N2 at 0°), clamped to:
- L/D 2.5-6
- baffleQty ≤ 12
- nozzle OD 0.08-0.25D
- boltQty 8-48
motion: OVERVIEW and TELEMETRY:
- Yaw swings ±6° about the 36° base on a 96 s sine (peak 0.39°/s).
- Meridians roll 360°/120 s (3°/s).

Other poses:
- BONNET: continuous roll 360°/120 s.
- FACE: roll 360°/150 s.

Cursor tilt is ±3° yaw / ±2° pitch about the twin centre, τ 0.9 s.

Opening 'print' (once per session via sessionStorage mega.ambient.opened; skipped in Still and reduced motion):
- 0 ms: haze only.
- +200 ms: the scan band prints the wire rear to front over 1.6 s; lines exist only behind the band.
- Face mouths ripple on centre-out over 500 ms.
- +1.8 s: particles fade in over 1.0 s.
- +2.0 s: nodes ignite with an 80 ms stagger and links draw outward from the hubs.
- +2.6 s: steady state.
colour: Lines in #06b6d4:
- near alpha 0.38, far 0.14, back-facing 0.08
- silhouettes (2 analytic tangent generators per frame) #67e8f9 alpha 0.50
- shell rings and tube sheets 0.22
- baffles (arc + chord) 0.22
- bonnets 0.18
- nozzles 0.24
- saddles 0.12
- face mouths #7dd3fc alpha 0.30

Scan band: x 1.6 toward #a5f3fc, capped at alpha 0.62. X-ray reveal: 37 baffle tube-hole dots per baffle, #a5f3fc alpha 0.25, only inside the band and only when R_px ≥ 50.

Running-module region (≤ 30% chroma): +alpha 0.20 and a 30% mix toward MODULE_COLORS.
- Tube sheets + bundle → #3987e5
- Bonnets + flanges + bolts → #d95926
- Shell + baffles + nozzles → #199e70

Face ledger (last 7 days):
- Completed: mouth hash(job.id) mod mouthCount (with probing) filled #10b981 at alpha 0.16·exp(-age/72 h), floor 0.04.
- Failed within 12 h: plugged tube, filled #ef4444 at alpha 0.20, at most 3, never blinking.
- Failed 12 h-7 d: #ef4444 rim at alpha 0.08.
tech: Range 1 of pass C. Segments live in an RGBA32F data texture, 2 texels per segment: endpoints in twin-local units, plus region id, alpha class and reveal flag. The MVP is a uniform built from about 80 lines of hand-rolled mat4 math (no three.js).

LOD from projected shell radius R_px (55 px in OVERVIEW at 1440):
- Meridians = clamp(round(R_px/4.5), 8, 16).
- Ring segments = clamp(round(2πR_px/7), 24, 64).
- Shell rings = 9 if the ring spacing is ≥ 14 px, else 5.
- Bolts = boltQty if spacing ≥ 6 px, else every 2nd.
- Face mouths = the largest hex-ring count with mouth pitch ≥ 9 px: 61, 91, 127, or 169 in the FACE pose.
- Total segments ≤ clamp(bboxArea/30, 600, 1900).
- Any detail whose projected spacing is under 4 px fades out.

Quads are 1 device px with capsule-SDF AA, depth-cued by view z.
data: - Vessel spec comes from a shared useTwinVesselSpec(jobs): the same ['vessel-twin-job', id] query as ModulesHome, so it is a cache hit on every page.
- Running jobs per module set the region tint and confine the scan band.
- Completions land per module (layer 9).
- The 7-day ledger is drawn on the face.
- Hovering a module card or Sidebar module item: that region +25% over 400 ms (a brightness-only change, also allowed in Still).
- apiOk=false stops the scan band.

--- LAYER 7: Shell-side flow: the hot stream weaving over and under the real baffles (serpentine)
placement: Inside the shell, from N1 (rear, 0.1L from the rear sheet) to N2 (front, 0.1L from the front sheet).
- Transverse y(s) crosses each baffle window alternately at ±0.72R. It is a cosine with peaks locked to the baffle stations L·(i+1)/(n+1).
- 12 streamlines with offsets s0 ∈ [-0.85, 0.85]. Lateral z = ±0.55R·√(1 - (y/R)²), so the cloud fills the cylinder.
- Projected with the twin MVP. Hidden in the FACE and BONNET poses.
motion: Along-arclength speed:
- 20 px/s idle (about 23 s per traversal at 1440).
- Busy: 20 x (1 + 0.35·running + 0.12·queued), capped at 34 px/s.
- Changes ease with k = 1 - 0.94^(dt x 60).

Phases are stratified, (i + 0.8·hash)/n, so particles never clump or stall. They fade over 4% of the path at each end. apiOk=false: speed falls to 0 over 2 s.
colour: Hot LUT row, with explicit OKLCH hue path and flat luminance:
- (0.745, 0.075, 85°) #c2a975, Y 0.41
- (0.74, 0.062, 72°) #c4a580
- (0.735, 0.05, 60°) #c1a28a, Y 0.39

Chroma is capped at 0.075, so it never reads as queued amber #f59e0b (C ~0.17), BonnetFlange #d95926 or failure rose.
- Sampled at u = s·(0.3 + 0.7·A), where A is activity.
- Core alpha 0.45, Gaussian falloff.
- Size 2.0 ± 0.4 px at the focus plane (the shell axis). Fake depth of field grows it to 4 px, with alpha x (2/size)².
- Heat parcel after a completion: a 14-particle window gets alpha x 1.8 for one traversal.
tech: Range 3 of pass C (sprites). The vertex shader reads a CPU-built path texture: RGBA32F, 128 samples x ≤ 48 paths, read with texelFetch and lerped, rebuilt only on a spec or layout change. Position = path(fract(seed + phase·speedScale_i)), speedScale_i ∈ 0.85-1.15. The CPU integrates one float64 phase per path family and passes fract().

Counts: T3 360, T2 220, T1 110. Jobs page x 0.5.
data: - running/queued set the speed.
- A = clamp(completedLast24h/12, 0, 1), eased with τ 10 s so a refetch never pulses it. This is documented as 'activity', not a heat-duty result.
- Completion events inject heat parcels.
- apiOk=false stops the flow.

--- LAYER 8: Tube-side counter-flow: cold stream in the tubes, process lines and pipe-rack risers
placement: Tube lanes: 7 (the axis plus a hex ring of 6 at 0.45R), from the front tube sheet to the rear.
- P1, cold supply: a horizontal process line from the canvas right edge into the front channel's axial nozzle at the face height (about 13% at 1440; a ~110 px visible run across the right gutter).
- P2, warmed return: leaves the rear channel axial nozzle, runs 0.4D away from the twin, then elbows up into the canvas top. It disappears under the glass rail, read as the pipe rack.
- P3 and P4, shell nozzle risers: 0.9D runs from N1 and N2 along each nozzle's angleDeg (0° = up), vanishing under the rail.
- Process lines are never routed through quiet cores.

Pose behaviour:
- SECTION pose: the lanes are horizontal, so they are literally the counter-flow lanes.
- FACE pose: particles emerge from mouths and shrink into fog.
motion: Tube lanes: 16 px/s idle, rising to 28 px/s with the same easing as layer 7. Direction is front to rear (right to left on screen in OVERVIEW and SECTION).

P1/P2: 22 px/s. Risers: 18 px/s.

Tube-side particles are 1.4 x 5 px capsules along their velocity, so they read differently from the round shell-side dots.
colour: Cold LUT row (OKLCH):
- (0.70, 0.13, 250°) #5aa3ec, Y 0.345
- (0.72, 0.115, 268°) #86a1ed
- (0.74, 0.10, 286°) #a5a2e7, Y 0.395

Warming reads as a slight lift toward violet. The two rows never meet (hue 286° vs 60°), which models the approach temperature and avoids the grey midpoint of a blue-to-orange mix.
- Sampled at u = s·(0.3 + 0.7·A).
- Alpha 0.42.
- P1 = cold row at u 0. P2 = cold row at u_max.
- Risers: hot row at u 0 (N1) and at u_max (N2).
- Pipe lines themselves: 1 px #06b6d4 at alpha 0.10.
tech: Range 3 sprites plus range 1 lines in pass C. The LUT is a 64x2 RGBA8 texture generated at init from OKLCH in lut.ts.

Counts:
- T3: 7x30 tube + 120 process/riser
- T2: 5x28 + 80
- T1: 5x14 + 40
- Mobile porthole: two counter-rotating annuli of 48 each.
data: - Speed and A as in layer 7.
- Lane count = min(7, f(tubeQty)).
- BONNET pose: only 40 particles show, entering the nozzle; hot risers are hidden.
- apiOk=false desaturates and stops it.

--- LAYER 9: Job event transients: dispatch currents, module-owned completions, failure rings, batch rings
placement: - Dispatch: hub to node.
- Completion: the return pulse ends at the front hub, then lands on the part its module owns:
  - TubeSheet: a ring on the face.
  - BonnetFlange: the front bolt circle.
  - HeatExchangerFab: the full shell.
- Failure: one ring at the module's part (or at the node, when exactly one agent is online).
- Batch: one ring at the front hub.
motion: Dispatch (queued → running): #67e8f9 pulse hub → node, 1.8 s easeInOutSine, a 6-point trail of 24 px. With more than one agent online it is a 50%-alpha broadcast to every online node.

Completion (running → completed): a #34d399 pulse node → hub (1.6 s), or hub-local only when several agents are online. Then the module landing:
- TubeSheet: a ring from r 0.08D to 0.55D on the face over 1.8 s, easeOutQuad, and the ledger mouth lights.
- BonnetFlange: the bolts light in sequence over 1.2 s.
- HX Fab: one 2.4 s emerald scan pass.
A heat parcel then launches.

Failure: a ring growing r 10 to 34 px over 1.4 s, never repeated. Then a plugged tube (TubeSheet/HX Fab) or a bolt tint (BonnetFlange) for 12 h.

Agent online/offline: see layer 4.

Limits:
- ≤ 3 concurrent; extras queue 700 ms apart.
- Queue ≤ 6, oldest dropped.
- Transitions within 1.5 s coalesce.
- More than 6 transitions in one diff become a single batch ring, r = 18 + 6·log2(n).
- Every transient is one rise and fall of ≥ 0.9 s.
colour: - Dispatch: #67e8f9, core alpha 0.85, trail 0.25 → 0.
- Completion pulse: #34d399. Completion ring/pass: #10b981, alpha 0.40 → 0.
- Failure: #ef4444, alpha 0.32 → 0. Rose is the only warm, saturated hue for faults.
- Batch: #06b6d4 alpha 0.30.
- Module identity colours are never used for events.
tech: Sprite and ring-SDF instances, plus 6 reserved ring sub-ranges of 48 segments in the line data texture (texSubImage only at event start), driven by the UBO event pool. The CPU appends events only when the job or agent arrays change.
data: useAmbientSignals diffs JobSummary[] by id → status.
- The first snapshot after mount is a silent baseline.
- A job first seen as completed within 60 s of completedAt still emits.
- The agents diff comes from the existing 15 s poll.
- Jobs polling is added to App.tsx: refetchInterval 5 s while any job is queued or running, otherwise 60 s; refetchIntervalInBackground false.

--- LAYER 10: Resolve: soft-clip, zone caps, quiet mask, vignette, dither
placement: Pass B: a full-screen triangle at the tier DPR, scissored to the content area (x ≥ sidebar right edge).

Quiet cores: up to 12 rounded rects in the UBO, stored in document coordinates minus a uScrollY uniform.
- Block rect for the gradient title; line boxes via Range.getClientRects for subtitles and labels.
- Inflated 16 px horizontally and 12 px vertically, corner radius 12, with a 56 px feather (smoothstep∘smoothstep, approximating a 13-stop eased gradient).
- Fallback guard: if a route registers no rect within 500 ms, the top 140 px x the left 60% of the canvas gets 60% suppression, plus a dev console.warn.
- Top 24 px of the canvas: fade to exact base, so its edge under the rail is invisible.
motion: Rects follow scroll through one uniform. They are re-measured after route commit (useLayoutEffect, then rAF) and on ResizeObserver or MutationObserver changes of marked elements. During active scroll the cap rises to 60 fps on T2/T3 for 300 ms.
colour: out = base + haze + lattice + glass + softclip(2 x accum).
- Soft-clip: knee at L 0.12, hard ceiling L 0.30.
- Zone caps on area terms (haze + lattice + glass):
  - content column ≤ L 0.020
  - stage and gutters ≤ L 0.040
- Lines and points: x 0.4 in the content column, and the soft-clip ceiling applies everywhere.
- Inside a quiet core everything is 0, the base stays exact #05070d (no pull to #04060b: it read as a dark box), and there is no dither.
- Vignette: 1 - 0.20·smoothstep(0.55, 1.15, r).
- IGN dither outside cores: c += (ign(gl_FragCoord.xy) - 0.5)/255, static rather than temporal.
- Alpha written as 1.
tech: Reads the haze FBO (bilinear) and the accum target.
- The accum target is RGB10_A2 at full tier resolution. Pass C additive blending is order-independent, with blendFuncSeparate(ONE, ONE, ZERO, ONE) and light pre-scaled by 0.5, so there is no sorting and no depth buffer.
- Blending and all alphas are in sRGB-encoded space; the budget test uses the same model.
- quiet(), ign() and softclip() live in shared common.glsl.ts, so every pass uses identical functions.
data: - Quiet rects, stage rect, content-column rect and gutters come from DOM measurement.
- Page intensity and transition fog come from state.

--- LAYER 11: DOM safety net: chrome and overlay rules (no scrim)
placement: - No CSS scrim (lead decision): a [data-ambient-quiet]::before scrim the size of the 1100 px header showed as a visible dark box. Elements marked [data-ambient-quiet]: .modules-home-header, .view-header, .controls-bar, .detail-header-nav, .module-workspace-header text, and empty and loading states.
- Under html[data-ambient='live'], .tooltip-content and .workstation-dropdown-content switch to solid surfaces.
- .modal-backdrop, .command-palette-overlay and .command-palette suspend the loop instead.
motion: None. The ≤ 33 ms mask lag on fast scroll is covered by the 56 px feather alone.
colour: 
Solid overlay variants: background #131c30 (opacity 0.98), backdrop-filter none.
tech: Static CSS in ambient.css. No blend modes.
data: html[data-ambient] is 'live', 'still' or 'off', set by AmbientBackground.

== pageStates
**Conventions**
- 'Canvas %' means a percentage of the canvas rect: x from the sidebar's right edge to the viewport right, y from --ambient-top to the viewport bottom.
- The reference viewport is 1440x900 with a 232 px sidebar, which gives a 1208x809 canvas with its top at 91 px.
- The stage rect is measured after every route commit:
  - left = max(header text right + 40, column left + 0.5 x column width)
  - top = canvas top
  - bottom = top of the first card after [data-ambient-header], minus 12
  - right = column right - 16, extended into the right gutter up to the canvas right minus 12
- At 1440x900 with the approved header the stage is about x 614-1196 and 177 px tall.
- Layer weights below are listed in this order: twin, flows, lattice, streaks, network, haze.

**Required layout change (design sign-off before build)**
At ≥ 1024 px, `.modules-home-header { text-align: left; max-width: 1100px; margin: 40px auto 0 }`, with the h1 and p limited to `max-width: 520px`.
- This matches the left-aligned Jobs and workspace headers and frees the stage.
- The extra 16 px of top margin gives the stage its 177 px.
- Contingency if it is rejected and the header stays centred (max 640 px): use a 'flank' variant.
  - The twin switches to the FACE emblem in the right flank. Face diameter = min(flankW - 32, stageH - 16): 152 px at 1440 (flank 284), 126 px at 1366 (flank 247).
  - The network moves to the left flank.
  - Stills for this variant are required at 1366, 1440 and 1920 before shipping it.

**MODULES (Command Center): OVERVIEW pose**
- Camera: FOV 30°, 36° off-axis, pitch -4°, D_px = clamp(80, 0.62 x stageH, 132).
- Anchors at 1440x900: face (86.2%, 12.6%), rear face (65.9%, 9.6%), derived VP (-16%, -2%).
- Weights 1.0 / 1.0 / 1.0 / 1.0 / 0.8 / 1.0.
- Scan band every 24 s at 50% when idle, every 12 s while running.
- On scroll, the twin fades to 0.35 by 280 px and cards slide over it.
- Wide shot (right gutter ≥ 200 px, viewport ≥ ~1672 px):
  - D_px = min(160, 0.62 x gutterW).
  - The face centre moves into the right gutter at (column right + 0.5 x gutterW, 20% of canvas H), at the same 36° and -4°.
  - The barrel recedes up-left across the hero band. The network may also use a left gutter of ≥ 160 px.
  - The twin is never duplicated and its length is capped at 760 px.

**JOBS (list and detail): TELEMETRY pose**
- Same angles, D_px x 0.7.
- The stage sits between the .view-header text and the '+ New Generation Job' button, which is a quiet rect. If the stage is narrower than 300 px, the twin uses the right-gutter FACE emblem at Ø min(gutterW - 24, 96).
- Weights 0.5 / 0.5 / 0.6 / 0.6 / 1.5 / 0.7. The network is the hero, as a vertical node column in the right gutter.
- Scan band only while a job is running.
- Job detail of a running job: that module's region glows +0.15 alpha.

**TUBE SHEET workspace: FACE pose**
- 10° off-axis (nearly end-on), roll 360°/150 s.
- Face diameter = 0.9 x stageH, 127-169 mouths at alpha 0.34.
- The bonnet is exploded out of frame.
- The VP lands at the face centre, so every crescent on the plate aims radially at it, crossfaded over 600 ms. Halo streaks lengthen (k 0.20, cap 110 px). Cold particles emerge at the mouths.
- Lattice x 1.25. Tint #3987e5 at ≤ 30% chroma.

**BONNET FLANGE workspace: BONNET pose**
- 62° off-axis, scale 1.4, framed on the front channel, which is exploded 1.1R.
- 5 meridians and 4 latitude rings, flange ring, 24 bolts on the PCD, pass-partition plate.
- Roll 360°/120 s, so the bolt circle turns like an inspection turntable.
- The shell recedes at alpha 0.10 into fog. Shell-side hot particles and risers are hidden, so warm colour never competes with the #d95926 tint, which is applied only to bonnet and flange lines at 25% mix (haze ≤ 15%).

**HX FAB workspace: SECTION pose**
- 8° off the side view, pitch -6°.
- Near-half cutaway: near longitudinals alpha 0.06, far 0.22, baffles 0.30, 7 horizontal tube lanes at 0.16.
- Cold particles run right to left in the lanes and hot particles weave left to right around the baffles: the literal counter-flow plus shell-side picture.
- The VP goes to infinity, so crescents are parallel and halo streaks become parallel dashes with alternating cold/hot row tint.
- Tint #199e70 at ≤ 30% chroma.

**All workspaces**
- Weights 0.85 / 0.55 / 0.7 / 0.7 / 0.45 / 0.85.
- Other regions x 0.45.
- Scan band only while a job of that module is running.

**Transitions**
- Small deltas (modules ↔ jobs: same angles, scale change only):
  - The twin tweens inside its stage over 900 ms, easeInOutCubic.
  - The far field crossfades its crescent and streak sets over 600 ms and never sweeps.
  - Weights crossfade over 900 ms.
- Large deltas (entering or leaving a workspace, any angle change > 15°) use a haze-dip match cut, 1.0 s total:
  - 0-400 ms: fog density 0.14 → 0.85 and intensity 1 → 0.35, easeInCubic.
  - The pose jumps at 400 ms, hidden by the haze.
  - 400-1000 ms: fog clears, easeOutCubic.
  - 60 fps on T3 during the cut.
- If the stage rect changes mid-tween, the tween retargets from its current value with no restart.
- Still mode and reduced motion: instant redraw of the new pose.
- Sidebar collapse (232 → 64 px): the composition eases to the new content area over 400 ms with no canvas reallocation.

**Mobile and narrow screens**
- Canvas width under 900 px (sidebar off-canvas), PORTHOLE pose:
  - The twin is end-on (90° yaw, -6° pitch), centred at (92% of width, 6% of canvas H). Outer flange radius = 0.34 x width (133 px at 390 px).
  - Rings recede like a tunnel: bonnet rim, flange with 24 bolts, tube sheet, 2 baffle arcs.
  - Inside the tube sheet the lattice continues at 28 px pitch, brighter (rim alpha 0.10 against 0.06).
  - Shell flow becomes 120 vertical crossflow particles between the baffle chords. Counter-flow becomes two annuli: hot clockwise outside, cold counter-clockwise inside.
  - Up to 4 nodes sit along the bottom edge (v 0.93-0.97) and in the right gutter below v 0.5.
  - Always T1, no tilt.
- Tablets ≥ 900 px use OVERVIEW with D_px ≤ 100.

**System states**
- apiOk=false ('signal lost'):
  - Flow decelerates to 0 over 2 s.
  - Saturation -85% over 1.2 s.
  - Links go dashed and the scan band stops.
  - Hub gets an amber halo, alpha 0.10-0.22 on a 5 s sine.
  - Recovery reverses all of this over 2 s.
- 3D twin open (showVessel): the background twin fades to 0 in 400 ms, then the loop suspends with the last frame held. It resumes on close.
- Command palette or modal open: the loop suspends. Their backdrop blur then samples a static frame.
- Still mode and reduced motion use one seeded composed frame:
  - t = 37 s, roll 18°, scan band off, particles evenly spread along their paths.
  - A running job shows its current parked mid-link. A completion in the last 10 min shows a static emerald ledger mouth.
  - The frame is re-rendered on any data change (nodes, ledger, plugged tubes, activity A, apiOk), on page or module change, and on resize (debounced 200 ms).

**AuthScreen** keeps its own CSS and is out of scope.

== interaction
**Cursor**
- Applies only when (pointer:fine) and (hover:hover), and not in Still, reduced motion or T0.
- One passive window pointermove listener stores the latest x and y. They are read once per rendered frame and normalised to the canvas as nx, ny in [-1, 1].
- Twin: ±3° yaw and ±2° pitch about the twin centre.
- Plate: crescent offsets shift by (nx, ny) x 2 px. The lattice rims never move, so there is no large-area parallax.
- The VP is re-derived from the tilted camera.
- Low-pass τ 0.9 s. After 4 s of pointer stillness the target relaxes 50% toward neutral. When the pointer leaves the window, everything eases back to neutral over 2 s.
- Tilt freezes while focus is in an input, textarea, select or contenteditable, and while any pointer button is down (text selection or dragging).
- T3 rises to 60 fps while |target - current| > 0.02°, and drops back to 30 fps 1.5 s after it settles.

**Hover linking (brightness only, also in Still)**
- Pointerenter on a ModulesHome module tile or a Sidebar module item calls ambientBus.highlight(module). The matching region rises +25% over 400 ms and falls back over 600 ms on leave.
- The mapping matches VesselViewport3D:
  - tube sheets → TubeSheet
  - bonnets, flanges and bolts → BonnetFlange
  - shell, baffles and nozzles → HeatExchangerFab

**Scroll**
- One passive listener updates uScrollY. Quiet rects follow it with no layout reads.
- On modules only, the twin fades 1 → 0.35 over 0-280 px. This is opacity, not movement.
- No parallax. In Still, scroll re-renders on demand, coalesced to rAF.

**Typing calm**
- Focusin on an input, textarea or select defers scan sweeps and halves haze updates.
- Both resume 4 s after blur.

**Window and idle pacing**
- Window blur: steady-state animation goes Still. The user is likely in CAD, often on the PC running the Local Agent. Event transients that start or are pending still play at 15 fps for their duration. On refocus, up to 3 events missed while hidden or blurred replay coalesced.
- No input for 60 s: 20 fps.
- No input for 10 min:
  - No job running: freeze until the next pointer, key, scroll or data event.
  - A job running: 15 fps.
- Local-agent-busy: this browser's paired agent (getPairedAgent in utils/agentPairing.ts) is online and running > 0. Cap at 20 fps and drop one tier, because CAD likely shares the GPU.

**No other pointer response**
- pointer-events none, the cursor never changes, there are no clicks or tooltips, and the canvas never takes focus.
- The real interactive model stays the VesselViewport3D card.

**Motion control (WCAG 2.2.2)**
- An icon-only 'Ambient motion' button in Header .header-actions, visible whatever the sidebar state. It has aria-pressed and a Radix tooltip: 'Pause ambient motion' / 'Resume ambient motion'.
- A matching Auto / On / Off radio group in the Header account dropdown.
- Command Palette commands: 'Ambient motion: Auto', 'Ambient motion: On', 'Ambient motion: Off'.
- Persisted in localStorage key mega.ambient.motion, with try/catch on every read and write. The default is Auto, which follows prefers-reduced-motion and its change event live.

== readability
**Contrast numbers**
Computed with the sRGB relative-luminance formula; the script is in the scratchpad as ok2.js.

| Background | L | #9aa8bd secondary | #6b7a94 muted | #3b82f6 title gradient end |
|---|---|---|---|---|
| #05070d (base) | 0.0021 | 8.36:1 | 4.64:1 | 5.48:1 |
| #04060b (quiet core) | 0.0018 | 8.41:1 | 4.67:1 | 5.51:1 |
| Content-column cap | 0.020 | 6.22:1 | 3.45:1 (fails) | 4.08:1 |
| Stage/gutter cap | 0.040 | 4.84:1 | 2.69:1 (fails) | 3.17:1 |

The title is budgeted against its #3b82f6 gradient end (large text, 3:1 → background L ≤ 0.045), not against white.

**1. Subtitle promotion (mandatory)**
Move .modules-home-subtitle (index.css ~2535) and .view-subtitle (~1006) from --text-muted to --text-secondary. Muted text never sits on the background outside a quiet core.

**2. Quiet cores, AA by construction**
- Every on-background text element carries [data-ambient-quiet]: .modules-home-header, .view-header, .controls-bar, .detail-header-nav, .module-workspace-header text, and empty and loading states.
- Rects:
  - Block rect for the gradient title.
  - Line boxes from Range.getClientRects for other text.
  - Inflated 16 x 12 px, with a 56 px eased feather.
- Inside a core: all motifs, haze and dither are 0 and the base is exact #05070d, so the core is the plain page background in the brightest possible frame. The Canvas2D still clears cores to the same base.
- Stars, nodes, links, process lines and streaks are rejected at layout time anywhere within core + feather + 36 px, so nothing is cut in half.

**3. Zone caps**
These cover unmarked text that is secondary or large:
- Content column: area L ≤ 0.020.
- Stage and gutters: area L ≤ 0.040.
- The soft-clip hard ceiling of L 0.30 means no overlap of additive light can exceed it anywhere. Only 1 px lines and 2-4 px points approach it.

**4. Fallback guard**
For routes that register no rect: the top 140 px x left 60% of the canvas at 60% suppression, plus a dev warning.

**5. Scroll-synced CSS scrim (removed)**
Lead decision: no CSS scrim and no QBASE pull inside cores; both showed as a visible dark box the size of the header. The 56 px feather alone covers the ≤ 33 ms mask lag (2,000 px/s x 16-33 ms).

**6. Chrome**
The canvas starts below the glass header and rail, which keep their current look:
- --ambient-top is the bottom of the header plus rail at scroll 0, tracked by ResizeObserver (it also tracks a header wrap at 1024 px).
- When scrolled, the sticky header covers the 57-91 px strip, which shows plain base because the top 24 px of the canvas fade to exact base. There is never a seam, and the glass never samples animation.

Cards stay solid #131c30.

**7. Frame budget**
- Mean frame L ≤ 0.012.
- At least 60% of canvas pixels within ΔL 0.002 of base.
- Peak L ≤ 0.30, reached only on 1 px lines and points in the moving scan band.

**8. Hue discipline**
- Temperature reads by hue at flat luminance: cold Y 0.345-0.395, hot Y 0.39-0.41.
- The hot stream's chroma is capped at 0.075.
- Saturated amber #f59e0b is reserved for queued and degraded states (the app's existing warn semantics).
- Rose is reserved for faults.

**9. Gates (see acceptanceChecks)**
- The Vitest luminanceBudget test, computed from exported constants.
- The ?ambient=lum heatmap.
- A dev readback every 2 s asserting quiet-core max L ≤ 0.0025.
- ?ambient=stress, a deterministic brightest frame: scan band at the title-adjacent end, 3 concurrent events, maximum particles, haze at its peak phase.

== performance
**Architecture**
- AmbientBackground lives in the main bundle (≤ 2.5 KB gzip). It renders the poster and the canvas and drives the engine imperatively from useEffect, with zero React re-renders per frame.
- The engine is a lazy chunk, src/ambient/engine (≤ 14 KB gzip including the GLSL `?raw` strings, which are stripped of comments and whitespace at build). It is imported inside requestIdleCallback after the window load event (timeout 2,500 ms, with a setTimeout 1,200 ms fallback).
- fallback2d is a separate lazy chunk (≤ 4 KB gzip), loaded only when WebGL2 is unavailable or rejected.
- No three.js and no @react-three.
- The engine is a module-level singleton, so React StrictMode double-mounts never create a second context.
- It renders on the main thread, not in a worker or OffscreenCanvas. Quiet rects and scroll must stay frame-synchronous with the DOM, Safari before 17 lacks WebGL in OffscreenCanvas, and a transferred canvas cannot fall back.
- CPU per frame is ≤ 0.3 ms: about 40 uniforms and one std140 UBO bufferSubData, with zero allocations (typed arrays, a fixed event pool of 8). Phases accumulate in float64 and are passed as fract().

**Context**
- getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true}), always writing alpha 1.
- Programs compile with KHR_parallel_shader_compile; COMPLETION_STATUS is polled across idle frames, and LINK_STATUS is checked once.
- No getError or getParameter calls in the loop.

**Passes per frame (3 draws, 4 when the haze refreshes)**
1. A: haze into a half-res RGB10_A2 FBO, only on refresh ticks (T3 10 Hz, T2 5 Hz, T1 baked once at 0.25x).
2. C: one attribute-less `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, N)` into the full-res RGB10_A2 accum target, additive. It branches on gl_InstanceID ranges: 0 streaks, 1 twin wire and pipes, 2 links, 3 sprites (flows, nodes, bolts, events, rings). Data comes from RGBA32F data textures (segments; paths at 128 x ≤ 48) and the UBO (≤ 12 quiet rects, 8 events, pose and intensities). The clear is scissored to the content area.
3. B: composite full-screen triangle to the default framebuffer: haze upsample, lattice and crescents, analytic glass inside the twin bbox, soft-clip of the accum, zone caps, quiet mask, vignette, IGN dither.

Instance budget at T3: about 1.6-1.9k wire + ≤ 600 streaks + ≤ 32 links + 288 event-ring segments + about 800 sprites, so ≤ 3.6k instances.

**Budgets**
- GPU ≤ 2.0 ms per rendered frame at 1440x900 and T3 (2.2 MP) on Iris Xe; ≤ 3 ms on UHD 620 at T1.
- GPU memory, stated honestly:

| Item | Size |
|---|---|
| Accum RGB10_A2 at the T3 3.0 MP budget | ≤ 12 MB |
| Haze half-res | ≤ 3 MB |
| Data textures and LUT | < 0.3 MB |
| **Total at T3** | **≤ 16 MB** |
| **Total at T1 (1.4 MP)** | **≤ 7 MB** |

**Resolution**
- Effective DPR = min(tierCap, devicePixelRatio, sqrt(pixelBudget/cssPx)).

| Tier | DPR cap | Pixel budget |
|---|---|---|
| T3 | 1.5 | 3.0 MP |
| T2 | 1.25 | 2.2 MP |
| T1 | 1.0 | 1.4 MP |

- ResizeObserver uses device-pixel-content-box, falling back to round(css x dpr). It is debounced 150 ms.
- Height uses 100lvh, so mobile toolbars never trigger a resize. There is no reallocation on sidebar toggle (scissor only).

**Frame pacing**
- Integer divisor: render every Nth rAF with N = round(refresh / target), where refresh is the median of 30 rAF deltas. That gives 30 fps on 60 and 120 Hz and 28.8 fps on 144 Hz, with no judder.
- Base 30 fps. T1 and mobile 20 fps.
- 60 fps on T3 only during tilt convergence, pose tweens, haze-dip cuts, the opening print and 300 ms after scroll.
- dt comes from rAF timestamps, clamped to ≤ 50 ms. Scene time only advances while running.

**Tiers**

| Tier | DPR | Shell particles | Tube particles | Process | Wire max | Streaks | Haze | Glass | FPS |
|---|---|---|---|---|---|---|---|---|---|
| T3 | 1.5 | 360 | 210 | 120 | 1,900 | 600 | 10 Hz | fill + scanlines | 30/60 |
| T2 | 1.25 | 220 | 140 | 80 | 1,300 | 300 | 5 Hz | fill, no scanlines | 30 |
| T1 | 1.0 | 110 | 70 | 40 | 700 | 120 | baked | rims only | 20 |
| T0 | — | — | — | — | — | — | — | — | one composed Still per change |

**Starting tier**
- T0 (static) if any of:
  - prefers-reduced-motion or motion Off
  - no WebGL2
  - failIfMajorPerformanceCaveat rejects the context
  - the WEBGL_debug_renderer_info string matches /swiftshader|llvmpipe|software|basic render|microsoft basic/i (RDP and VM sessions)
  - battery < 20% and not charging
- T1 if any of: hardwareConcurrency ≤ 4, deviceMemory ≤ 4, (pointer: coarse), saveData, canvas width < 900, battery < 30% and not charging. Battery and deviceMemory are Chromium-only and wrapped in try/catch.
- T3 if hardwareConcurrency ≥ 8, deviceMemory ≥ 8 or absent, and a fine pointer.
- Otherwise T2.

**Governor**
- A rolling 60-frame window of render intervals, plus EXT_disjoint_timer_query_webgl2 GPU ms where exposed.
- Step down one tier if p90 > 1.25x the target interval in 2 consecutive windows, or if the average GPU time is > 4 ms.
- Step up after 10 s with p90 < 0.7x, at most once per 8 s, never above the detected tier + 1.
- Two downgrades in a session lock the tier. If T1 still fails for 5 s, go to T0.

**Pause rules**
- document.hidden: cancel rAF entirely (don't skip frames) and freeze the clock.
- Window blur: Still, with event transients at 15 fps.
- Idle: 60 s → 20 fps; 10 min → freeze if nothing is running, else 15 fps.
- Local agent busy: 20 fps and -1 tier.
- Suspend while ambientBus has the 'twin3d', 'palette' or 'modal' reason.

**Context loss**
- webglcontextlost: preventDefault, stop the loop, fade the poster in.
- webglcontextrestored: one init(gl) rebuilds every program, texture, FBO and the UBO from CPU-side sources.
- After 2 losses: the Canvas2D still for the rest of the session.
- Tested via WEBGL_lose_context from ?ambient=debug.

== accessibility
**Decorative markup**
- .ambient-root is `aria-hidden="true"`, `role="presentation"` and `inert`. It has no tabindex, never calls focus(), registers no key handlers and never calls preventDefault.
- pointer-events none and contain strict. position fixed and present from first paint, so it causes no layout shift (CLS 0).
- Everything it shows is redundant with PipelineStatusRail (role=status), the sidebar agent summary and the job views. Colour is never the only cue, and nothing is conveyed only by the background (WCAG 1.1.1, decorative).

**WCAG 2.2.2 (Pause, Stop, Hide)**
- The Header icon button (aria-pressed, labelled 'Ambient motion', tooltip 'Pause/Resume ambient motion'), the account-menu Auto/On/Off radio group and the Command Palette commands.
- Persisted in localStorage mega.ambient.motion with try/catch.
- Auto follows prefers-reduced-motion live.
- Off and Still give a composed static frame that still re-renders telemetry on data changes, never a blank one.

**Reduced motion**
- One seeded frame (t = 37 s).
- No tilt, no opening print, no pose tweens or haze-dip cuts (instant redraws), no event animation (only static ledger and plugged-tube marks).
- Works alongside the existing global reduced-motion CSS rules (index.css lines 93 and 3470).

**WCAG 2.3.1 (three flashes)**
- No flicker, glitch or strobe.
- Every transient is a single rise and fall of ≥ 0.9 s, at most 3 concurrent, coalesced over 1.5 s.
- The scan band passes any point over ≥ 0.8 s, at most once per 8 s, with area ΔL ≤ 0.06.
- Breathing effects use sines of ≥ 5 s.

**Vestibular safety**
- No large-area motion: the lattice is static and the far field carries no particles.
- Twin rotation ≤ 3°/s (OVERVIEW swing peaks at 0.39°/s).
- Tilt ≤ ±3°, and plate crescents shift ≤ 2 px.
- Large pose changes are hidden in a 1.0 s haze dip, not shown as visible pans. All of this is disabled under reduced motion (WCAG 2.3.3).

**Contrast (1.4.3)**
Guaranteed by quiet cores, zone caps, soft-clip and the mandatory subtitle promotion (no scrim; see Text protection 5). Non-text contrast (1.4.11) is unchanged because cards and controls stay solid.

**Other media**
- forced-colors: active → hide .ambient-root.
- prefers-contrast: more → Still, motif alpha x 0.5, lattice and haze only, quiet-core feather 96 px.
- print → hide.

**Colour semantics**
- Emerald = success, rose = failure, amber = queued or degraded, matching the app.
- Module hues appear only as ≤ 30% chroma tints, so the CVD-validated chart colours (MODULE_COLORS) keep their authority.

== fileLayout
All paths are under C:\Users\PARTH\source\repos\mega-agent-console.

**New: always loaded**

- src\components\ambient\AmbientBackground.tsx (≤ 2.5 KB gzip)
  - Props: {page, workspaceModule, jobs, agents, apiOk}.
  - Renders .ambient-root > .ambient-poster + canvas and sets html[data-ambient].
  - Measures --ambient-top, the stage ([data-ambient-header]), quiet rects ([data-ambient-quiet] line boxes), the column ([data-ambient-column]) and the sidebar width. Uses ResizeObserver, a MutationObserver on main, and useLayoutEffect after route commit.
  - Wires scroll, pointer, visibility, focus, idle and ambientBus.
  - Idle-imports the engine (or fallback2d), runs the 600 ms crossfade, and guards jsdom and no-WebGL2 (static poster only).
- src\components\ambient\ambientBus.ts: dependency-free useSyncExternalStore store.
  - suspend(reason) / resume(reason) for 'twin3d', 'palette' and 'modal'.
  - highlight(module | null).
  - Motion preference get and set (localStorage mega.ambient.motion, try/catch).
- src\components\ambient\useAmbientSignals.ts
  - Derives running, queued, runningByModule, completedLast24h → A, the 7-day ledger, failedLast12h and agent slots.
  - Diffs job status by id and agent online state into events: silent baseline, 60 s completedAt grace, 1.5 s coalescing, cap of 3 concurrent, queue of 6, batch ring.
- src\components\ambient\useQuietZones.ts: rect tracking, document coordinates, the fallback guard.
- src\components\ambient\AmbientMotionToggle.tsx: Header icon button plus the account-menu radio group.
- src\components\ambient\ambient.css: root and poster, the lattice SVG tiles (34 and 28 px), glow, html[data-ambient='live'] solid overlay variants, forced-colors, prefers-contrast and print rules.
- src\components\cad\useTwinVesselSpec.ts: extracted from ModulesHome (twinSource selection plus the ['vessel-twin-job', id] query plus vesselSpecFromJob plus clamps). Used by both ModulesHome and AmbientBackground.

**New: lazy engine chunk** (src\ambient\, ≤ 14 KB gzip)

- engine.ts: createAmbientEngine(canvas, opts), returning setState, setLayout, setQuietRects, setScroll, setPointer, pushEvents, setVessel, setMode, highlight, renderStill, destroy. Owns the singleton, loop, integer-divisor pacing, dt clamp, pause rules and phase accumulation.
- gl.ts: context options, parallel compile, RGB10_A2 FBOs, data textures, UBO, scissor, context-loss rebuild via init(gl).
- tiers.ts: start-tier heuristics, the renderer regex, pixel-budget DPR, the p90 and GPU-timer governor.
- camera.ts: mat4 and vec3 kit; the 5 poses (OVERVIEW, TELEMETRY, FACE, BONNET, SECTION) plus WIDE and PORTHOLE; lens-shift stage solve; VP = P·(axis, 0); springs; tilt; haze-dip cut.
- twinGeometry.ts: VesselSpec → region-tagged segment texture with LOD by R_px, face mouth rings, bolt circles, baffle stations, X-ray dots.
- paths.ts: serpentine streamlines, tube lanes, P1 to P4, lattice Manhattan routes for links, packed into the path texture.
- network.ts: free-zone slot search, FNV-1a(agentId) with probing, 72 px spacing, cluster node.
- lut.ts: OKLCH → sRGB 64x2 cold and hot LUT, tints, desaturation.
- noise.ts: 128² tileable value noise.
- events.ts: UBO event-pool packing and module landing types.
- constants.ts: every alpha, hex, multiplier and cap, exported for the budget test.
- shaders\common.glsl.ts (quiet(), ign(), softclip(), fog, capsule and ring SDF, LUT lookup), haze.frag.ts, composite.frag.ts, instanced.vert.ts, instanced.frag.ts, fullscreen.vert.ts.
- debug.ts: dev only, tree-shaken. ?ambient=debug|lum|stress|still&t=37&pose=…, ?ambientDemo=1.

**New: separate lazy chunk**

- src\ambient\fallback2d.ts (≤ 4 KB gzip): a one-shot Canvas2D still that reuses camera.ts and twinGeometry.ts to draw the lattice, the twin wire, nodes and the ledger. Redrawn only on data, resize or page change.

**Edits**

- src\components\layout\AppShell.tsx: mount `<AmbientBackground page workspaceModule jobs agents apiOk/>` as the first child of .app-shell. Pass paletteOpen and showRotateKey into ambientBus suspend and resume.
- src\index.css:
  - Delete the .app-shell-body background-image grid (lines ~636-642) and add z-index: 1. Remove the --grid-line usage.
  - .modules-home-header: left-align at ≥ 1024 px (max-width 1100, margin 40px auto 0, children max-width 520).
  - .modules-home-subtitle and .view-subtitle → var(--text-secondary).
  - Ensure .app-shell, .app-shell-body and .main-content have no background.
- src\App.tsx: jobs useQuery gains refetchInterval: q => q.state.data?.some(j => j.status === 'queued' || j.status === 'running') ? 5000 : 60000, and refetchIntervalInBackground: false.
- src\components\modules\ModulesHome.tsx:
  - data-ambient-header and data-ambient-quiet on .modules-home-header; data-ambient-column on the column.
  - Use useTwinVesselSpec.
  - ambientBus.suspend('twin3d') while showVessel is true.
  - Tile pointerenter and pointerleave call highlight.
- src\components\jobs\JobList.tsx and JobDetailView.tsx: quiet and header attributes on .view-header, .controls-bar and .detail-header-nav.
- ModuleWorkspace.tsx: attributes on .module-workspace-header.
- src\components\layout\Sidebar.tsx: module item hover calls highlight.
- src\components\layout\Header.tsx: AmbientMotionToggle plus the account-menu radio group.
- src\components\common\CommandPalette.tsx: the 3 motion commands; suspend('palette') while open.
- Modal components (RotateKeyModal etc.): suspend('modal').

**Tests and CI**

- src\ambient\__tests__\: luminanceBudget.test.ts, lut.test.ts, camera.test.ts, network.test.ts, tiers.test.ts.
- src\components\ambient\__tests__\: useAmbientSignals.test.ts, AmbientBackground.test.tsx.
- scripts\check-ambient-bundle.mjs: run in CI after vite build.
- e2e\ambient.spec.ts: Playwright stills.

== risks
1. **Hero layout dependency.** The stage needs the left-aligned .modules-home-header, which is a product and design change. Get sign-off first. The specified flank/FACE-emblem contingency is coherent but less impactful.

2. **Small twin.** D_px is about 110 at laptop sizes. LOD by R_px, the density cap and the < 4 px detail fade prevent mush. This must be verified at DPR 1.0, 1.25 and 1.5 on Windows laptops; 1.25 is the common moiré case.

3. **Data fidelity.**
   - JobSummary has no agentId, so attribution is exact only when one agent is online; otherwise it is a broadcast. Ask the API team to add agentId.
   - The new polling (5 s active, 60 s idle) adds API load. Confirm with the backend.
   - Reconnect bursts are contained by the silent baseline, coalescing and batch rings.

4. **Engineering credibility.** Baffle cut, nozzle placement, flow directions and the 'activity' colour exchange could be read as a calculation. Label it activity in docs and get a domain-engineer review of the stills before shipping.

5. **Colour semantics.**
   - The hot stream (pale gold, chroma ≤ 0.075) next to queued amber.
   - The cold ramp's violet end (hue ≤ 286°) next to accent purple.
   - Mitigated by clamped LUTs, form and location differences, and hiding hot flow in the BONNET pose.
   - Check under CVD simulation.

6. **GPU contention with CAD and the r3f twin.** Mitigated by suspend('twin3d'), the singleton, blur → Still, the local-agent-busy cap and low-power. Any future WebGL widget must call ambientBus.suspend.

7. **Glass surfaces.** Any new backdrop-filter element over the canvas re-composites every frame. A CI grep or lint flags new backdrop-filter rules for review. Tooltips and dropdowns switch to solid variants under data-ambient='live'.

8. **Scroll lag of the shader mask at 30 fps.** Covered by the 60 fps scroll boost and the 56 px feather.

9. **Cross-browser.**
   - Safari lacks device-pixel-content-box and older Safari lacks requestIdleCallback; both have fallbacks.
   - Firefox may mask the renderer string, so the governor handles tiering.
   - RDP and SwiftShader go to the Canvas2D still.

10. **Fatigue over all-day use.** Mitigated by near-still idle, the freeze after 10 min, and the toggle. Run a 1-2 week dogfood with engineers. Consider defaulting the jobs page to Still if feedback is mixed.

11. **Maintenance.** About 6 GLSL modules and hand-rolled matrices. Keep pose, LUT and network logic unit-tested, and enforce bundle and luminance gates in CI.

12. **New on-background text without [data-ambient-quiet]** gets only zone caps and the guard. Add it to the PR review checklist, and use the dev overlay that outlines registered rects.

13. **Mock-mode reviews look static.** Use ?ambientDemo=1 for design sign-off instead of tuning motion up.

14. **Memory on 4K and ultrawide.** The pixel budget caps the accum target at 12 MB. Watch heap and GPU memory in a 12-hour soak.

== PLAN
1. 1. Product prerequisites: get design sign-off on (a) the left-aligned .modules-home-header at ≥1024 px (max-width 1100, children max 520, margin 40px auto 0) and (b) promoting the two subtitles to --text-secondary. Confirm the 5 s / 60 s jobs polling with the backend. Then land the CSS and App.tsx refetchInterval changes on their own branch.
2. 2. Scaffold src/components/ambient: AmbientBackground with only the CSS poster (lattice SVG tile plus glow), mounted first in .app-shell. Remove the .app-shell-body grid, set .app-shell-body z-index:1, ensure no backgrounds on .app-shell, .app-shell-body or .main-content. Measure --ambient-top with ResizeObserver on .console-header and .pipeline-rail. Add ambient.css with the forced-colors, print and prefers-contrast rules. Verify zero CLS and that the poster shows in the gutters.
3. 3. Add ambientBus (suspend, resume, highlight, motion preference with try/catch), AmbientMotionToggle in Header .header-actions, the account-menu radio group, and the CommandPalette commands. Wire suspend for 'palette', 'modal' and 'twin3d' (ModulesHome showVessel). Add data-ambient-quiet, data-ambient-header and data-ambient-column attributes to ModulesHome, JobList, JobDetailView and ModuleWorkspace.
4. 4. Extract useTwinVesselSpec (twinSource selection, the ['vessel-twin-job', id] query, vesselSpecFromJob, clamps) and use it from both ModulesHome and AmbientBackground. Build useQuietZones (line boxes, block rect for the title, document coordinates, fallback guard) and useAmbientSignals (derivations plus the event diff with silent baseline, 60 s grace, coalescing, caps, batch). Write their Vitest tests first.
5. 5. Engine skeleton (src/ambient): engine.ts singleton, gl.ts context creation and options, tiers.ts (heuristics, renderer regex, pixel-budget DPR), integer-divisor pacing, dt clamp, visibility, blur and idle pause rules, context-loss rebuild via init(gl). Lazy-import it in requestIdleCallback after load, and render one solid-base composite pass to prove the 600 ms crossfade.
6. 6. Composite pass B: haze FBO (pass A, half-res RGB10_A2, 3-octave domain warp, baked noise texture), the analytic lattice with bore crescents locked to the CSS tile, zone caps, quiet mask from the UBO, vignette, 24 px top fade and IGN dither. Add constants.ts and luminanceBudget.test.ts now, so every later layer is budget-gated.
7. 7. camera.ts: mat4 kit, the OVERVIEW pose solved against the measured stage (FOV 30°, 36° off-axis, pitch -4°, lens shift, D_px = clamp(80, 0.62·stageH, 132)), VP = P·(axis, 0), tilt spring. camera.test.ts asserts the 1440x900 anchors (face (86.2%, 12.6%) ±1%, VP (-16%, -2%) ±2%) and that the VP is never inside a quiet core interior.
8. 8. Pass C infrastructure: accum RGB10_A2 target, attribute-less instanced program with gl_InstanceID ranges, RGBA32F segment and path data textures, std140 UBO with a single bufferSubData, capsule and ring SDFs, soft-clip resolve in B.
9. 9. twinGeometry.ts with LOD by R_px (meridians, ring segments, bolts, mouth rings 61/91/127/169, density cap, <4 px fade). Wire range 1 with region ids, depth cue, silhouette generators, roll and swing, then the analytic glass and scanlines in B, the scan band and the X-ray reveal.
10. 10. lut.ts (OKLCH cold and hot rows with the exact stops above), paths.ts (serpentine through baffle windows, tube lanes, P1-P4 and risers), and sprite range 3 with stratified phases, fake depth of field, activity A sampling and heat parcels. lut.test.ts asserts the hexes ±1/255, flat luminance (cold Y 0.34-0.40, hot 0.39-0.42) and hot chroma ≤ 0.075.
11. 11. network.ts: free-zone slots, FNV-1a(agentId) with probing, 72 px spacing, cluster node, lattice-row and column routes with mouth gaps, bolt-circle hubs, queued bolts, local-agent ring. Then events.ts: dispatch, broadcast, module landings, failure ring, plugged tubes, the 7-day ledger, batch ring and the pool of 8. network.test.ts covers stable slots and no route through cores.
12. 12. Poses and transitions: TELEMETRY, FACE, BONNET, SECTION, WIDE and PORTHOLE; weight tables; 900 ms small tweens with mid-tween retarget; far-field 600 ms crossfade; 1.0 s haze-dip cut for large deltas; sidebar-collapse glide; scroll fade; hover linking; typing calm; tilt freeze rules; the opening print with its sessionStorage gate.
13. 13. Governor (p90 window, GPU timer, step rules, lock) and the full pacing matrix: 60 fps boosts, blur → Still with 15 fps transients and replay on refocus, idle freeze, local-agent-busy cap. Then Still mode (seeded t = 37 s frame, re-render on data, layout or page change) and the apiOk 'signal lost' state.
14. 14. fallback2d.ts as its own lazy chunk: a Canvas2D still from the same camera and geometry, used for no WebGL2, caveat rejection, software renderers and after 2 context losses.
15. 15. Overlay hygiene: solid tooltip and dropdown variants under html[data-ambient='live']; confirm the palette, modal and twin3d suspends; add a CI grep that flags new backdrop-filter rules.
16. 16. Dev and QA tooling: ?ambient=debug (tier, fps, GPU ms, rect outlines, context-loss trigger), ?ambient=lum heatmap with the 2 s readback assertion, ?ambient=stress, ?ambient=still&t=37&pose=…, ?ambientDemo=1 synthetic events. Then scripts/check-ambient-bundle.mjs in CI and Playwright stills at 1366, 1440, 1920, 2560 and 375 px.
17. 17. Review and tune: domain-engineer review of the stills, a design review at 1366x768, 1440x900 and 1920x1080 (dark room and daylight), DPR 1.25 moiré check, a 12-hour soak (heap, GPU memory, tier stability), then a 1-2 week dogfood behind the motion toggle defaulting to Auto.

== ACCEPTANCE
- Bundle: the initial (entry) graph contains no 'three', '@react-three/fiber' or '@react-three/drei' modules. The ambient engine chunk is ≤ 14 KB gzip, fallback2d ≤ 4 KB gzip, and the AmbientBackground wrapper plus ambient.css add ≤ 3 KB gzip to the main bundle. scripts/check-ambient-bundle.mjs fails CI otherwise.
- First paint: the CSS poster is visible at FCP. The engine import starts only after the load event (verified in the Performance panel). CLS stays 0.00 with the ambient enabled versus disabled.
- Contrast, brightest frame: in ?ambient=stress, readPixels max luminance inside every quiet core is ≤ 0.0025 at 1366x768, 1440x900, 1920x1080, 2560x1440 and 375x812. That gives the subtitle (#9aa8bd) ≥ 8.3:1 and the title's #3b82f6 end ≥ 5.4:1.
- Frame budgets in ?ambient=stress: mean frame L ≤ 0.012; ≥ 60% of canvas pixels within ΔL 0.002 of base; global peak L ≤ 0.30. Area luminance is ≤ 0.020 in the content column and ≤ 0.040 in the stage and gutters. luminanceBudget.test.ts passes, computed from constants.ts.
- Subtitles: .modules-home-subtitle and .view-subtitle compute to #9aa8bd. No element with color #6b7a94 that sits directly on the background lies outside a registered quiet core (dev overlay check on every route).
- Readability gates: the dev readback raises no warning during a 10-minute session that includes navigation, fast scroll (2,000 px/s) and 3 concurrent events.
- Geometry at 1440x900, OVERVIEW pose: front face centre within ±1% of (86.2%, 12.6%) of the canvas, projected shell D_px 110 ±4, VP derived at (-16% ±2, -2% ±2). camera.test.ts passes at 1366, 1440 and 1920. The VP is never inside a quiet core interior or the twin bbox.
- LOD: at R_px 55 the twin uses ≤ 1,900 segments, mouth pitch ≥ 9 px, and no parallel lines are closer than 4 CSS px. Stills at DPR 1.0, 1.25 and 1.5 show no visible moiré on the lattice or the face (design review sign-off).
- Performance on an Intel Iris Xe laptop at 1440x900, T3: p90 GPU time ≤ 2.0 ms per rendered frame and main-thread CPU ≤ 0.3 ms per frame. 3 draw calls per frame (4 on haze ticks). Zero JS allocations per frame in a 60 s heap allocation profile. Steady 30 fps (28.8 on 144 Hz) with no judder.
- GPU memory: the WebGL memory estimate is ≤ 16 MB at T3 and ≤ 7 MB at T1. A 12-hour soak shows no heap or GPU-memory growth above 2 MB and no tier oscillation.
- Pause rules: on a hidden tab, rAF callbacks stop entirely (0 calls in 10 s). Window blur stops steady-state animation while event transients still play at ≤ 15 fps. After 10 min idle with no running jobs, 0 frames render until input or a data event. With showVessel, the palette or a modal open, 0 ambient frames render. Returning from a 10-minute hidden tab produces no visible jump (dt ≤ 50 ms).
- Tiers: software renderers (SwiftShader, llvmpipe, Basic Render) and failIfMajorPerformanceCaveat show the Canvas2D still with the twin visible. Throttling the CPU or GPU so that p90 > 1.25x the target for 2 windows steps down one tier within 4 s. Two downgrades lock the tier.
- Context loss: WEBGL_lose_context, then restore, rebuilds within 1 s with an identical image (Playwright pixel diff < 1%). After 2 losses the Canvas2D still persists.
- Reduced motion and the toggle: with prefers-reduced-motion or the toggle Off, exactly one frame renders per data, page or resize change, with no tilt, tweens, opening or event animation. The toggle is reachable by keyboard with the sidebar at 232, 64 and 0 px, exposes aria-pressed, and persists across reload. A localStorage that throws does not break rendering.
- Flashes: an automated luminance trace of the stress run shows no region > 0.006 of the viewport changing by ΔL > 0.1 more than 3 times in any 1 s window (PEAT-style check).
- Data reactivity: in ?ambientDemo=1, queued → running sends a dispatch current within 1 frame of the diff. Completion lands per module: face ring (TubeSheet), bolt sequence (BonnetFlange), emerald scan pass (HX Fab). Failure shows one rose ring and a plugged tube. Initial load emits 0 events. 20 simultaneous transitions produce 1 batch ring. With 2+ agents online, dispatch is a 50% broadcast.
- Polling: with a running job, the jobs query refetches every 5 s while the tab is visible and every 60 s when idle, and never while hidden.
- Glass hygiene: no element with a computed backdrop-filter overlaps the live canvas while the loop runs, checked by the debug overlay. Header and rail keep their current glass appearance.
- Accessibility tree: .ambient-root is aria-hidden, inert and has no focusable descendants. Tab order is unchanged versus main. The canvas is hidden under forced-colors and in print.
- Visual regression: Playwright stills via ?ambient=still&t=37&pose=overview|telemetry|face|bonnet|section at 1366, 1440, 1920, 2560 and 375 px match approved baselines (≤ 0.5% pixel diff). A domain engineer signs off on baffle cut, nozzle placement and flow directions.
- Interaction: the canvas never receives pointer events (elementFromPoint never returns it). Tilt amplitude stays ≤ 3° and freezes while an input is focused or a pointer button is down. Crescent shift stays ≤ 2 px and lattice rims never move.