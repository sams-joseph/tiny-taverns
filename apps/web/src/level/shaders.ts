import type { LevelColour } from "./palette";

/**
 * The level's shaders, as the approved prototype wrote them: procedural floors
 * per material with ink where materials meet, dressed-stone walls, a radial
 * falloff for each light's fan, the party's sight fans, and the composite that
 * multiplies the floor by ambient plus light.
 *
 * Every colour is a uniform filled from the palette (`palette.ts`); a colour's
 * name in GLSL is its token's, upper-cased (`--level-grass-dark` is
 * `GRASS_DARK`).
 */

/** The palette colours the shaders read, in the order of the `uPal` array. */
export const SHADER_COLOURS = [
  "hatch",
  "hatch-line",
  "flagstone-mortar",
  "flagstone-dark",
  "flagstone-light",
  "flagstone-chip",
  "planks-seam",
  "planks-dark",
  "planks-light",
  "planks-edge",
  "planks-nail",
  "grass-dark",
  "grass-light",
  "grass-blade",
  "grass-shade",
  "grass-flower",
  "grass-bloom",
  "earth-dark",
  "earth-light",
  "earth-pebble",
  "water-deep",
  "water-shallow",
  "water-caustic",
  "water-glint",
  "tile-dark",
  "tile-light",
  "tile-grout",
  "wall-dark",
  "wall-light",
  "wall-mortar",
  "wall-top",
  "darkvision",
  "memory",
] as const satisfies ReadonlyArray<LevelColour>;

const DEFINES = SHADER_COLOURS.map(
  (name, k) => `#define ${name.toUpperCase().replace(/-/g, "_")} uPal[${String(k)}]`,
).join("\n");

/** The palette and ink, shared by every shader that paints a colour. */
const PALETTE = /* glsl */ `
uniform vec3 uPal[${String(SHADER_COLOURS.length)}];
uniform vec3 uInk;
${DEFINES}
#define INK uInk
`;

const NOISE = /* glsl */ `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n=h21(p); return vec2(n, h21(p+n+17.3)); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
vec3 voro(vec2 x, float t){
  vec2 n=floor(x), f=fract(x); vec2 mg, mr; float md=8.;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec2 g=vec2(i,j); vec2 o=.5+.38*sin(t+6.2831*h22(n+g)); vec2 r=g+o-f; float d=dot(r,r); if(d<md){ md=d; mr=r; mg=g; } }
  md=8.;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){ vec2 g=mg+vec2(i,j); vec2 o=.5+.38*sin(t+6.2831*h22(n+g)); vec2 r=g+o-f; if(dot(mr-r,mr-r)>1e-5) md=min(md, dot(.5*(mr+r), normalize(r-mr))); }
  return vec3(md, h21(n+mg), length(mr));
}
`;

const HATCH = /* glsl */ `
vec3 hatch(vec2 p){ float s=fract((p.x+p.y)*2.2); return mix(HATCH, HATCH_LINE, step(.86,s)); }
`;

/** World position and uv through to the fragment, for meshes in level squares. */
export const WORLD_VERT = /* glsl */ `
varying vec2 vW; varying vec2 vUv;
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xy; gl_Position=projectionMatrix*viewMatrix*w; }`;

/** The same for instanced meshes (the props). */
export const INSTANCED_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.); }`;

export const FLOOR_FRAG = /* glsl */ `
uniform sampler2D uMat; uniform vec2 uSize; uniform float uTime; uniform float uForce;
varying vec2 vW;
${PALETTE}
${NOISE}
${HATCH}
float matAt(vec2 c){ if(uForce>=0.) return uForce; if(c.x<0.||c.y<0.||c.x>=uSize.x||c.y>=uSize.y) return 0.; return floor(texture2D(uMat,(c+.5)/uSize).r*255.+.5); }
vec3 flagstone(vec2 p){ vec3 v=voro(p*1.45,0.); vec3 b=mix(FLAGSTONE_DARK, FLAGSTONE_LIGHT, v.y); b*=.78+.4*fbm(p*3.3);
  b+= FLAGSTONE_CHIP*(1.-smoothstep(.05,.16,v.x)); b-= .05*smoothstep(.75,.95,vnoise(p*7.));
  return mix(FLAGSTONE_MORTAR, b, smoothstep(.018,.065,v.x)); }
vec3 planks(vec2 p){ float rows=3.; float r=floor(p.y*rows); float len=1.8+h21(vec2(r,3.))*1.4; float u=(p.x+h21(vec2(r,7.))*4.)/len; float pl=floor(u); float fu=fract(u);
  float tone=h21(vec2(pl,r)); vec3 c=mix(PLANKS_DARK, PLANKS_LIGHT, tone);
  c*=.8+.32*vnoise(vec2(p.x*1.3+tone*9., p.y*rows*16.)); float fy=fract(p.y*rows);
  float seam=smoothstep(0.,.07,fy)*smoothstep(1.,.93,fy)*smoothstep(0.,.025,min(fu,1.-fu)*len);
  c+= PLANKS_EDGE*smoothstep(.2,0.,fy);
  vec2 nail=vec2(fract(u)*len, fy); c=mix(c, PLANKS_NAIL, smoothstep(.035,.02,length((nail-vec2(.12,.5))*vec2(1.,1./rows))));
  return mix(PLANKS_SEAM, c, seam); }
vec3 grass(vec2 p){ float n=fbm(p*1.1); vec3 c=mix(GRASS_DARK, GRASS_LIGHT, n);
  c+=GRASS_BLADE*smoothstep(.62,.82,vnoise(p*15.)); c-=GRASS_SHADE*smoothstep(.6,.85,vnoise(p*9.+3.));
  vec2 q=p*5.; float fl=h21(floor(q)); if(fl>.975){ c=mix(c, fl>.99?GRASS_BLOOM:GRASS_FLOWER, smoothstep(.17,.1,length(fract(q)-.5))); }
  return c; }
vec3 earth(vec2 p){ vec3 c=mix(EARTH_DARK, EARTH_LIGHT, fbm(p*1.6)); vec3 v=voro(p*4.5,0.);
  float peb=step(.62,v.y)*smoothstep(.3,.22,v.z); c=mix(c, mix(EARTH_PEBBLE,INK,smoothstep(.22,.29,v.z)), peb); return c; }
vec3 water(vec2 p, float t){ vec3 c=mix(WATER_DEEP, WATER_SHALLOW, fbm(p*.6+vec2(t*.05,t*.02)));
  vec3 v=voro(p*1.7+vec2(t*.08,t*.05), t*.7); c+=WATER_CAUSTIC*(1.-smoothstep(0.,.07,v.x))*.35;
  c+=WATER_GLINT*smoothstep(.8,.95,vnoise(p*6.+t*.4))*.08; return c; }
vec3 tile(vec2 p){ vec2 q=p*2.; vec2 i=floor(q), f=fract(q); float t=h21(i);
  vec3 c=mix(TILE_DARK, TILE_LIGHT, t); if(mod(i.x+i.y,2.)>.5) c*=.78;
  c*=.88+.22*fbm(p*5.); float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y)); c+=.05*smoothstep(.14,.0,f.y);
  return mix(TILE_GROUT, c, smoothstep(.02,.06,e)); }
vec3 pick(float m, vec2 p){
  if(m<.5) return hatch(p); if(m<1.5) return flagstone(p); if(m<2.5) return planks(p); if(m<3.5) return grass(p);
  if(m<4.5) return earth(p); if(m<5.5) return water(p,uTime); return tile(p); }
void main(){
  vec2 p=vW; vec2 c=floor(p); vec2 f=p-c; float m=matAt(c);
  vec3 col=pick(m,p);
  if(m>.5 && uForce<0.){
    float ink=0., ao=0.;
    float L=matAt(c+vec2(-1,0)), R=matAt(c+vec2(1,0)), U=matAt(c+vec2(0,-1)), D=matAt(c+vec2(0,1));
    if(L!=m){ ink=max(ink,1.-smoothstep(.025,.05,f.x)); if(L<.5) ao=max(ao,1.-smoothstep(0.,.5,f.x)); }
    if(R!=m){ ink=max(ink,1.-smoothstep(.025,.05,1.-f.x)); if(R<.5) ao=max(ao,1.-smoothstep(0.,.5,1.-f.x)); }
    if(U!=m){ ink=max(ink,1.-smoothstep(.025,.05,f.y)); if(U<.5) ao=max(ao,1.-smoothstep(0.,.5,f.y)); }
    if(D!=m){ ink=max(ink,1.-smoothstep(.025,.05,1.-f.y)); if(D<.5) ao=max(ao,1.-smoothstep(0.,.5,1.-f.y)); }
    col*=1.-ao*.6; col=mix(col,INK,ink*.9);
  }
  gl_FragColor=vec4(col,1.);
}`;

/** A wall's dressed stone: two courses along it, mortar between, a warm top edge and shadow at the foot. */
export const WALL_FRAG = /* glsl */ `
varying vec2 vUv;
${PALETTE}
${NOISE}
void main(){ float along=vUv.x, across=vUv.y; float course=floor(across*2.); float u=(along+course*.27)/.55; float b=floor(u), fb=fract(u);
  float tone=h21(vec2(b,course)); vec3 c=mix(WALL_DARK, WALL_LIGHT, tone); c*=.85+.25*vnoise(vec2(along*6.,across*3.));
  float fa=fract(across*2.); float mortar=smoothstep(0.,.07,min(fb,1.-fb)*.55)*smoothstep(0.,.12,min(fa,1.-fa));
  c=mix(WALL_MORTAR, c, mortar); c+=WALL_TOP*smoothstep(.22,0.,across); c*=1.-.35*smoothstep(.6,1.,across);
  gl_FragColor=vec4(c,1.); }`;

/** A wall's soft shadow across its width. */
export const SHADOW_FRAG = /* glsl */ `
varying vec2 vUv; void main(){ float a=1.-abs(vUv.y*2.-1.); gl_FragColor=vec4(0.,0.,0.,pow(a,1.4)*.55); }`;

/** A prop's drop shadow: its own silhouette, black. */
export const PROP_SHADOW_FRAG = /* glsl */ `
uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor=vec4(0.,0.,0.,texture2D(map,vUv).a*.5); }`;

/** A prop's art, faded for a placement ghost. */
export const PROP_FRAG = /* glsl */ `
uniform sampler2D map; uniform float uOpacity; varying vec2 vUv;
void main(){ vec4 t=texture2D(map,vUv); gl_FragColor=vec4(t.rgb, t.a*uOpacity); }`;

/**
 * Every light's fan in one draw: each vertex carries its light's centre,
 * radii (squares), colour and flicker, and the falloff is the prototype's
 * bright core, dim skirt and hot centre.
 */
export const LIGHT_VERT = /* glsl */ `
attribute vec2 aCentre; attribute vec2 aRadii; attribute vec3 aColour; attribute vec2 aFlicker;
uniform float uTime;
varying vec2 vW; varying vec2 vC; varying vec2 vR; varying vec3 vCol; varying float vI;
void main(){
  vW=position.xy; vC=aCentre; vR=aRadii; vCol=aColour;
  float s=aFlicker.y;
  vI = aFlicker.x>.5 ? .9+.07*sin(uTime*9.+s)+.05*sin(uTime*23.7+s*3.) : 1.;
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);
}`;

export const LIGHT_FRAG = /* glsl */ `
varying vec2 vW; varying vec2 vC; varying vec2 vR; varying vec3 vCol; varying float vI;
void main(){ float d=distance(vW,vC); float b=max(vR.x,.001);
  float bright=1.-smoothstep(b*.8,b+.15,d); float dim=1.-smoothstep(vR.x+vR.y*.55,vR.x+vR.y,d);
  float l=max(bright,dim*.42)*(1.+.45*exp(-d*d/(b*b*.12+.05)));
  gl_FragColor=vec4(vCol*l*vI,1.); }`;

/** A flame's glow: a soft disc, tinted and flickering per instance. */
export const GLOW_VERT = /* glsl */ `
attribute vec3 aColour; attribute vec2 aFlicker; attribute float aVisible;
uniform float uTime;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vUv=uv; vCol=aColour;
  float s=aFlicker.y;
  float f = aFlicker.x>.5 ? .9+.07*sin(uTime*9.+s)+.05*sin(uTime*23.7+s*3.) : 1.;
  float scale=(.92+(f-.9)*1.6)*aVisible;
  vec4 w=instanceMatrix*vec4(position.xy*scale,0.,1.);
  gl_Position=projectionMatrix*viewMatrix*modelMatrix*w;
}`;

export const GLOW_FRAG = /* glsl */ `
varying vec2 vUv; varying vec3 vCol;
void main(){ float d=length(vUv-.5)*2.;
  float a = d<.18 ? mix(1.,.75,d/.18) : d<.45 ? mix(.75,.18,(d-.18)/.27) : d<1. ? mix(.18,0.,(d-.45)/.55) : 0.;
  gl_FragColor=vec4(vCol*a,1.); }`;

/**
 * A viewer's sight into the vision target: red where it has line of sight,
 * green where that sight is within its darkvision, combined across viewers by
 * taking the larger.
 */
export const VISION_FRAG = /* glsl */ `
uniform vec2 uC; uniform float uR; uniform vec3 uOut; varying vec2 vW;
void main(){ if(distance(vW,uC)>uR) discard; gl_FragColor=vec4(uOut,1.); }`;

/**
 * The composite, a full-screen pass: the drawn level (albedo) times ambient
 * plus the light map; in the party's view, colour where they see and it is lit,
 * grey where only darkvision sees, dim where they have been, the hatch where
 * they have not; the hatch outside the board; the grid; a vignette.
 */
export const COMPOSITE_VERT = /* glsl */ `
varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tA, tL, tV, tSees, tSeen;
uniform vec3 uAmb; uniform float uLit, uView, uGrid, uDmFloor; uniform vec4 uCam; uniform vec2 uBoard;
varying vec2 vUv;
${PALETTE}
${HATCH}
void main(){
  vec2 w=vec2(mix(uCam.x,uCam.z,vUv.x), mix(uCam.w,uCam.y,vUv.y));
  vec2 bUv=vec2(w.x/uBoard.x, 1.-w.y/uBoard.y);
  vec2 sUv=vec2(w.x/uBoard.x, w.y/uBoard.y);
  bool inBoard = w.x>=0. && w.y>=0. && w.x<=uBoard.x && w.y<=uBoard.y;
  vec3 alb=texture2D(tA,vUv).rgb;
  vec3 L=texture2D(tL,bUv).rgb;
  vec3 amt=uAmb+L;
  vec3 col=alb;
  if(uLit>.5){ vec3 a=max(amt, vec3(uDmFloor)); col=alb*a*1.1; col=col/(1.+max(col-1.,0.)*.6); }
  float lum=dot(amt,vec3(.333));
  if(uView>.5 && inBoard){
    vec4 v=texture2D(tV,bUv); float g=dot(alb,vec3(.3,.59,.11));
    bool sees=texture2D(tSees,sUv).r>.5, seen=texture2D(tSeen,sUv).r>.5;
    bool los=v.r>.5, dv=v.g>.5, lit=lum>.14;
    if(sees && los && lit){}
    else if(sees && los && dv){ col=vec3(g)*DARKVISION*.85; }
    else if(sees && los){}
    else if(seen){ col=vec3(g)*.13+MEMORY; }
    else col=hatch(w)*.7;
  }
  if(!inBoard) col=hatch(w);
  if(uGrid>.5 && inBoard){ vec2 f=abs(fract(w+.5)-.5)/fwidth(w); float gl=1.-clamp(min(f.x,f.y),0.,1.); col=mix(col,INK,gl*.38); }
  vec2 q=vUv-.5; col*=1.-dot(q,q)*.45;
  gl_FragColor=vec4(col,1.);
}`;
