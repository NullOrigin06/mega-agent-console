**Brief: a premium, calm animated background for Mega Agent Console**

**(a) Visual techniques**

1. **Write the shaders yourself; skip three.js.** Use one full-screen WebGL2 fragment pass for the "fields" (haze, tube lattice, scanlines) and one instanced point/line draw for particles. COBE draws a whole globe in about 5 kB this way (https://shud.in/thoughts/cobe). Mat Simon replaced three.js with about 300 lines of raw WebGL (https://www.matsimon.dev/blog/building-an-interactive-3d-hero-animation). Paper Shaders are pure WebGL2 with no dependencies (https://mintlify.wiki/paper-design/shaders/introduction). Target: 10 kB gzip or less.
2. **Domain-warped fBm "atmosphere" (Stripe's minigl).** Warp the noise with sin/cos of UVs offset by time. This turns flat black into slow liquid light (https://www.bram.us/2021/10/13/how-to-create-the-stripe-website-gradient-effect/, https://github.com/exzenter/gradient-stripe). Keep it at 2–4% luminance with 30–60 s periods. This is what makes the black feel expensive.
3. **Exponential depth fog for volume.** Use `fog = 1 - exp(-z*b)`, tinted toward cyan near the vanishing point ("sun-tinted" fog, https://iquilezles.org/articles/fog/). Tube-field streaks then dissolve into haze, which gives real depth without a depth-of-field pass.
4. **Fake depth of field on sprites.** Make point size proportional to |z − zFocus| (circle of confusion). Make alpha proportional to 1/size² so out-of-focus particles don't get brighter. Use a Gaussian falloff in the fragment shader (https://therealmjp.github.io/posts/bokeh/; Mat Simon also fades by depth).
5. **Additive glow instead of a bloom pass; bake expensive work once.** Vercel used PNG light textures instead of computing glow, and rendered its noise normal map once at startup (https://vercel.com/blog/building-an-interactive-webgl-experience-in-next-js, https://blog.aimactgrow.com/from-rays-to-meshes-constructing-vercels-prism-with-vgpu/). Here: bake the triangular-pitch lattice into a texture at init and animate only its transform.
6. **Anti-alias lines in the shader with fwidth** for tube circles, shell rings, baffles and the wireframe (https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8). A rotating lattice produces moiré easily. GitHub hit moiré at the globe edges and fixed it with alpha falloff, not MSAA (https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/).
7. **Hologram.** Scanlines from `sin/fract(worldY*k + t*speed)`, a fresnel rim and additive blending (https://www.cyanilux.com/tutorials/hologram-shader-breakdown/, https://threejs-journey.com/lessons/hologram-shader). Leave out glitch and flicker. The scan band is a smoothstep window sweeping along the exchanger axis every 10–14 s.
8. **Drive motion with real data, as GitHub's globe does with PR layers.**
   - A running job sends a pulse from workstation to server.
   - A completed job lands as an emerald dot plus an expanding, fading ring.
   - A failed job shows a single rose ring.
   - Offline agents dim.
   - Values ease about 6% closer to their target each frame (GitHub's rule).

   The background becomes ambient telemetry rather than decoration.
9. **Divergence-free shell-side flow.** Use curl noise or an analytic serpentine field around the baffle planes so particles never clump or stall (http://petewerner.blogspot.com/2015/02/intro-to-curl-noise.html). Above about 5k particles, simulate on the GPU with transform feedback (https://gpfault.net/posts/webgl2-particles.txt.html, https://webgl2fundamentals.org/webgl/lessons/webgl-gpgpu.html). Below that, CPU typed arrays are fine.
10. **Mix counter-flow colour in OKLab/OKLCH, not RGB.** RGB mixing gives a grey "dead zone" halfway between orange and blue (https://www.joshwcomeau.com/css/make-beautiful-gradients/). Precompute a 64-texel lookup texture.
11. **Dither every gradient** with interleaved gradient noise: `c += (1/255)*ign(gl_FragCoord.xy) - 0.5/255`. Banding is worst on near-black such as #05070d (https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/).
12. **Eased scrim and vignette behind text.** Use a 13-stop eased gradient rather than a linear one (https://larsenwork.com/easing-gradients/, https://css-tricks.com/easing-linear-gradients/). Also pass a "quiet-rect" uniform to the shader that suppresses motifs there. Crossfade the canvas in over a static frame (GitHub uses a 600 ms Web Animations crossfade).

**(b) Performance checklist**

- **Loading:** `import()` after first paint or in `requestIdleCallback`. No three.js. Show a static CSS frame first.
- **Context options:** `webgl2`, `{antialias:false, depth:false, stencil:false, powerPreference:'low-power', failIfMajorPerformanceCaveat:true}` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext).
  - Do not use `alpha:false`, which MDN says is costly on some platforms. Write alpha = 1 instead (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
  - Canvas2D is only a fallback, for at most about 1–2k sprites. WebGL2 instancing reaches 100k points at 60 fps on mobile (https://github.com/xiaozhi-6/webgl-particles).
- **Resolution:**
  - Cap devicePixelRatio at 1.5. GitHub stepped down from 2 to 1.5; Vercel adapts between 1.5 and 2.
  - Render haze at 0.5× into a framebuffer and upscale; draw lines at the capped full resolution.
  - Size the canvas with `ResizeObserver` using `device-pixel-content-box`. Never reallocate per frame.
- **Frame rate:**
  - Cap at 30 fps by default. Allow 60 only on the high tier while the pointer is tilting the scene.
  - Compute delta time from the rAF timestamp and clamp it to 50 ms or less.
  - iOS Low Power Mode already throttles rAF to 30.
- **Adaptive tiers.** GitHub degrades when it averages under 55.5 fps over 50 frames.
  - Keep a rolling 60-frame interval. If the 90th percentile exceeds 1.25× the budget, step down one tier.
  - Tiers lower DPR (1.5 → 1.0 → 0.75), cut particles (6k → 3k → 1.2k), drop the haze framebuffer, then go from 30 to 24 fps.
  - Step back up only after 8–10 s of headroom, at most one step every 5 s.
- **Starting tier is low when any of these hold** (https://web.dev/articles/adaptive-loading-cds-2019):
  - `hardwareConcurrency` ≤ 4
  - `deviceMemory` ≤ 4 (Chromium only)
  - `(pointer: coarse)`
  - `saveData`
  - battery under 30% and not charging (Vercel's rule; `getBattery` is Chromium-only and needs a secure context)
- **Per-frame budgets:**
  - Main thread under 1 ms per frame, or zero by rendering in a worker with OffscreenCanvas. WebGL in OffscreenCanvas needs Safari 17+, so feature-detect (https://web.dev/articles/offscreen-canvas).
  - GPU 3 ms or less on integrated graphics; 2–4 draw calls.
  - Static VAOs; no `getError` or `getParameter` inside the loop; use `KHR_parallel_shader_compile`.
- **Pausing:**
  - On `visibilitychange`, cancel rAF; don't just skip frames.
  - Drop to 10 fps when the window loses focus.
  - Pause completely while the 3D twin is on screen (IntersectionObserver). The two compete for the GPU, and Chrome drops the oldest WebGL context once about 16 are live.
- **Context loss:** call `preventDefault` on `webglcontextlost` and rebuild every resource on `webglcontextrestored` (https://www.khronos.org/webgl/wiki/HandlingContextLost). After two losses, stay static. Test with `WEBGL_lose_context`.
- **Reduced motion:** listen to `matchMedia('(prefers-reduced-motion: reduce)')` and its change event. When set, render one seeded, composed frame, stop, and disable tilt.
- **DOM:** `position:fixed; inset:0; z-index:0` under content, `pointer-events:none`, `aria-hidden`, no tabindex, `contain:strict`. Typed arrays, no per-frame allocations.

**(c) Composition principles**

- **One object at three scales, not five collaged effects.**
  - The holographic exchanger is the hero.
  - The tube field is its bundle seen end-on (the tube-sheet face).
  - Shell-side particles weave between its baffles inside its shell.
  - Counter-flow lanes are the tube-side and shell-side fluids.
  - Agent nodes ring the edges and feed jobs into it.
- **Depth planes:**
  - Far: haze and the tube-field vanishing point (blurred, lowest contrast).
  - Mid: twin wireframe and shell flow. This is the only sharp, focal plane.
  - Near: sparse counter-flow streaks and agent links as thin, out-of-focus sprites.
- **Zoning:**
  - The hero text area at top-left stays quiet.
  - The focal point sits in the lower-right third, seen through the gaps between cards.
  - The agent network runs along the right and bottom edges.
- **Per page:**
  - modules: full composition.
  - jobs: 50% intensity, with the network emphasised.
  - workspace: tinted by module colour at 30% chroma or less, so charts keep authority over those colours.
- **Motion hierarchy:**
  - Primary: the twin rotates once every 60–120 s, at 4°/s or less.
  - Secondary: particles move at 15–40 px/s.
  - Tertiary: job events, rare, with at most 3 at once.
  - Cursor tilt: ±3°, low-pass filtered.
  - No large-area parallax; it triggers vestibular symptoms (https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity/).
- **Luminance budget, computed from the palette.** #f8fafc on #05070d is 19:1. To keep AA, the pixel luminance behind each kind of text must stay at or below:

  | Text | Required contrast | Max background luminance |
  |---|---|---|
  | Title (large text) | 3:1 | 0.28 |
  | Subtitle #9aa8bd | 4.5:1 | 0.047 (about sRGB #3d3d3d) |
  | Muted text #6b7a94 | 4.5:1 | 0.004 |

  Muted text only reaches 4.63:1 on the plain base colour, so motifs must be zero behind it. Keep average frame luminance at 0.02 or less, and at least 40% of the viewport near-black. Test the brightest frame, at the point of lowest contrast (https://www.smashingmagazine.com/2023/08/designing-accessible-text-over-images-part1/).
- **Colour:** cyan and blue dominate at low chroma. Warm orange and rose appear only in the hot stream and fault pulses, because warm colours advance and pull the eye.

**(d) Pitfalls**

- Shimmer or moiré on the rotating lattice and banding on near-black are the two things that make it look cheap.
- **WCAG 2.2.2:** a background that moves for more than 5 s alongside content needs a pause control. Add an "Ambient motion" toggle and remember it in localStorage (https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html). Under 2.3.1, the scan band must never flash (no more than 3 flashes per second).
- `backdrop-filter` or `mix-blend-mode` over an animated canvas re-composites every frame. Keep the header and cards solid.
- Speeds tied to frame rate break on 120 Hz screens, and delta time spikes after returning to a hidden tab.
- Two WebGL contexts (twin and background) fight over the GPU, and evicting the oldest context kills one of them.
- Job storms: coalesce pulses and cap how many run at once.
- Software GL (SwiftShader) can't keep up: use `failIfMajorPerformanceCaveat` and the static fallback.
- Non-integer devicePixelRatio causes moiré; resize storms cause buffer churn, so debounce.
- Keep motion near text and behind the dense job tables to a minimum.