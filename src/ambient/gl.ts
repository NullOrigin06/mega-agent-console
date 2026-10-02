/**
 * Raw WebGL2 plumbing for the Duty Field engine: context creation, parallel
 * shader compile, RGB10_A2 render targets, RGBA32F data textures and the
 * shared std140 UBO. Everything here is a pure function of (gl, CPU-side
 * source), so a webglcontextrestored can rebuild by calling the same helpers
 * again - no GL object is ever cached outside the engine's resource record.
 */

/** Spec context options. alpha:true + premultiplied, but every pass writes alpha 1. */
export const CONTEXT_ATTRS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "low-power",
  failIfMajorPerformanceCaveat: true,
};

/** KHR_parallel_shader_compile's COMPLETION_STATUS_KHR. */
const COMPLETION_STATUS = 0x91b1;

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", CONTEXT_ATTRS) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

/** Unmasked renderer string (or null when the browser hides it). */
export function rendererString(gl: WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

export interface Program {
  prog: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
}

/** Starts compile + link without querying status (so parallel compile can run). */
export function startProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): Program | null {
  const prog = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!prog || !vs || !fs) return null;
  gl.shaderSource(vs, vsSrc);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(vs);
  gl.compileShader(fs);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return { prog, vs, fs };
}

/** True once the driver finished (always true without KHR_parallel_shader_compile). */
export function programDone(gl: WebGL2RenderingContext, parallel: boolean, p: Program): boolean {
  return !parallel || gl.getProgramParameter(p.prog, COMPLETION_STATUS) === true;
}

/**
 * Checks LINK_STATUS once, then binds the "S" UBO to binding 0 and the named
 * samplers to texture units 0..n-1. Returns false (and logs in dev) on failure.
 */
export function finishProgram(gl: WebGL2RenderingContext, p: Program, samplers: readonly string[]): boolean {
  if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) {
      console.warn("[ambient] link failed", gl.getProgramInfoLog(p.prog), gl.getShaderInfoLog(p.vs), gl.getShaderInfoLog(p.fs));
    }
    return false;
  }
  const block = gl.getUniformBlockIndex(p.prog, "S");
  if (block !== gl.INVALID_INDEX) gl.uniformBlockBinding(p.prog, block, 0);
  gl.useProgram(p.prog);
  samplers.forEach((name, unit) => {
    const loc = gl.getUniformLocation(p.prog, name);
    if (loc) gl.uniform1i(loc, unit);
  });
  return true;
}

export function deleteProgram(gl: WebGL2RenderingContext, p: Program | null): void {
  if (!p) return;
  gl.deleteProgram(p.prog);
  gl.deleteShader(p.vs);
  gl.deleteShader(p.fs);
}

function makeTexture(gl: WebGL2RenderingContext, filter: number, wrap: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

/** RGBA32F data texture (NEAREST, read with texelFetch). Storage is immutable; upload with uploadData. */
export function createDataTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const tex = makeTexture(gl, gl.NEAREST, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
  return tex;
}

/** Uploads rows [y, y + rows) of an RGBA32F texture of width w from a tightly-packed Float32Array. */
export function uploadData(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, y: number, rows: number, data: Float32Array): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, w, rows, gl.RGBA, gl.FLOAT, data);
}

/** 8-bit texture (R8 noise with REPEAT + LINEAR, or the RGBA8 flow LUT with CLAMP). */
export function createByteTexture(gl: WebGL2RenderingContext, w: number, h: number, data: Uint8Array, rgba: boolean, repeat: boolean): WebGLTexture {
  const tex = makeTexture(gl, gl.LINEAR, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, rgba ? gl.RGBA8 : gl.R8, w, h, 0, rgba ? gl.RGBA : gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  return tex;
}

export interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

/** RGB10_A2 colour target: colour-renderable in core WebGL2, 4x RGBA8 precision on near-black, linear-filterable. */
export function createTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = makeTexture(gl, gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGB10_A2, Math.max(1, w), Math.max(1, h));
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
}

/** The single std140 UBO, bound at binding 0. Updated with one bufferSubData per frame. */
export function createUbo(gl: WebGL2RenderingContext, bytes: number): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
  gl.bufferData(gl.UNIFORM_BUFFER, bytes, gl.DYNAMIC_DRAW);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, buf);
  return buf;
}

/** Binds one texture to a unit (no rest args: called per frame, must not allocate). */
export function bindTexture(gl: WebGL2RenderingContext, unit: number, tex: WebGLTexture | null): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}
