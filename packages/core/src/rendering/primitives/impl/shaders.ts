/** 原语 shader 的共享布局常量；网格每顶点 6 float，形状每实例 16 float。 */
export const MESH_FLOATS = 6
export const INSTANCE_FLOATS = 16

export const MESH_VERTEX_GLSL = `#version 300 es
in vec2 position; in vec4 color; out vec4 tint;
void main(){ gl_Position=vec4(position,0.,1.); tint=color; }`
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

/** 折线段实例的 float 数：起点、终点、半宽、颜色、数据空间标记。 */
export const SEGMENT_FLOATS = 10

/**
 * 解析式描边：每个实例是一段折线，顶点只负责把胶囊扩到覆盖范围，
 * 覆盖率在片元着色器里按到线段的距离算，不再为每段和每个折点生成三角形。
 */
export const SEGMENT_VERTEX_GLSL = `#version 300 es
layout(location=0) in vec2 start;
layout(location=1) in vec2 end;
layout(location=2) in float halfWidth;
layout(location=3) in vec4 color;
layout(location=4) in float mode;
uniform vec4 viewport;
uniform vec3 data;
out vec2 world;
flat out vec2 segStart;
flat out vec2 segEnd;
flat out float segHalf;
flat out vec4 tint;
void main(){
  // mode=1 表示实例是数据空间（世界 x、价格 y）；0 表示已经是屏幕坐标。
  vec2 a=vec2(start.x-data.x*mode,mix(start.y,start.y*data.y+data.z,mode));
  vec2 b=vec2(end.x-data.x*mode,mix(end.y,end.y*data.y+data.z,mode));
  vec2 delta=b-a;
  float len=length(delta);
  vec2 direction=len>0.?delta/len:vec2(1.,0.);
  vec2 normal=vec2(-direction.y,direction.x);
  float feather=1./viewport.z;
  float extent=halfWidth+feather;
  float along=(gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.:-1.;
  float across=(gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1.:-1.;
  vec2 point=mix(a-direction*extent,b+direction*extent,along*.5+.5)+normal*(across*extent);
  world=point;
  gl_Position=vec4(point.x/viewport.x*2.-1.,1.-point.y/viewport.y*2.,0.,1.);
  segStart=a;segEnd=b;segHalf=halfWidth;tint=color;
}`
export const SEGMENT_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec2 world;
flat in vec2 segStart;
flat in vec2 segEnd;
flat in float segHalf;
flat in vec4 tint;
uniform vec4 viewport;
out vec4 outputColor;
void main(){
  vec2 delta=segEnd-segStart;
  float squared=dot(delta,delta);
  float t=squared>0.?clamp(dot(world-segStart,delta)/squared,0.,1.):0.;
  float distance=length(world-(segStart+delta*t));
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
  @location(3) @interpolate(flat) halfWidth:f32,
  @location(4) @interpolate(flat) tint:vec4f,
}
@vertex fn vs(@builtin(vertex_index) index:u32,
  @location(0) startPoint:vec2f,@location(1) endPoint:vec2f,
  @location(2) halfWidth:f32,@location(3) color:vec4f,@location(4) mode:f32)->Vertex {
  let start=vec2f(startPoint.x-viewport.data.x*mode,mix(startPoint.y,startPoint.y*viewport.data.y+viewport.data.z,mode));
  let end=vec2f(endPoint.x-viewport.data.x*mode,mix(endPoint.y,endPoint.y*viewport.data.y+viewport.data.z,mode));
  let delta=end-start;
  let len=length(delta);
  let direction=select(vec2f(1.,0.),delta/len,len>0.);
  let normal=vec2f(-direction.y,direction.x);
  let feather=1./viewport.size.z;
  let extent=halfWidth+feather;
  let along=select(-1.,1.,index==1u||index==2u||index==4u);
  let across=select(-1.,1.,index==2u||index==4u||index==5u);
  let point=mix(start-direction*extent,end+direction*extent,along*.5+.5)+normal*(across*extent);
  var out:Vertex;
  out.position=vec4f(point.x/viewport.size.x*2.-1.,1.-point.y/viewport.size.y*2.,0.,1.);
  out.world=point;out.start=start;out.end=end;out.halfWidth=halfWidth;out.tint=color;
  return out;
}
@fragment fn fs(in:Vertex)->@location(0) vec4f {
  let delta=in.end-in.start;
  let squared=dot(delta,delta);
  let t=select(0.,clamp(dot(in.world-in.start,delta)/squared,0.,1.),squared>0.);
  let distance=length(in.world-(in.start+delta*t));
  let pixel=1./viewport.size.z;
  let coverage=clamp((in.halfWidth+.5*pixel-distance)/pixel,0.,1.);
  let alpha=in.tint.a*coverage;
  return vec4f(in.tint.rgb*alpha,alpha);
}`

export const MESH_WGSL = `
struct Vertex { @builtin(position) position:vec4f, @location(0) color:vec4f }
@vertex fn vs(@location(0) position:vec2f,@location(1) color:vec4f)->Vertex {
  var out:Vertex;out.position=vec4f(position,0.,1.);out.color=color;return out;
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
