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

/** 折线段实例的 float 数：四个点、半宽、颜色、标志位。 */
export const SEGMENT_FLOATS = 14

/** 实例标志位：bit0 数据空间，bit1 凸四边形区域；合用一个 float，给顶点属性留出余量。 */
export const SEGMENT_FLAGS = { dataSpace: 1, polygon: 2 } as const

/**
 * 描边覆盖率着色器：每个实例是一个覆盖率区域，顶点只负责把四边形扩到它的包围盒，
 * 覆盖率在片元着色器里按距离算，不再为每段和每个折点生成三角形。
 *
 * - 胶囊（region=0）：四个点是起点、终点、前一点、后一点，片元取三段胶囊的并集距离，
 *   每个像素按端点角平分面只归一个实例，相邻段共享的圆盘因此不会被混合两次。
 * - 凸四边形（region=1）：四个点是四边形角点，相邻段共享同一条切边、互不重叠，
 *   片元直接取四边形距离，端帽与尖角连接全部由距离场产生抗锯齿。
 */
export const SEGMENT_VERTEX_GLSL = `#version 300 es
layout(location=0) in vec2 p0;
layout(location=1) in vec2 p1;
layout(location=2) in vec2 p2;
layout(location=3) in vec2 p3;
layout(location=4) in float halfWidth;
layout(location=5) in vec4 color;
layout(location=6) in float flags;
uniform vec4 viewport;
uniform vec3 data;
out vec2 world;
flat out vec2 seg0;
flat out vec2 seg1;
flat out vec2 seg2;
flat out vec2 seg3;
flat out vec2 bisStart;
flat out vec2 bisEnd;
flat out float segHalf;
flat out float segRegion;
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
  // 标志位：bit0 数据空间（世界 x、价格 y），bit1 凸四边形区域。两个标记共用一个 float。
  float region=step(1.5,flags);
  float mode=flags-2.*region;
  vec2 a=vec2(p0.x-data.x*mode,mix(p0.y,p0.y*data.y+data.z,mode));
  vec2 b=vec2(p1.x-data.x*mode,mix(p1.y,p1.y*data.y+data.z,mode));
  vec2 c=vec2(p2.x-data.x*mode,mix(p2.y,p2.y*data.y+data.z,mode));
  vec2 d=vec2(p3.x-data.x*mode,mix(p3.y,p3.y*data.y+data.z,mode));
  // 四边形自带线宽，只需要抗锯齿带的外扩；胶囊要把半宽算进去。
  float extent=(region>.5?0.:halfWidth)+1./viewport.z;
  vec2 low=min(min(a,b),min(c,d))-extent;
  vec2 high=max(max(a,b),max(c,d))+extent;
  float along=(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.:0.;
  float across=(gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1.:0.;
  vec2 point=mix(low,high,vec2(along,across));
  world=point;
  gl_Position=vec4(point.x/viewport.x*2.-1.,1.-point.y/viewport.y*2.,0.,1.);
  seg0=a;seg1=b;seg2=c;seg3=d;segHalf=halfWidth;segRegion=region;tint=color;
  // 四边形区段不共享圆盘，不需要归属平面。
  bisStart=region>.5?vec2(0.):bisector(c,a,b);
  bisEnd=region>.5?vec2(0.):bisector(a,b,d);
}`
export const SEGMENT_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec2 world;
flat in vec2 seg0;
flat in vec2 seg1;
flat in vec2 seg2;
flat in vec2 seg3;
flat in vec2 bisStart;
flat in vec2 bisEnd;
flat in float segHalf;
flat in float segRegion;
flat in vec4 tint;
uniform vec4 viewport;
out vec4 outputColor;
// 到线段的距离；退化段退化成点，胶囊端帽仍然是圆。
float segmentDistance(vec2 point,vec2 a,vec2 b){
  vec2 delta=b-a;
  float squared=dot(delta,delta);
  float t=squared>0.?clamp(dot(point-a,delta)/squared,0.,1.):0.;
  return length(point-(a+delta*t));
}
// 点在有向边 a→b 的哪一侧。
float side(vec2 a,vec2 b,vec2 point){
  return (b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x);
}
void main(){
  float edgeDistance;
  if(segRegion>.5){
    // 凸四边形：四条边的最短距离，内部为负。相邻段共享切边，像素只落在一个四边形里。
    float edge=min(min(segmentDistance(world,seg0,seg1),segmentDistance(world,seg1,seg2)),
                   min(segmentDistance(world,seg2,seg3),segmentDistance(world,seg3,seg0)));
    float s0=side(seg0,seg1,world),s1=side(seg1,seg2,world),s2=side(seg2,seg3,world),s3=side(seg3,seg0,world);
    bool inside=(s0>=0.&&s1>=0.&&s2>=0.&&s3>=0.)||(s0<=0.&&s1<=0.&&s2<=0.&&s3<=0.);
    edgeDistance=inside?-edge:edge;
  }else{
    // 胶囊：每个像素只归一个实例，末端取角平分面背面（含平面本身），起始端严格取正面，
    // 法线为零向量表示该端没有相邻段，不裁剪。两段共享的圆盘因此不会被混合两次。
    if(dot(world-seg1,bisEnd)>0.) discard;
    if(dot(bisStart,bisStart)>0.&&dot(world-seg0,bisStart)<=0.) discard;
    // 覆盖率取本段与相邻两段的并集距离：拐角圆盘不会再叠出一圈硬边小结。
    edgeDistance=min(segmentDistance(world,seg2,seg0),min(segmentDistance(world,seg0,seg1),segmentDistance(world,seg1,seg3)));
  }
  float pixel=1./viewport.z;
  float coverage=clamp((segHalf+.5*pixel-edgeDistance)/pixel,0.,1.);
  float alpha=tint.a*coverage;
  outputColor=vec4(tint.rgb*alpha,alpha);
}`

/** WebGPU 版描边覆盖率着色器：布局与 WebGL 的 SEGMENT_* 一致，组 0 复用 viewport uniform。 */
export const SEGMENT_WGSL = `
struct Viewport { size:vec4f, data:vec4f }
@group(0) @binding(0) var<uniform> viewport:Viewport;
struct Vertex {
  @builtin(position) position:vec4f,
  @location(0) world:vec2f,
  @location(1) @interpolate(flat) p0:vec2f,
  @location(2) @interpolate(flat) p1:vec2f,
  @location(3) @interpolate(flat) p2:vec2f,
  @location(4) @interpolate(flat) p3:vec2f,
  @location(5) @interpolate(flat) bisStart:vec2f,
  @location(6) @interpolate(flat) bisEnd:vec2f,
  @location(7) @interpolate(flat) halfWidth:f32,
  @location(8) @interpolate(flat) region:f32,
  @location(9) @interpolate(flat) tint:vec4f,
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
  @location(0) point0:vec2f,@location(1) point1:vec2f,
  @location(2) point2:vec2f,@location(3) point3:vec2f,
  @location(4) halfWidth:f32,@location(5) color:vec4f,
  @location(6) flags:f32)->Vertex {
  // 标志位：bit0 数据空间，bit1 凸四边形区域。两个标记共用一个 float。
  let region=select(0.,1.,flags>1.5);
  let mode=flags-2.*region;
  let a=vec2f(point0.x-viewport.data.x*mode,mix(point0.y,point0.y*viewport.data.y+viewport.data.z,mode));
  let b=vec2f(point1.x-viewport.data.x*mode,mix(point1.y,point1.y*viewport.data.y+viewport.data.z,mode));
  let c=vec2f(point2.x-viewport.data.x*mode,mix(point2.y,point2.y*viewport.data.y+viewport.data.z,mode));
  let d=vec2f(point3.x-viewport.data.x*mode,mix(point3.y,point3.y*viewport.data.y+viewport.data.z,mode));
  // 四边形自带线宽，只需要抗锯齿带的外扩；胶囊要把半宽算进去。
  let extent=select(halfWidth,0.,region>0.5)+1./viewport.size.z;
  let low=min(min(a,b),min(c,d))-vec2f(extent);
  let high=max(max(a,b),max(c,d))+vec2f(extent);
  let along=select(0.,1.,index==1u||index==2u||index==4u);
  let across=select(0.,1.,index==2u||index==4u||index==5u);
  let point=mix(low,high,vec2f(along,across));
  var out:Vertex;
  out.position=vec4f(point.x/viewport.size.x*2.-1.,1.-point.y/viewport.size.y*2.,0.,1.);
  out.world=point;out.p0=a;out.p1=b;out.p2=c;out.p3=d;
  // 四边形区段不共享圆盘，不需要归属平面。
  var startBis=vec2f(0.);var endBis=vec2f(0.);
  if(region<0.5){startBis=bisector(c,a,b);endBis=bisector(a,b,d);}
  out.bisStart=startBis;out.bisEnd=endBis;
  out.halfWidth=halfWidth;out.region=region;out.tint=color;
  return out;
}
fn segmentDistance(point:vec2f,a:vec2f,b:vec2f)->f32 {
  let delta=b-a;
  let squared=dot(delta,delta);
  let t=select(0.,clamp(dot(point-a,delta)/squared,0.,1.),squared>0.);
  return length(point-(a+delta*t));
}
fn side(a:vec2f,b:vec2f,point:vec2f)->f32 {
  return (b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x);
}
@fragment fn fs(in:Vertex)->@location(0) vec4f {
  var edgeDistance=0.;
  if(in.region>0.5){
    // 凸四边形：四条边的最短距离，内部为负。相邻段共享切边，像素只落在一个四边形里。
    let edge=min(min(segmentDistance(in.world,in.p0,in.p1),segmentDistance(in.world,in.p1,in.p2)),
                 min(segmentDistance(in.world,in.p2,in.p3),segmentDistance(in.world,in.p3,in.p0)));
    let s0=side(in.p0,in.p1,in.world);let s1=side(in.p1,in.p2,in.world);
    let s2=side(in.p2,in.p3,in.world);let s3=side(in.p3,in.p0,in.world);
    let inside=(s0>=0.&&s1>=0.&&s2>=0.&&s3>=0.)||(s0<=0.&&s1<=0.&&s2<=0.&&s3<=0.);
    edgeDistance=select(edge,-edge,inside);
  }else{
    if(dot(in.world-in.p1,in.bisEnd)>0.){discard;}
    if(dot(in.bisStart,in.bisStart)>0.&&dot(in.world-in.p0,in.bisStart)<=0.){discard;}
    edgeDistance=min(segmentDistance(in.world,in.p2,in.p0),min(segmentDistance(in.world,in.p0,in.p1),segmentDistance(in.world,in.p1,in.p3)));
  }
  let pixel=1./viewport.size.z;
  let coverage=clamp((in.halfWidth+.5*pixel-edgeDistance)/pixel,0.,1.);
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
