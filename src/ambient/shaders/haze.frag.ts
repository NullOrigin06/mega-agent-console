/**
 * Pass A - the "expensive black": 3-octave domain-warped fBm over a baked
 * 128^2 tileable value-noise texture, pooled around the stage and the
 * bottom-right corner, tinted per workspace, capped at the spec's peak L.
 * Writes the haze as an additive term over BASE into the half-res RGB10_A2
 * target (the composite's bilinear upsample doubles as far-plane blur).
 */
import { COLORS, HAZE } from "../constants";
import { COMMON, f1, v3 } from "./common.glsl";

export const HAZE_FRAG = `${COMMON}
uniform sampler2D uNoise;uniform vec2 uR;out vec4 o;
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<${HAZE.octaves};i++){s+=a*texture(uNoise,p).r;p*=2.;a*=.5;}return s*1.143;}
void main(){
vec2 px=vec2(gl_FragCoord.x,uR.y-gl_FragCoord.y)/uR.x,p=px/(${f1(HAZE.scaleH)}*CAM.w);
vec2 q=vec2(fbm((p+HZ2.x)/64.),fbm((p+vec2(5.2,1.3)+HZ2.x)/64.));
float n=smoothstep(.2,.85,fbm((p+${f1(HAZE.warpGain)}*q+HZ2.y)/64.));
vec3 c=mix(${v3(COLORS.hazeLow)},${v3(COLORS.hazeHigh)},n);
float pool=1.-smoothstep(0.,1.,length((px-HZ.xy)/HZ.zw));
float sec=1.-smoothstep(0.,1.,length((px-CAM.xy-CAM.zw)/(.55*CAM.ww)));
c=mix(c,${v3(COLORS.hazeTeal)},${f1(HAZE.tealMix)}*n*pool);
vec3 t=TINT.rgb*dot(c,W3)/max(dot(TINT.rgb,W3),1e-3);c=mix(c,t,TINT.w);
float bl=clamp(length((px-vec2(CAM.x+CAM.z,0.))/CAM.zw)*.7071,0.,1.);
float w=(.35+.65*max(pool,.7*sec))*mix(1.,${f1(HAZE.bottomLeftFloor)},bl)*HZ2.z*HZ2.w;
o=vec4(max(capL(mix(BASE,c,clamp(w,0.,1.3)),${HAZE.peakL})-BASE,0.),1.);
}
`;
