#!/usr/bin/env node
/**
 * Ambient ("Duty Field") bundle check, run after `vite build`:
 *
 *  1. FAIL if the initial graph (the entry script plus every chunk it imports
 *     statically, i.e. what loads before first paint) contains three.js /
 *     @react-three code, or if index.html modulepreloads such a chunk.
 *  2. FAIL if the lazy engine or fallback2d graphs pull in three.js.
 *  3. Report gzip sizes of the engine and fallback2d chunks, alone and with
 *     the lazy chunks they add beyond the initial graph + ambientController, against the spec
 *     budgets (engine <= 14 KB, fallback2d <= 4 KB). Over-budget is a warning;
 *     pass --strict to make it a failure.
 *
 * Usage: node scripts/check-ambient-bundle.mjs [--strict] [distDir]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const dist = args.find((a) => !a.startsWith("--")) ?? "dist";
const BUDGET_KB = { engine: 14, fallback2d: 4 };
/** Property names three.js sets on its core classes; they survive minification. */
const THREE_SIGNATURES = [/\bisWebGLRenderer\b/, /\bisBufferGeometry\b/, /\bisObject3D\b/, /__THREE__/, /\bisMeshStandardMaterial\b/];

const fail = (msg) => {
  console.error(`check:ambient FAIL - ${msg}`);
  process.exitCode = 1;
};

const html = join(dist, "index.html");
if (!existsSync(html)) {
  console.error(`check:ambient: ${html} not found - run \`npm run build\` first.`);
  process.exit(1);
}
const indexHtml = readFileSync(html, "utf8");
const assetPath = (url) => join(dist, url.replace(/^\//, ""));

const entryMatch = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(indexHtml);
if (!entryMatch) {
  console.error("check:ambient: no module entry script in index.html");
  process.exit(1);
}
const entry = assetPath(entryMatch[1]);

const cache = new Map();
const read = (file) => {
  if (!cache.has(file)) cache.set(file, readFileSync(file, "utf8"));
  return cache.get(file);
};

/** Static imports only (`import ... from "./x.js"`, `import "./x.js"`); dynamic import() is lazy by definition. */
function staticImports(file) {
  const src = read(file);
  const out = new Set();
  const re = /(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.add(join(file, "..", m[1]));
  return out;
}

function staticGraph(start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const dep of staticImports(f)) stack.push(dep);
  }
  return seen;
}

const name = (f) => posix.basename(f.replaceAll("\\", "/"));
const hasThree = (f) => /vendor-three/.test(name(f)) || THREE_SIGNATURES.some((re) => re.test(read(f)));
const gz = (files) => [...files].reduce((n, f) => n + gzipSync(read(f), { level: 9 }).length, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

// ---- 1. initial graph
const initial = staticGraph(entry);
for (const f of initial) if (hasThree(f)) fail(`initial graph contains three.js code: ${name(f)}`);
const preloads = [...indexHtml.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => assetPath(m[1]));
for (const f of preloads) if (existsSync(f) && hasThree(f)) fail(`index.html modulepreloads three.js code: ${name(f)}`);

// ---- 2/3. lazy ambient chunks
const assets = readdirSync(join(dist, "assets"));
const chunk = (prefix) => {
  const hit = assets.find((a) => a.startsWith(`${prefix}-`) && a.endsWith(".js"));
  return hit ? join(dist, "assets", hit) : null;
};

// The controller chunk is what imports the engine / fallback2d, so it has always loaded first:
// sizes below are what each renderer adds on top of it.
const controller = chunk("ambientController");
if (!controller) fail(`no ambientController-*.js chunk in ${dist}/assets`);
else for (const f of staticGraph(controller)) if (hasThree(f)) fail(`ambientController graph contains three.js code: ${name(f)}`);
const loaded = new Set([...initial, ...(controller ? staticGraph(controller) : [])]);

const rows = [];
for (const key of ["engine", "fallback2d"]) {
  const file = chunk(key);
  if (!file) {
    fail(`no ${key}-*.js chunk in ${dist}/assets (is it still a separate lazy chunk?)`);
    continue;
  }
  if (initial.has(file)) fail(`${name(file)} is in the initial graph (it must be lazy)`);
  const lazy = [...staticGraph(file)].filter((f) => !loaded.has(f));
  for (const f of lazy) if (hasThree(f)) fail(`${key} graph contains three.js code: ${name(f)}`);
  const own = gz([file]);
  const total = gz(lazy);
  const over = total > BUDGET_KB[key] * 1024;
  rows.push({ key, file: name(file), own, total, deps: lazy.filter((f) => f !== file).map(name), over });
  if (over) {
    const msg = `${key} lazy graph is ${kb(total)} gzip, over the ${BUDGET_KB[key]} KB spec budget`;
    if (strict) fail(msg);
    else console.warn(`check:ambient WARN - ${msg}`);
  }
}

console.log(`entry: ${name(entry)} (${kb(gz([entry]))} gzip); initial graph: ${[...initial].map(name).join(", ")} = ${kb(gz(initial))} gzip; three.js-free: ${[...initial].every((f) => !hasThree(f)) ? "yes" : "NO"}`);
for (const r of rows) {
  console.log(`${r.key}: ${r.file} ${kb(r.own)} gzip; with lazy deps [${r.deps.join(", ") || "none"}] ${kb(r.total)} gzip (budget ${BUDGET_KB[r.key]} KB${r.over ? ", OVER" : ""})`);
}
if (!process.exitCode) console.log("check:ambient OK");
