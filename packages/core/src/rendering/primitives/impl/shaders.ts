/** 原语 shader 的共享布局常量；网格每顶点 7 float（含数据空间标记），形状每实例 16 float。 */
export const MESH_FLOATS = 7
export const INSTANCE_FLOATS = 16

export const MESH_VERTEX_GLSL = `#version 300 es
in vec2 position; in vec4 color; in float mode; out vec4 tint;
uniform vec4 viewport; uniform vec3 data;
void main(){
  vec2 point=vec2(position.x-data.x*mode,mix(position.y,position.y*data.y+data.z,mode));
  gl_Position=vec4(point.x/viewport.x*2.-1.,1.-point.y/viewport.y*2.,0.,1.);
  tint=color;
}`
export const MESH_FRAGMENT_GLSL = `#version 300 es
precision highp float; in vec4 tint; out vec4 outputColor;
void main(){ outputColor=vec4(tint.rgb*tint.a,tint.a); }`
export const SHAPE_VERTEX_GLSL = `#version 300 es
in vec4 bounds; in vec4 parameters; in vec4 fillColor; in vec4 strokeColor;
uniform vec4 viewport; out vec2 local; flat out vec4 geometry; flat out vec4 fillTint; flat out vec4 strokeTint;
void main(){
  vec2 unit=vec2((gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.:-1.,(gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1.:-1.);
  local=unit*(bounds.zw+parameters.y*.5+1./viewport.z);
  vec2 point=bounds.xy+local;
  gl_Position=vec4(point.x/viewport.x*2.-1.,1.-point.y/viewport.y*2.,0.,1.);
  geometry=vec4(bounds.zw,parameters.xy); fillTint=fillColor; strokeTint=strokeColor;
}`
export const SHAPE_FRAGMENT_GLSL = `#version 300 es
precision highp float; in vec2 local; flat in vec4 geometry; flat in vec4 fillTint; flat in vec4 strokeTint;
uniform vec4 viewport; out vec4 outputColor;
void main(){
  vec2 q=abs(local)-geometry.xy+geometry.z;
  float distance=length(max(q,0.))+min(max(q.x,q.y),0.)-geometry.z;
  float aa=.5/viewport.z;
  float fillCoverage=clamp(.5-distance/(2.*aa),0.,1.);
  float strokeCoverage=geometry.w>0.?clamp(.5-(abs(distance)-geometry.w*.5)/(2.*aa),0.,1.):0.;
  vec4 fill=vec4(fillTint.rgb,1.)*(fillTint.a*fillCoverage);
  vec4 stroke=vec4(strokeTint.rgb,1.)*(strokeTint.a*strokeCoverage);
  outputColor=stroke+fill*(1.-stroke.a);
}`

/** 折线段实例的 float 数：起点、终点、前一点、后一点、半宽、颜色、数据空间标记。 */
export const SEGMENT_FLOATS = 14

/**
 * 解析式描边：每个实例是一段折线，顶点只负责把四边形扩到相邻三段 capsule 的包围盒，
 * 覆盖率在片元着色器里按到线段的距离算，不再为每段和每个折点生成三角形。
 */
export const SEGMENT_VERTEX_GLSL = `#version 300 es
layout(location=0) in vec2 start;
layout(location=1) in vec2 end;
layout(location=2) in vec2 prev;
layout(location=3) in vec2 next;
layout(location=4) in float halfWidth;
layout(location=5) in vec4 color;
layout(location=6) in float mode;
uniform vec4 viewport;
uniform vec3 data;
out vec2 world;
flat out vec2 segStart;
flat out vec2 segEnd;
flat out vec2 segPrev;
flat out vec2 segNext;
flat out vec2 bisStart;
flat out vec2 bisEnd;
flat out float segHalf;
flat out vec4 tint;
// 端点归属平面的法线：相邻两段共用同一个角平分面，各占一半，重叠像素只混合一次。
// 该端没有相邻段时返回零向量（不裁剪）；180° 折返没有角平分面，改用与两段都垂直的方向，
// 相邻两段算出同一个值，归属仍然互补。
vec2 bisector(vec2 a,vec2 b,vec2 c){
  vec2 d0=b-a,d1=c-b;
  float l0=length(d0),l1=length(d1);
  if(l0<=0.||l1<=0.) return vec2(0.);
  vec2 u0=d0/l0,u1=d1/l1;
  vec2 sum=u0+u1;
  float total=length(sum);
  return total>1e-4?sum/total:normalize(u0-u1);
}
void main(){
  // mode=1 表示实例是数据空间（世界 x、价格 y）；0 表示已经是屏幕坐标。
  vec2 a=vec2(start.x-data.x*mode,mix(start.y,start.y*data.y+data.z,mode));
  vec2 b=vec2(end.x-data.x*mode,mix(end.y,end.y*data.y+data.z,mode));
  vec2 p=vec2(prev.x-data.x*mode,mix(prev.y,prev.y*data.y+data.z,mode));
  vec2 n=vec2(next.x-data.x*mode,mix(next.y,next.y*data.y+data.z,mode));
  // 相邻段的距离也参与覆盖率，四边形必须盖住三段 capsule；按轴对齐包围盒展开最省顶点计算。
  float extent=halfWidth+1./viewport.z;
  vec2 low=min(min(a,b),min(p,n))-extent;
  vec2 high=max(max(a,b),max(p,n))+extent;
  float along=(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.:0.;
  float across=(gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1.:0.;
  vec2 point=mix(low,high,vec2(along,across));
  world=point;
  gl_Position=vec4(point.x/viewport.x*2.-1.,1.-point.y/viewport.y*2.,0.,1.);
  segStart=a;segEnd=b;segPrev=p;segNext=n;segHalf=halfWidth;tint=color;
  bisStart=bisector(p,a,b);bisEnd=bisector(a,b,n);
}`
export const SEGMENT_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec2 world;
flat in vec2 segStart;
flat in vec2 segEnd;
flat in vec2 segPrev;
flat in vec2 segNext;
flat in vec2 bisStart;
flat in vec2 bisEnd;
flat in float segHalf;
flat in vec4 tint;
uniform vec4 viewport;
out vec4 outputColor;
// 到线段的距离；退化段退化成点，端帽仍然是圆。
float capsule(vec2 point,vec2 a,vec2 b){
  vec2 delta=b-a;
  float squared=dot(delta,delta);
  float t=squared>0.?clamp(dot(point-a,delta)/squared,0.,1.):0.;
  return length(point-(a+delta*t));
}
void main(){
  // 每个像素只归一个实例：末端取角平分面背面（含平面本身），起始端严格取正面，
  // 法线为零向量表示该端没有相邻段，不裁剪。两段共享的圆盘因此不会被混合两次。
  if(dot(world-segEnd,bisEnd)>0.) discard;
  if(dot(bisStart,bisStart)>0.&&dot(world-segStart,bisStart)<=0.) discard;
  // 覆盖率取本段与相邻两段的并集距离：拐角圆盘不会再叠出一圈硬边小结。
  float distance=min(capsule(world,segPrev,segStart),min(capsule(world,segStart,segEnd),capsule(world,segEnd,segNext)));
  float pixel=1./viewport.z;
  float coverage=clamp((segHalf+.5*pixel-distance)/pixel,0.,1.);
  float alpha=tint.a*coverage;
  outputColor=vec4(tint.rgb*alpha,alpha);
}`

/** WebGPU 版解析式描边：布局与 WebGL 的 SEGMENT_* 一致，组 0 复用 viewport uniform。 */
export const SEGMENT_WGSL = `
struct Viewport { size:vec4f, data:vec4f }
@group(0) @binding(0) var<uniform> viewport:Viewport;
struct Vertex {
  @builtin(position) position:vec4f,
  @location(0) world:vec2f,
  @location(1) @interpolate(flat) start:vec2f,
  @location(2) @interpolate(flat) end:vec2f,
  @location(3) @interpolate(flat) prev:vec2f,
  @location(4) @interpolate(flat) next:vec2f,
  @location(5) @interpolate(flat) bisStart:vec2f,
  @location(6) @interpolate(flat) bisEnd:vec2f,
  @location(7) @interpolate(flat) halfWidth:f32,
  @location(8) @interpolate(flat) tint:vec4f,
}
fn bisector(a:vec2f,b:vec2f,c:vec2f)->vec2f {
  let d0=b-a;let d1=c-b;
  let l0=length(d0);let l1=length(d1);
  if(l0<=0.||l1<=0.){return vec2f(0.);}
  let u0=d0/l0;let u1=d1/l1;
  let sum=u0+u1;
  let total=length(sum);
  return select(normalize(u0-u1),sum/total,total>1e-4);
}
@vertex fn vs(@builtin(vertex_index) index:u32,
  @location(0) startPoint:vec2f,@location(1) endPoint:vec2f,
  @location(2) prevPoint:vec2f,@location(3) nextPoint:vec2f,
  @location(4) halfWidth:f32,@location(5) color:vec4f,@location(6) mode:f32)->Vertex {
  let start=vec2f(startPoint.x-viewport.data.x*mode,mix(startPoint.y,startPoint.y*viewport.data.y+viewport.data.z,mode));
  let end=vec2f(endPoint.x-viewport.data.x*mode,mix(endPoint.y,endPoint.y*viewport.data.y+viewport.data.z,mode));
  let prev=vec2f(prevPoint.x-viewport.data.x*mode,mix(prevPoint.y,prevPoint.y*viewport.data.y+viewport.data.z,mode));
  let next=vec2f(nextPoint.x-viewport.data.x*mode,mix(nextPoint.y,nextPoint.y*viewport.data.y+viewport.data.z,mode));
  let extent=halfWidth+1./viewport.size.z;
  let low=min(min(start,end),min(prev,next))-vec2f(extent);
  let high=max(max(start,end),max(prev,next))+vec2f(extent);
  let along=select(0.,1.,index==1u||index==2u||index==4u);
  let across=select(0.,1.,index==2u||index==4u||index==5u);
  let point=mix(low,high,vec2f(along,across));
  var out:Vertex;
  out.position=vec4f(point.x/viewport.size.x*2.-1.,1.-point.y/viewport.size.y*2.,0.,1.);
  out.world=point;out.start=start;out.end=end;out.prev=prev;out.next=next;
  out.bisStart=bisector(prev,start,end);out.bisEnd=bisector(start,end,next);
  out.halfWidth=halfWidth;out.tint=color;
  return out;
}
fn capsule(point:vec2f,a:vec2f,b:vec2f)->f32 {
  let delta=b-a;
  let squared=dot(delta,delta);
  let t=select(0.,clamp(dot(point-a,delta)/squared,0.,1.),squared>0.);
  return length(point-(a+delta*t));
}
@fragment fn fs(in:Vertex)->@location(0) vec4f {
  if(dot(in.world-in.end,in.bisEnd)>0.){discard;}
  if(dot(in.bisStart,in.bisStart)>0.&&dot(in.world-in.start,in.bisStart)<=0.){discard;}
  let distance=min(capsule(in.world,in.prev,in.start),min(capsule(in.world,in.start,in.end),capsule(in.world,in.end,in.next)));
  let pixel=1./viewport.size.z;
  let coverage=clamp((in.halfWidth+.5*pixel-distance)/pixel,0.,1.);
  let alpha=in.tint.a*coverage;
  return vec4f(in.tint.rgb*alpha,alpha);
}`

export const MESH_WGSL = `
struct Viewport { size:vec4f, data:vec4f }
@group(0) @binding(0) var<uniform> viewport:Viewport;
struct Vertex { @builtin(position) position:vec4f, @location(0) color:vec4f }
@vertex fn vs(@location(0) position:vec2f,@location(1) color:vec4f,@location(2) mode:f32)->Vertex {
  var out:Vertex;
  let point=vec2f(position.x-viewport.data.x*mode,mix(position.y,position.y*viewport.data.y+viewport.data.z,mode));
  out.position=vec4f(point.x/viewport.size.x*2.-1.,1.-point.y/viewport.size.y*2.,0.,1.);
  out.color=color;return out;
}
@fragment fn fs(in:Vertex)->@location(0) vec4f { return vec4f(in.color.rgb*in.color.a,in.color.a); }`
export const SHAPE_WGSL = `
struct Viewport { size:vec4f }
@group(0) @binding(0) var<uniform> viewport:Viewport;
struct Vertex { @builtin(position) position:vec4f, @location(0) local:vec2f, @location(1) @interpolate(flat) geometry:vec4f,
@location(2) @interpolate(flat) fill:vec4f,@location(3) @interpolate(flat) stroke:vec4f }
@vertex fn vs(@builtin(vertex_index) index:u32,@location(0) bounds:vec4f,@location(1) parameters:vec4f,@location(2) fill:vec4f,@location(3) stroke:vec4f)->Vertex {
  let unit=vec2f(select(-1.,1.,index==1u||index==2u||index==4u),select(-1.,1.,index==2u||index==4u||index==5u));
  var out:Vertex;out.local=unit*(bounds.zw+parameters.y*.5+1./viewport.size.z);
  let point=bounds.xy+out.local;
  out.position=vec4f(point.x/viewport.size.x*2.-1.,1.-point.y/viewport.size.y*2.,0.,1.);
  out.geometry=vec4f(bounds.zw,parameters.xy);out.fill=fill;out.stroke=stroke;return out;
}
@fragment fn fs(in:Vertex)->@location(0) vec4f {
  let q=abs(in.local)-in.geometry.xy+in.geometry.z;
  let distance=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-in.geometry.z;
  let aa=.5/viewport.size.z;
  let fillCoverage=clamp(.5-distance/(2.*aa),0.,1.);
  let strokeCoverage=select(0.,clamp(.5-(abs(distance)-in.geometry.w*.5)/(2.*aa),0.,1.),in.geometry.w>0.);
  let fill=vec4f(in.fill.rgb,1.)*(in.fill.a*fillCoverage);
  let stroke=vec4f(in.stroke.rgb,1.)*(in.stroke.a*strokeCoverage);
  return stroke+fill*(1.-stroke.a);
}`
