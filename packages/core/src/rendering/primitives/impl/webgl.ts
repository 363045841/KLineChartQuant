/** WebGL2 原语设备：stencil winding 实现任意路径填充，字形走纹理四边形。 */
import type { PrimitiveDevice } from './gpu.js'
import { createGpuPrimitiveBackend } from './gpu.js'

const VERTEX = `#version 300 es
in vec2 position; in vec2 uv; in vec4 color;
out vec2 textureUV; out vec4 tint;
void main(){ gl_Position=vec4(position,0.,1.); textureUV=uv; tint=color; }`
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 textureUV; in vec4 tint; uniform sampler2D image; out vec4 outputColor;
void main(){ vec4 value=texture(image,textureUV); outputColor=vec4(value.rgb*tint.rgb*tint.a,value.a*tint.a); }`

/** 创建独立原语目标，不改变行情共享 WebGL surface 的帧和绑定状态。 */
function createDevice(document: Document): PrimitiveDevice {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
  if (!gl) throw new Error('Primitive WebGL unavailable')
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  const vao = gl.createVertexArray()
  const texture = gl.createTexture()
  if (!program || !buffer || !vao || !texture) throw new Error('Primitive WebGL allocation failed')
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Primitive shader allocation failed')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Primitive WebGL pipeline failed')
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  for (const [name, size, offset] of [['position', 2, 0], ['uv', 2, 8], ['color', 4, 16]] as const) {
    const location = gl.getAttribLocation(program, name)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset)
  }
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return {
    render(batch, width, height) {
      if (gl.isContextLost()) throw new Error('Primitive WebGL context lost')
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 0)
      gl.clearStencil(0)
      gl.colorMask(true, true, true, true)
      gl.stencilMask(0xff)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(gl.getUniformLocation(program, 'image'), 0)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      for (const primitive of batch) {
        gl.bufferData(gl.ARRAY_BUFFER, primitive.vertices, gl.STREAM_DRAW)
        if (primitive.direct) {
          gl.disable(gl.STENCIL_TEST)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
          gl.drawArrays(gl.TRIANGLES, 0, primitive.vertices.length / 8)
        } else if (primitive.image) {
          gl.disable(gl.STENCIL_TEST)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, primitive.image)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
        } else if (primitive.maskCount > 0) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
          gl.enable(gl.STENCIL_TEST)
          gl.colorMask(false, false, false, false)
          gl.stencilFunc(gl.ALWAYS, 0, 0xff)
          gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, primitive.evenodd ? gl.INVERT : gl.INCR_WRAP)
          gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, primitive.evenodd ? gl.INVERT : gl.DECR_WRAP)
          gl.drawArrays(gl.TRIANGLES, 0, primitive.maskCount)
          gl.colorMask(true, true, true, true)
          gl.stencilFunc(gl.NOTEQUAL, 0, primitive.evenodd ? 1 : 0xff)
          gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO)
          gl.drawArrays(gl.TRIANGLES, primitive.maskCount, 6)
        }
      }
      gl.disable(gl.STENCIL_TEST)
      gl.flush()
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Primitive WebGL submission failed')
      return canvas
    },
    dispose() {
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.width = canvas.height = 1
    },
  }
}

/** 建立 WebGL 原语后端，资源在首次绘制时创建。 */
export function createWebGLPrimitiveBackend() { return createGpuPrimitiveBackend(createDevice) }
