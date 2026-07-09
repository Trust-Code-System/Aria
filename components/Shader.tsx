'use client';

import React, { useEffect, useRef } from 'react';

export function Shader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function syncSize() {
      if (!canvas) return;
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const observer = new ResizeObserver(syncSize);
    observer.observe(canvas);
    syncSize();

    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext);
    if (!gl) return;

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

    const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float time = u_time * 0.2;
    
    // Create a flowing, multi-layered noise effect
    float noise = sin(uv.x * 3.0 + time) * cos(uv.y * 2.0 - time * 0.5);
    noise += sin(uv.y * 4.0 + time * 1.2) * 0.5;
    
    // Warm Fierce-style palette stops
    vec3 background = vec3(0.247, 0.227, 0.192); // #3f3a31
    vec3 accent = vec3(0.576, 0.251, 1.0);       // #9340ff
    vec3 highlight = vec3(0.843, 0.784, 0.667);  // #d7c8aa
    
    vec3 color = mix(background, accent, noise * 0.15 + 0.1);
    color = mix(color, highlight, pow(noise, 2.0) * 0.05);
    
    gl_FragColor = vec4(color, 1.0);
}`;

    function cs(type: number, src: string) {
      const s = gl!.createShader(type);
      if (!s) return null;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    if (!prog) return;

    const vShader = cs(gl.VERTEX_SHADER, vs);
    const fShader = cs(gl.FRAGMENT_SHADER, fs);
    if (vShader) gl.attachShader(prog, vShader);
    if (fShader) gl.attachShader(prog, fShader);
    
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');

    let reqId: number;
    function render(t: number) {
      if (!canvas) return;
      gl!.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl!.uniform1f(uTime, t * 0.001);
      if (uRes) gl!.uniform2f(uRes, canvas.width, canvas.height);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      reqId = requestAnimationFrame(render);
    }
    reqId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(reqId);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none -z-10">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
