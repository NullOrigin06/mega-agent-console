/**
 * Pass C vertex shader: ONE attribute-less instanced TRIANGLE_STRIP draw
 * (4 vertices per instance) split by gl_InstanceID ranges (UBO C0):
 *   0 bore streaks (lattice mouths in the twin halo, aimed at the VP)
 *   1 twin wire + pipes (segment texture; silhouettes and event rings analytic)
 *   2 network links (canvas-px capsules; the first one tethers to the nearest bolt)
 *   3 sprites: flow particles, face mouths + ledger, bolts, x-ray dots,
 *     nodes, event pulses / rings, signal-lost hub halo
 * Everything is a screen-space quad around a 1 device px capsule or a ring /
 * Gaussian SDF evaluated in instanced.frag. No buffers: data comes from the
 * RGBA32F data texture (DATA_ROWS) and the UBO.
 */
import { ALPHA_CLASS, COLORS, EVENT_RINGS, EVENTS, EVENT_TYPE_ID as E, FLOW, FLOW_LUT, MODULE_TINT, NETWORK, PATH_KIND as K, RESOLVE, ROLLING_CLASS_MASK, SCAN_BAND, STREAKS, WIRE } from "../constants";
import { REGION_BONNET, REGION_SHELL, REGION_TUBESHEET } from "../types";
import { COMMON, DATA_ROWS as D, f1, NODE_CLUSTER, NODE_GHOST, NODE_LOCAL, NODE_ONLINE, NODE_REAR, v3 } from "./common.glsl";

const N = NETWORK;
const A = EVENTS.alpha;
const tint = (hex: string) => `mix(${v3(hex)},FOG,${f1(N.farFogTint)})`;

export const INSTANCED_VERT = `${COMMON}
uniform sampler2D uData;
out vec4 vC,vC2,vS;out vec2 vL,vD,vP;
const vec2 QD[4]=vec2[4](vec2(-1,-1),vec2(1,-1),vec2(-1,1),vec2(1,1));
const vec3 BL=${v3(COLORS.latticeRim)},SKY=${v3(COLORS.faceMouth)},AMB=${v3(COLORS.queued)},EM2=${v3(COLORS.completePulse)},NRC=${tint(COLORS.nodeRing)},NCC=${tint(COLORS.nodeCore)},NOF=${tint(COLORS.nodeOffline)},LON=${tint(COLORS.linkOnline)},LOF=${tint(COLORS.linkOffline)};
vec3 modc(int r){return r==1?${v3(MODULE_TINT.TubeSheet)}:r==2?${v3(MODULE_TINT.BonnetFlange)}:${v3(MODULE_TINT.HeatExchangerFab)};}
vec4 dt(int i){return texelFetch(uData,ivec2(i&1023,i>>10),0);}
vec4 dr(int r,int i){return texelFetch(uData,ivec2(i,r),0);}
float hs(int i){uint x=uint(i)*747796405u+2891336453u;x=((x>>((x>>28u)+4u))^x)*277803737u;return float((x>>22u)^x)/4294967295.;}
float ga(float x,float c){return exp(-.5*(x-c)*(x-c)/(BAND.z*BAND.z));}
vec3 rl(vec3 p){float c=cos(MDL.w),s=sin(MDL.w);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
vec3 pj(vec3 p){vec4 c=MVP*vec4(p,1.);if(c.w<1e-3)return vec3(0.,0.,-1.);return vec3(CAM.xy+(c.xy/c.w*vec2(.5,-.5)+.5)*CAM.zw,c.w);}
void emit(vec2 p){vec2 s=V.xy/V.z;gl_Position=vec4(p/s*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);vP=p;}
void kill(){gl_Position=vec4(2.,2.,2.,1.);vC=vC2=vS=vec4(0);vL=vD=vP=vec2(0);}
void ln(vec2 a,vec2 b,float hw,vec3 c0,vec3 c1,float f,float k){vec2 d=b-a;float l=length(d);vec2 t=l>1e-3?d/l:vec2(1.,0.);float e=hw+1./V.z;vec2 q=QD[gl_VertexID],o=vec2(q.x*(l*.5+e),q.y*e);
vL=o;vS=vec4(hw,f,l*.5,k);vC=vec4(c0,0.);vC2=vec4(c1,0.);vD=vec2(0.,o.x/max(l,1e-3)+.5);emit((a+b)*.5+t*o.x+vec2(-t.y,t.x)*o.y);}
void sp(vec2 c,float r,vec4 s,vec3 c0,vec3 c1,vec2 dd){vec2 o=QD[gl_VertexID]*(r+1./V.z);vL=o;vS=s;vC=vec4(c0,0.);vC2=vec4(c1,0.);vD=dd;emit(c+o);}
vec3 pth(int p,float s,bool cl){float f=(cl?fract(s):clamp(s,0.,1.))*127.;int i=int(f),j=cl?(i+1)%128:min(i+1,127);ivec2 o=ivec2((p&7)*128,${D.path}+(p>>3));return mix(texelFetch(uData,o+ivec2(i,0),0).xyz,texelFetch(uData,o+ivec2(j,0),0).xyz,f-float(i));}
int evr(int e){return int(EV[e].w+.5);}
vec2 lpos(int li,float d){for(int k=0;k<64;k++){if(k>=C1.w)break;vec4 m=dr(${D.linkMeta},k);if(int(m.x+.5)!=li||m.y<-.5)continue;vec4 s=dr(${D.link},k);float L=length(s.zw-s.xy),u=d-m.y;if(u<=L+.01)return CAM.xy+mix(s.xy,s.zw,clamp(u/max(L,1e-3),0.,1.));}return vec2(-1e4);}
float ltot(int li){for(int k=0;k<64;k++){if(k>=C1.w)break;vec4 m=dr(${D.linkMeta},k);if(int(m.x+.5)==li)return m.z;}return 0.;}
vec2 anchor(int r){return pj(vec3(r==${REGION_TUBESHEET}?MDL.x*.5:r==${REGION_SHELL}?0.:BOLT.x,0.,0.)).xy;}

void streak(int i){
int row=C4.y+i/C4.z;float fr=float(row);vec2 m=vec2((float(C4.x+i%C4.z)+(row%2==1?.5:0.))*LAT.x,fr*LAT.y),h=(m-HALO.xy)/HALO.zw;
if(lane(fr)||dot(h,h)>1.||qdist(m)<${f1(RESOLVE.quietFeatherPx + N.quietClearPx)}){kill();return;}
bool nw=VPM.x>.5,inf=(nw?VPM.z:VPM.y)>.5;vec2 vp=nw?VP.zw:VP.xy,v=inf?vp:vp-m;float dl=inf?1e4:length(v);
float a=${f1(STREAKS.alpha)}*abs(2.*VPM.x-1.)*smoothstep(${f1(STREAKS.vpFadePx)},${f1(STREAKS.vpFadePx * 2)},dl)*FX2.x;
vec3 c0=BL,c1=CY;float fg=1.;
if(HUB.z>.5){c0=c1=lut(0.,float(row&1));a*=${f1(STREAKS.sectionTintAlpha / STREAKS.alpha)};fg=0.;}
ln(m,m+v/max(length(v),1e-3)*(inf?24.:clamp(FLOW.w*dl,${f1(STREAKS.minPx)},HUB.y)),.5/V.z,c0*a,c1*a,fg,0.);}

void wire(int i){
vec4 t0=dt(2*i),t1=dt(2*i+1);vec3 a=t0.xyz,b=vec3(t0.w,t1.xy);int rg=int(t1.z+.5),cl=int(t1.w+.5);float al;vec3 col=CY;
if(cl==${ALPHA_CLASS.SILHOUETTE}){float r=length(EYE.yz);if(r<.5005){kill();return;}float ph=atan(-EYE.z,EYE.y)+(i==0?1.:-1.)*acos(.5/r);a=vec3(-MDL.x*.5,.5*cos(ph),-.5*sin(ph));b=vec3(-a.x,a.yz);col=CYL;}
if(cl==${ALPHA_CLASS.EVENT_RING}){int j=i-C1.x,e=j/${EVENT_RINGS.segments};float u=(T.y-EV[e].y-${f1(EVENTS.completePulseSec)})/${f1(EVENTS.landingSec.TubeSheet)};
if(e>=${EVENT_RINGS.slots}||int(EV[e].x+.5)!=${E.complete}||evr(e)!=${REGION_TUBESHEET}||u<0.||u>1.){kill();return;}
float r=mix(${f1(EVENTS.faceRingR[0])},${f1(EVENTS.faceRingR[1])},1.-(1.-u)*(1.-u)),p0=6.2832*float(j%${EVENT_RINGS.segments})/${f1(EVENT_RINGS.segments)},p1=p0+6.2832/${f1(EVENT_RINGS.segments)};
a=vec3(MDL.x*.5+.003,r*cos(p0),-r*sin(p0));b=vec3(a.x,r*cos(p1),-r*sin(p1));al=${f1(A.completeRing)}*(1.-u)*smoothstep(0.,.1,u)*FX.y;
vec3 pa=pj(a),pb=pj(b);if(pa.z<0.||pb.z<0.){kill();return;}ln(pa.xy,pb.xy,.5/V.z,EM*al,EM*al,0.,0.);return;}
if(((${ROLLING_CLASS_MASK}>>cl)&1)==1){a=rl(a);b=rl(b);}
vec3 pa=pj(a),pb=pj(b),mid=(a+b)*.5;if(pa.z<0.||pb.z<0.||mid.x>BAND.w){kill();return;}
float dz=clamp(((MVP*vec4(mid,1.)).w-(MVP*vec4(0.,0.,0.,1.)).w)/(MDL.x+1.)+.5,0.,1.);
al=CLS[cl>>2][cl&3];
if(cl==${ALPHA_CLASS.MERIDIAN})al=dot(vec3(0.,mid.yz),EYE.xyz-mid)<0.?${f1(WIRE.meridian.back)}:mix(${f1(WIRE.meridian.near)},${f1(WIRE.meridian.far)},dz);
else al*=mix(1.15,.75,dz);
al=al*REGA[rg]+(al>0.?REGB[rg]:0.);col=mix(col,modc(rg),REGT[rg]);
float g=ga(mid.x,BAND.x)*BAND.y,g2=ga(mid.x,BAND2.x)*BAND2.y;
col=mix(mix(col,ICE,min(g,1.)),EM,min(g2,1.));al=min(al*(1.+${f1(SCAN_BAND.wireGain - 1)}*(g+g2)),${f1(SCAN_BAND.wireAlphaCap)})*FX.y;
ln(pa.xy,pb.xy,.5/V.z,col*al,col*al,0.,0.);}

void link(int i){
vec4 s=dr(${D.link},i),m=dr(${D.linkMeta},i),nd=dr(${D.node},int(m.w));vec2 a=s.xy+CAM.xy,b=s.zw+CAM.xy;int f=int(nd.z+.5);bool on=(f&${NODE_ONLINE})!=0;
bool th=m.y<-.5;if(th&&C3.x>0){bool rr=(f&${NODE_REAR})!=0;float bx=rr?BOLT.z:BOLT.x,br=rr?BOLT.w:BOLT.y,bd=1e9;
for(int k=0;k<48;k++){if(k>=C3.x)break;float ph=6.2832*float(k)/float(C3.x);vec3 q=pj(rl(vec3(bx,br*cos(ph),-br*sin(ph))));float dd=distance(q.xy,b);if(q.z>0.&&dd<bd){bd=dd;a=q.xy;}}}
int li=int(m.x+.5);float cur=LCUR[li>>2][li&3]*(1.-FX2.z),g=on?m.z*smoothstep(0.,1.,(T.y-nd.w)/${f1(N.linkDrawMs / 1000)}):1e5;
ln(a,b,.5/V.z,(on?LON*${f1(N.linkAlpha)}:LOF*${f1(N.offline.linkAlpha)})*FX.w,CYL*.5*cur*FX.w,g,3.);
float L=length(b-a);vD=vec2(th?(vD.y-1.)*L:m.y+vD.y*L,!on||FX2.z>.5?1.:0.);}

void part(int i,int p0,int np,int n,float ph){
if(np<1){kill();return;}
int p=p0+i%np,per=(n+np-1)/np;vec4 pm=dr(${D.pathMeta},p);int kd=int(pm.x+.5);bool cl=pm.z>.5;
if(ph<0.)ph=kd==${K.RISER_IN}||kd==${K.RISER_OUT}?PH.w:PH.z;
float s=fract((float(i/np)+.8*hs(i))/float(per)+ph*float(7+i%3)*.125);
vec3 lp=pth(p,s,cl),pp=pj(lp);if(pp.z<0.){kill();return;}
float um=${f1(FLOW_LUT.uBase)}+${f1(FLOW_LUT.uActivity)}*FLOW.x,a=(cl?1.:smoothstep(0.,${f1(FLOW.shell.endFade)},s)*smoothstep(1.,${f1(1 - FLOW.shell.endFade)},s))*FX.z;
bool hot=kd==${K.SHELL}||kd==${K.RISER_IN}||kd==${K.RISER_OUT}||kd==${K.HOT_RING};
vec3 c=lut(kd==${K.SUPPLY}||kd==${K.RISER_IN}?0.:kd==${K.RETURN}||kd==${K.RISER_OUT}?um:fract(s)*um,hot?1.:0.);
if(kd==${K.TUBE}||kd==${K.COLD_RING}){vec2 dv=pj(pth(p,s+.01,cl)).xy-pp.xy;dv=length(dv)>1e-3?normalize(dv):vec2(1.,0.);a*=${f1(FLOW.tube.alpha)};ln(pp.xy-dv*1.8,pp.xy+dv*1.8,.7,c*a,c*a,0.,0.);return;}
float w0=(MVP*vec4(lp.x,0.,0.,1.)).w,sz=mix(2.+.4*(2.*hs(i+7)-1.),4.,clamp(abs(pp.z-w0)*2.,0.,1.));
a*=(hot?${f1(FLOW.shell.coreAlpha)}:${f1(FLOW.tube.alpha)})*4./(sz*sz);
if(kd==${K.SHELL})for(int e=0;e<8;e++){float u=T.y-EV[e].y-${f1(EVENTS.completePulseSec)};int st=int(hs(int(EV[e].y*16.))*float(n));if(int(EV[e].x+.5)==${E.complete}&&u>0.&&u<23.&&i>=st&&i<st+${FLOW.heatParcelParticles})a*=${f1(FLOW.heatParcelGain)};}
sp(pp.xy,sz*1.5,vec4(0.,sz*.5,0.,1.),c*a,vec3(0),vec2(0));}

void mouth(int i){
vec4 m=dr(${D.mouth},i);if(length(m.yz)>BAND2.w*.62){kill();return;}vec3 pp=pj(rl(m.xyz));if(pp.z<0.){kill();return;}
float r=FLOW.y*EYE.w/pp.z,k=floor(m.w),al=m.w-k,t=FX.y*REGA[1];int kd=int(k);
vec3 rc=kd==3?RO*${f1(WIRE.ledger.failRimAlpha)}:kd==2?vec3(0):SKY*HUB.w,fc=kd==1?EM*al:kd==2?RO*${f1(WIRE.ledger.failAlpha)}:vec3(0);
sp(pp.xy,r+1.,vec4(r,0.,kd==1||kd==2?r:0.,2.),rc*t,fc*t,vec2(0));}

void bolt(int i){
bool fr=i<C3.x;int k=fr?i:i-C3.x;float ph=6.2832*float(k)/float(C3.x),bx=fr?BOLT.x:BOLT.z,br=fr?BOLT.y:BOLT.w;vec3 pp=pj(rl(vec3(bx,br*cos(ph),-br*sin(ph))));if(pp.z<0.){kill();return;}
vec3 c=CYL*${f1(N.hubBoltAlpha)}*(fr?1.:.6);
if(fr){c=mix(c,AMB*${f1(N.queuedBoltAlpha)},clamp(HUB.x-float(k),0.,1.));
for(int e=0;e<8;e++){float u=(T.y-EV[e].y-${f1(EVENTS.completePulseSec)})-float(k)/float(C3.x)*${f1(EVENTS.landingSec.BonnetFlange)};if(int(EV[e].x+.5)==${E.complete}&&evr(e)==${REGION_BONNET}&&u>0.&&u<.9)c+=EM*${f1(A.completeRing)}*sin(3.1416*u/.9);}}
sp(pp.xy,3.,vec4(0.,1.1,0.,1.),c*FX.y*REGA[2],vec3(0),vec2(0));}

void node(int i){
vec4 n=dr(${D.node},i);int f=int(n.z+.5);vec2 c=n.xy+CAM.xy;float age=T.y-n.w;bool on=(f&${NODE_ONLINE})!=0;if(age<0.){kill();return;}
if((f&${NODE_GHOST})!=0){sp(c,6.,vec4(${f1(N.node.ringR)},0.,0.,2.),LOF*${f1(N.ghostAlpha)}*FX.w,vec3(0),vec2(0.,1.));return;}
float sc=on?mix(.6,1.,smoothstep(0.,1.,age/${f1(N.onlineScaleMs / 1000)})):1.,br=1.+${f1(N.breatheAmp)}*sin(6.2832*(T.x/${f1(N.breathePeriod)}+hs(i+31))),g=on?0.:clamp(age/${f1(N.offlineGreyMs / 1000)},0.,1.);
float o=(f&${NODE_LOCAL})!=0?${f1(N.node.localR)}:(f&${NODE_CLUSTER})!=0?6.5:0.;
sp(c,max(o,${f1(N.node.ringR)})*sc+1.,vec4(${f1(N.node.ringR)}*sc,on?${f1(N.node.coreR)}:0.,0.,2.),mix(NRC*${f1(N.node.ringAlpha)}*br,NOF*${f1(N.offline.ringAlpha)},g)*FX.w,on?NCC*${f1(N.node.coreAlpha)}*br*FX.w:vec3(0),vec2(o*sc,0.));}

void ev(int i){
int e=i/6,j=i%6,ty=int(EV[e].x+.5);float age=T.y-EV[e].y,l0=EV[e].z;
if(ty==${E.dispatch}||ty==${E.complete}){
float dur=ty==${E.dispatch}?${f1(EVENTS.durationSec.dispatch)}:${f1(EVENTS.completePulseSec)},u=age/dur;if(u<0.||u>1.){kill();return;}
float env=smoothstep(0.,.08,u)*smoothstep(1.,.92,u);vec3 col=ty==${E.dispatch}?CYL:EM2;bool bc=l0<0.;
if(bc&&ty==${E.complete}){if(j>0){kill();return;}sp(anchor(4),16.,vec4(mix(6.,14.,u),0.,0.,2.),col*${f1(A.completeRing)}*env*FX.w,vec3(0),vec2(0));return;}
if(bc&&j/2>=int(BC.w+.5)){kill();return;}
int li=int((bc?BC[j/2]:l0)+.5),tj=bc?j%2:j;
float tot=ltot(li),k=.5-.5*cos(3.1416*u),st=${f1(EVENTS.dispatchTrailPx / (EVENTS.dispatchTrailPoints - 1))}*float(tj),d=ty==${E.dispatch}?k*tot-st:(1.-k)*tot+st;
float a=(tj==0?${f1(A.dispatchCore)}:${f1(A.dispatchTrail)}*(1.-float(tj)/6.))*env*(bc?${f1(N.broadcastAlpha)}:1.)*FX.w;
sp(lpos(li,clamp(d,0.,tot)),4.,vec4(0.,tj==0?1.6:1.2,0.,1.),col*a,vec3(0),vec2(0));return;}
if(j>0){kill();return;}
if(ty==${E.fail}){float u=age/${f1(EVENTS.durationSec.fail)};if(u<0.||u>1.){kill();return;}float r=mix(${f1(EVENTS.failRingPx[0])},${f1(EVENTS.failRingPx[1])},1.-(1.-u)*(1.-u));int li=int(l0+.5);
sp(l0<0.?anchor(evr(e)):lpos(li,ltot(li)),r+2.,vec4(r,0.,0.,2.),RO*${f1(A.failure)}*(1.-u)*smoothstep(0.,.1,u),vec3(0),vec2(0));return;}
if(ty==${E.batch}){float u=age/${f1(EVENTS.durationSec.batch)},r=${f1(EVENTS.batchRingBase)}+${f1(EVENTS.batchRingPerLog2)}*log2(max(EV[e].w,1.));if(u<0.||u>1.){kill();return;}
sp(anchor(4),r+2.,vec4(r*mix(.7,1.,u),0.,0.,2.),CY*${f1(A.batch)}*sin(3.1416*u)*FX.w,vec3(0),vec2(0));return;}
kill();}

void main(){
int i=gl_InstanceID;
if(i<C0.x){streak(i);return;}i-=C0.x;
if(i<C0.y){wire(i);return;}i-=C0.y;
if(i<C0.z){link(i);return;}i-=C0.z;
if(i<C2.x){part(i,C5.x,C5.y,C2.x,PH.x);return;}i-=C2.x;
if(i<C2.y){part(i,C5.z,C5.w,C2.y,PH.y);return;}i-=C2.y;
if(i<C2.z){part(i,C6.x,C6.y,C2.z,-1.);return;}i-=C2.z;
if(i<C2.w){mouth(i);return;}i-=C2.w;
if(i<2*C3.x){bolt(i);return;}i-=2*C3.x;
if(i<C3.y){vec3 lp=dr(${D.xray},i).xyz,pp=pj(lp);float g=ga(lp.x,BAND.x)*BAND.y;if(g<.02||pp.z<0.){kill();return;}sp(pp.xy,2.,vec4(0.,.8,0.,1.),ICE*${f1(WIRE.xrayAlpha)}*g*FX.y,vec3(0),vec2(0));return;}i-=C3.y;
if(i<C3.z){node(i);return;}i-=C3.z;
if(i<C3.w){ev(i);return;}
vec3 h=pj(vec3(BOLT.x,0.,0.));if(FLOW.z<=0.||h.z<0.){kill();return;}float r=BOLT.y*EYE.w/h.z;sp(h.xy,r*2.,vec4(0.,r,0.,1.),AMB*FLOW.z,vec3(0),vec2(0));}
`;
