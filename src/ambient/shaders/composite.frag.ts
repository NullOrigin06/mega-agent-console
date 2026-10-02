/**
 * Pass B - resolve to the default framebuffer:
 *   base + haze (upsampled) + tube-sheet lattice with bore crescents aimed at
 *   the vanishing point + analytic holographic glass (inside the twin box
 *   only) -> zone cap; + softclip(2 x accum) -> quiet mask, vignette, 24 px
 *   top fade, signal-lost desaturation, static IGN dither. Alpha written as 1.
 */
import { COLORS, CRESCENT, GLASS, HAZE, MODULE_TINT, RESOLVE, TRANSITIONS, VESSEL_CLAMP } from "../constants";
import { COMMON, f1, v3 } from "./common.glsl";

const R = CRESCENT.rimAlpha;
const V = RESOLVE.vignette;
const DIP = TRANSITIONS.hazeDip.intensityTo;

export const COMPOSITE_FRAG = `${COMMON}
uniform sampler2D uHaze,uAcc;out vec4 o;
vec3 modc(int r){return r==1?${v3(MODULE_TINT.TubeSheet)}:r==2?${v3(MODULE_TINT.BonnetFlange)}:${v3(MODULE_TINT.HeatExchangerFab)};}
vec2 cOff(vec2 m,vec2 vp,float inf){vec2 v=inf>.5?vp:vp-m;float l=length(v);return(inf>.5?.2:min(${f1(CRESCENT.gain)}*l/CAM.w,${f1(CRESCENT.cap)}))*LAT.x*v/max(l,1e-3)+PTR.xy;}
float cres(vec2 p,vec2 m,vec2 off,float fw,out float bot){float r=LAT.z-.5,d=length(p-m-off);bot=1.-smoothstep(r-fw,r,d);return(1.-bot)*clamp((d-r)/max(length(off),1.),0.,1.);}
vec3 gs(vec3 h,vec3 n,vec3 d,float bk,int rg){
float F=1.-abs(dot(n,d)),e=-.5/(BAND.z*BAND.z);
vec3 c=mix(${v3(COLORS.glassFill)},modc(rg),.3*REGT[rg])*(${f1(GLASS.fillBase)}+${f1(GLASS.fillFresnel)}*F*F)*bk*REGA[rg];
return c+${f1(GLASS.scanAlpha)}*(ICE*BAND.y*exp(e*(h.x-BAND.x)*(h.x-BAND.x))+EM*BAND2.y*exp(e*(h.x-BAND2.x)*(h.x-BAND2.x)));}
vec3 glass(vec2 p,vec2 fc){
vec2 n=(p-CAM.xy)/CAM.zw*2.-1.;n.y=-n.y;
vec4 a=IVP*vec4(n,-1.,1.),b=IVP*vec4(n,1.,1.);vec3 o=a.xyz/a.w,d=normalize(b.xyz/b.w-o),c=vec3(0);
float L2=MDL.x*.5,A=dot(d.yz,d.yz),B=dot(o.yz,d.yz),D=B*B-A*(dot(o.yz,o.yz)-.25);
if(D>0.&&A>1e-6){D=sqrt(D);for(int i=0;i<2;i++){float t=(-B+(i==0?-D:D))/A;vec3 h=o+t*d;if(t>0.&&h.x<MDL.y&&h.x>-MDL.z)c+=gs(h,normalize(vec3(0.,h.yz)),d,i==0?1.:${f1(GLASS.backFace)},abs(h.x)<L2?3:2);}}
for(int e=0;e<2;e++){if(e==0&&MDL.y<L2+.001)continue;float sx=e==0?1.:-1.;vec3 s=vec3(${f1(VESSEL_CLAMP.headDepth)},.5,.5),ce=vec3(e==0?MDL.y:-MDL.z,0.,0.),oo=(o-ce)/s,dd=d/s;
float A2=dot(dd,dd),B2=dot(oo,dd),D2=B2*B2-A2*(dot(oo,oo)-1.);
if(D2>0.){D2=sqrt(D2);for(int i=0;i<2;i++){float t=(-B2+(i==0?-D2:D2))/A2;vec3 h=o+t*d;if(t>0.&&sx*(h.x-ce.x)>0.)c+=gs(h,normalize((h-ce)/(s*s)),d,i==0?1.:${f1(GLASS.backFace)},2);}}}
if((int(V.w)&1)!=0)c*=1.-${f1(GLASS.scanlineModulation)}*(.5+.5*sin(6.2832*(fc.y/${f1(GLASS.scanlinePeriodDevicePx)}-FX2.w)));
return c;}
// Signal-lost desaturation, applied before the caps so it can never lift a pixel over its budget.
vec3 desat(vec3 c){return mix(c,vec3(dot(c,W3)),${f1(-HAZE.apiDownSaturation)}*FX2.z);}
vec3 heat(float l){float x=clamp(l/${f1(RESOLVE.capStageL)},0.,1.);return l>${f1(RESOLVE.capStageL)}?vec3(1):vec3(smoothstep(.3,1.,x),smoothstep(0.,.5,x)-smoothstep(.7,1.,x),1.-smoothstep(0.,.5,x));}
void main(){
vec2 fc=gl_FragCoord.xy,uv=fc/V.xy,p=vec2(fc.x,V.y-fc.y)/V.z;float sc=V.z;int fl=int(V.w);
float q=quiet(p),top=smoothstep(0.,${f1(RESOLVE.topFadePx)},p.y),dip=FX.x;
bool st=p.x>=STG.x&&p.x<STG.z&&p.y>=STG.y-T.z&&p.y<STG.w-T.z,col=!st&&p.x>=COL.x&&p.x<COL.z;
vec3 m=latNear(p),lat=vec3(0);float d=length(p-m.xy),fw=max(fwidth(d),1./sc),hole=0.;
if(!lane(m.z)){
vec2 bc=(BOX.xy+BOX.zw)*.5,br=max((BOX.zw-BOX.xy)*vec2(${f1(CRESCENT.haloScaleW / 2)},${f1(CRESCENT.haloScaleH / 2)}),vec2(1.));
float h=1.-smoothstep(.55,1.,length((p-bc)/br));
float a=col?${f1(R.column)}:mix(${f1(R.margin)},${f1(R.halo)},h)*(1.+${f1(CRESCENT.haloRunningBoost)}*T.w*h);
a*=mix(1.,${f1(CRESCENT.falloffBottomLeft)},smoothstep(.15,1.,length((p-vec2(CAM.x+CAM.z,0.))/CAM.zw)*.7071));
a=(a+${f1(CRESCENT.scanEchoAlpha)}*PTR.w*exp(-.5*pow((p.x-PTR.z)/${f1(CRESCENT.scanEchoSigmaPx)},2.)))*VPM.w;
float rim=1.-smoothstep(0.,fw,abs(d-LAT.z)-.5),inM=1.-smoothstep(LAT.z-.5-fw,LAT.z-.5,d),b0,b1;
float w=cres(p,m.xy,cOff(m.xy,VP.xy,VPM.y),fw,b0);
if(VPM.x>0.){w=mix(w,cres(p,m.xy,cOff(m.xy,VP.zw,VPM.z),fw,b1),VPM.x);b0=mix(b0,b1,VPM.x);}
hole=inM*b0*top;
lat=${v3(COLORS.latticeRim)}*a*rim+${v3(COLORS.crescent)}*${f1(CRESCENT.alpha / R.margin)}*a*inM*w;}
vec3 g=vec3(0);
if((fl&2)!=0&&p.x>BOX.x&&p.x<BOX.z&&p.y>BOX.y&&p.y<BOX.w)g=glass(p,fc)*FX2.y;
vec3 base=mix(BASE,${v3(COLORS.boreBottom)},hole),hz=mix(texture(uHaze,uv).rgb,FOG-BASE,.6*dip)*(1.-.7*hole);
vec3 c=capL(base+desat(hz+(lat+g)*mix(1.,${f1(DIP)},dip)),col?${f1(RESOLVE.capColumnL)}:${f1(RESOLVE.capStageL)})-base;
c+=desat(softclip(texture(uAcc,uv).rgb*${f1(RESOLVE.accumGain)}*(col?${f1(RESOLVE.lineColumnScale)}:1.)*mix(1.,${f1(DIP)},dip)));
c=capL(base+c,${f1(RESOLVE.softclipCeiling)})-base;
float r=length((p-CAM.xy-CAM.zw*.5)/(CAM.zw*.5))*.7071;
c*=q*top*(1.-${f1(V.amount)}*smoothstep(${f1(V.inner)},${f1(V.outer)},r));
vec3 res=base+c+(ign(fc)-.5)/255.*q;
if((fl&4)!=0)res=heat(lum(res));
o=vec4(res,1.);}
`;
