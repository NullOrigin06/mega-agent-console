/**
 * GPU fluid simulation (stable fluids / Navier-Stokes on a grid), used by the
 * landing relief to stir coloured "dye" through the plaster under the cursor.
 *
 * Per frame: curl -> vorticity confinement -> divergence -> pressure solve
 * (Jacobi) -> subtract pressure gradient -> advect velocity -> advect dye.
 * Pointer moves add "splats" of velocity and colour.
 *
 * Needs WebGL2 with EXT_color_buffer_float (half-float render targets);
 * returns null otherwise and the relief simply runs without it.
 */

const BASE_VERT = `#version 300 es
in vec2 aPos;
uniform vec2 texelSize;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv, vL, vR, vT, vB;
out vec4 o;
`;

const SHADERS = {
  splat: `${HEAD}
uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main() {
  vec2 p = vUv - point; p.x *= aspectRatio;
  vec3 s = exp(-dot(p, p) / radius) * color;
  o = vec4(texture(uTarget, vUv).xyz + s, 1.0);
}`,
  advect: `${HEAD}
uniform sampler2D uVelocity, uSource; uniform vec2 velTexel; uniform float dt, dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * velTexel;
  o = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,
  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  curl: `${HEAD}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y, R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x, B = texture(uVelocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  vorticity: `${HEAD}
uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
void main() {
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x, B = texture(uCurl, vB).x, C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C; force.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + force * dt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  pressure: `${HEAD}
uniform sampler2D uPressure, uDivergence;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `${HEAD}
uniform sampler2D uPressure, uVelocity;
void main() {
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`,
  scale: `${HEAD}
uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }`,
};

const CFG = {
  simRes: 128,
  dyeRes: 512,
  pressureIterations: 20,
  curl: 22,
  velocityDissipation: 0.25,
  dyeDissipation: 0.35,
  pressureFade: 0.8,
  splatRadius: 0.0042,
  splatForce: 5200,
};

export function createFluid(gl, triVao) {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "fluid shader");
    return s;
  };
  const vert = compile(gl.VERTEX_SHADER, BASE_VERT);
  const progs = {};
  for (const [name, src] of Object.entries(SHADERS)) {
    const p = gl.createProgram();
    gl.attachShader(p, vert);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "fluid link");
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    progs[name] = { p, u };
  }

  const target = (w, h, internal, format) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, texel: [1 / w, 1 / h] };
  };
  const double = (w, h, internal, format) => {
    let a = target(w, h, internal, format), b = target(w, h, internal, format);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } };
  };

  let velocity, dye, pressure, divergence, curlT, aspect = 1;
  const resize = (cssW, cssH) => {
    aspect = cssW / cssH;
    const sim = [Math.round(CFG.simRes * Math.max(1, aspect)), Math.round(CFG.simRes * Math.max(1, 1 / aspect))];
    const dy = [Math.round(CFG.dyeRes * Math.max(1, aspect)), Math.round(CFG.dyeRes * Math.max(1, 1 / aspect))];
    velocity = double(sim[0], sim[1], gl.RG16F, gl.RG);
    pressure = double(sim[0], sim[1], gl.R16F, gl.RED);
    divergence = target(sim[0], sim[1], gl.R16F, gl.RED);
    curlT = target(sim[0], sim[1], gl.R16F, gl.RED);
    dye = double(dy[0], dy[1], gl.RGBA16F, gl.RGBA);
  };

  const bindTex = (unit, tex) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  };
  const run = (prog, out, set) => {
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.viewport(0, 0, out.w, out.h);
    gl.uniform2f(prog.u.texelSize, out.texel[0], out.texel[1]);
    set(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const splat = (x, y, dx, dy, color) => {
    run(progs.splat, velocity.write, (u) => {
      gl.uniform1i(u.uTarget, bindTex(0, velocity.read.tex));
      gl.uniform1f(u.aspectRatio, aspect);
      gl.uniform2f(u.point, x, y);
      gl.uniform3f(u.color, dx * CFG.splatForce, dy * CFG.splatForce, 0);
      gl.uniform1f(u.radius, CFG.splatRadius * Math.max(1, aspect));
    });
    velocity.swap();
    run(progs.splat, dye.write, (u) => {
      gl.uniform1i(u.uTarget, bindTex(0, dye.read.tex));
      gl.uniform1f(u.aspectRatio, aspect);
      gl.uniform2f(u.point, x, y);
      gl.uniform3f(u.color, color[0], color[1], color[2]);
      gl.uniform1f(u.radius, CFG.splatRadius * 1.6 * Math.max(1, aspect));
    });
    dye.swap();
  };

  const step = (dt) => {
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(triVao);
    run(progs.curl, curlT, (u) => gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex)));
    run(progs.vorticity, velocity.write, (u) => {
      gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
      gl.uniform1i(u.uCurl, bindTex(1, curlT.tex));
      gl.uniform1f(u.curl, CFG.curl);
      gl.uniform1f(u.dt, dt);
    });
    velocity.swap();
    run(progs.divergence, divergence, (u) => gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex)));
    run(progs.scale, pressure.write, (u) => {
      gl.uniform1i(u.uTexture, bindTex(0, pressure.read.tex));
      gl.uniform1f(u.value, CFG.pressureFade);
    });
    pressure.swap();
    for (let i = 0; i < CFG.pressureIterations; i++) {
      run(progs.pressure, pressure.write, (u) => {
        gl.uniform1i(u.uPressure, bindTex(0, pressure.read.tex));
        gl.uniform1i(u.uDivergence, bindTex(1, divergence.tex));
      });
      pressure.swap();
    }
    run(progs.gradient, velocity.write, (u) => {
      gl.uniform1i(u.uPressure, bindTex(0, pressure.read.tex));
      gl.uniform1i(u.uVelocity, bindTex(1, velocity.read.tex));
    });
    velocity.swap();
    run(progs.advect, velocity.write, (u) => {
      gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
      gl.uniform1i(u.uSource, bindTex(1, velocity.read.tex));
      gl.uniform2f(u.velTexel, velocity.read.texel[0], velocity.read.texel[1]);
      gl.uniform1f(u.dt, dt);
      gl.uniform1f(u.dissipation, CFG.velocityDissipation);
    });
    velocity.swap();
    run(progs.advect, dye.write, (u) => {
      gl.uniform1i(u.uVelocity, bindTex(0, velocity.read.tex));
      gl.uniform1i(u.uSource, bindTex(1, dye.read.tex));
      gl.uniform2f(u.velTexel, velocity.read.texel[0], velocity.read.texel[1]);
      gl.uniform1f(u.dt, dt);
      gl.uniform1f(u.dissipation, CFG.dyeDissipation);
    });
    dye.swap();
  };

  return {
    resize,
    splat,
    step,
    dyeTexture: () => dye.read.tex,
  };
}
