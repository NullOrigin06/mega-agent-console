/**
 * Pass C fragment shader. Shape kinds (vS.w):
 *   0 capsule line (optional along-fog for streaks)
 *   1 Gaussian dot
 *   2 ring / node: ring r (vS.x), Gaussian core (vS.y), filled disc (vS.z),
 *     optional outer ring at 0.4 (vD.x), dashed ring (vD.y)
 *   3 network link: capsule + offline / signal-lost dash, travelling current,
 *     draw-out from the hub, gapped inside lattice mouths
 * Output is additive light pre-scaled by RESOLVE.accumPrescale (alpha untouched).
 */
import { NETWORK, RESOLVE, STREAKS } from "../constants";
import { COMMON, f1 } from "./common.glsl";

const [CUR_ON, CUR_OFF] = NETWORK.currentDash;
const [OFF_ON, OFF_OFF] = NETWORK.offline.dash;

export const INSTANCED_FRAG = `${COMMON}
in vec4 vC,vC2,vS;in vec2 vL,vD,vP;out vec4 o;
void main(){int k=int(vS.w+.5);float sc=V.z,d;vec3 c;
if(k==0||k==3){d=sdCap(vL,vS.z);float cv=clamp((vS.x-d)*sc+.5,0.,1.);
if(k==0){float t=clamp(vD.y,0.,1.);c=vS.y>.5?mix(vC.rgb,vC2.rgb,1.-exp(-${f1(STREAKS.fogK)}*t))*(1.-t):vC.rgb;}
else{float s=vD.x;c=(vD.y>.5?vC.rgb*step(fract(s/${f1(OFF_ON + OFF_OFF)}),${f1(OFF_ON / (OFF_ON + OFF_OFF))}):vC.rgb)+vC2.rgb*step(fract((s-${f1(NETWORK.currentPxPerSec)}*T.x)/${f1(CUR_ON + CUR_OFF)}),${f1(CUR_ON / (CUR_ON + CUR_OFF))});
c*=step(s,vS.y);vec3 m=latNear(vP);if(!lane(m.z))c*=smoothstep(LAT.z-1.5,LAT.z-.5,length(vP-m.xy));}
c*=cv;}
else{d=length(vL);
if(k==1)c=vC.rgb*exp(-d*d/(vS.y*vS.y));
else{float r=ring(d,vS.x,sc);if(vD.y>.5)r*=step(.5,fract(atan(vL.y,vL.x)*1.2732));if(vD.x>0.)r+=.4*ring(d,vD.x,sc);
c=vC.rgb*r+vC2.rgb*((vS.y>0.?exp(-d*d/(vS.y*vS.y)):0.)+(vS.z>0.?clamp((vS.z-d)*sc+.5,0.,1.):0.));}}
o=vec4(c*${f1(RESOLVE.accumPrescale)},0.);}
`;
