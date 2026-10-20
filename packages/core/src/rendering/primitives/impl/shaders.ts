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
