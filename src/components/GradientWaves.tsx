import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

interface GradientWavesProps {
  horizonColor?: string;
  waveColor?: string;
  crestColor?: string;
  speed?: number;
  amplitude?: number;
  waveScale?: number;
  waveRatio?: number;
  swell?: number;
  turbulence?: number;
  tilt?: number;
  zoom?: number;
  height?: number;
  fogDepth?: number;
  detail?: 'low' | 'medium' | 'high';
  brightness?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  parallaxStrength?: number;
  grain?: boolean;
  grainIntensity?: number;
  className?: string;
}

export default function GradientWaves({
  horizonColor = '#5227FF',
  waveColor = '#FF9FFC',
  crestColor = '#FFFFFF',
  speed = 0.4,
  amplitude = 2.5,
  waveScale = 0.6,
  waveRatio = 0.9,
  swell = 35,
  turbulence = 20,
  tilt = 1.11,
  zoom = 1.0,
  height = 5.5,
  fogDepth = 15,
  detail = 'medium',
  brightness = 1.0,
  opacity = 1.0,
  mouseInteraction = true,
  parallaxStrength = 0.5,
  grain = true,
  grainIntensity = 0.05,
  className = '',
}: GradientWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new Renderer({ 
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true 
    });
    const gl = renderer.gl;
    
    const container = containerRef.current;
    container.appendChild(gl.canvas);
    
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    gl.canvas.style.display = 'block';

    const vertexShader = `
      attribute vec2 position;
      varying vec2 vUv;
      
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uHorizonColor;
      uniform vec3 uWaveColor;
      uniform vec3 uCrestColor;
      uniform float uSpeed;
      uniform float uAmplitude;
      uniform float uWaveScale;
      uniform float uWaveRatio;
      uniform float uSwell;
      uniform float uTurbulence;
      uniform float uTilt;
      uniform float uZoom;
      uniform float uHeight;
      uniform float uFogDepth;
      uniform float uBrightness;
      uniform float uOpacity;
      uniform vec2 uMouse;
      uniform float uParallaxStrength;
      uniform float uGrainIntensity;
      
      varying vec2 vUv;
      
      // Simplex noise function
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
      
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
          + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
          dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      
      void main() {
        vec2 uv = vUv;
        vec2 mouse = uMouse * uParallaxStrength;
        
        // Apply parallax
        uv += mouse * 0.05;
        
        float time = uTime * uSpeed;
        
        // Wave calculation
        float wave1 = sin(uv.x * uWaveScale * 10.0 + time) * uAmplitude;
        float wave2 = sin(uv.x * uWaveScale * 15.0 * uWaveRatio + time * 1.3) * uAmplitude * 0.7;
        float wave3 = sin(uv.x * uWaveScale * 20.0 + time * 0.7) * uAmplitude * 0.5;
        
        // Add turbulence
        float turb = snoise(vec2(uv.x * 2.0 + time * 0.1, time * 0.05)) * uTurbulence * 0.01;
        float swellNoise = snoise(vec2(uv.x * 0.5 + time * 0.05, 0.0)) * uSwell * 0.01;
        
        float waves = wave1 + wave2 + wave3 + turb + swellNoise;
        
        // Horizon line
        float horizonY = 0.5 + uHeight * 0.01;
        float waveY = horizonY + waves * 0.02;
        
        // Distance from wave
        float dist = uv.y - waveY;
        
        // Apply tilt
        float tiltFactor = 1.0 + (uv.y - horizonY) * uTilt;
        dist *= tiltFactor;
        
        // Fog effect
        float fog = smoothstep(0.0, uFogDepth * 0.01, dist);
        
        // Color mixing
        vec3 color = mix(uHorizonColor, uWaveColor, smoothstep(-0.1, 0.1, dist));
        color = mix(color, uCrestColor, smoothstep(0.0, 0.02, dist) * (1.0 - fog));
        
        // Apply fog
        color = mix(color, uHorizonColor, fog);
        
        // Brightness
        color *= uBrightness;
        
        // Grain
        if (uGrainIntensity > 0.0) {
          float grain = fract(sin(dot(uv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
          color += (grain - 0.5) * uGrainIntensity;
        }
        
        gl_FragColor = vec4(color, uOpacity);
      }
    `;

    const geometry = new Triangle(gl);
    
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
        uHorizonColor: { value: hexToRgb(horizonColor) },
        uWaveColor: { value: hexToRgb(waveColor) },
        uCrestColor: { value: hexToRgb(crestColor) },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uWaveScale: { value: waveScale },
        uWaveRatio: { value: waveRatio },
        uSwell: { value: swell },
        uTurbulence: { value: turbulence },
        uTilt: { value: tilt },
        uZoom: { value: zoom },
        uHeight: { value: height },
        uFogDepth: { value: fogDepth },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uMouse: { value: [0, 0] },
        uParallaxStrength: { value: parallaxStrength },
        uGrainIntensity: { value: grain ? grainIntensity : 0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseInteraction) return;
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / rect.width * 2 - 1;
      mouseRef.current.y = (e.clientY - rect.top) / rect.height * 2 - 1;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    if (mouseInteraction) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    let startTime = Date.now();
    
    const animate = () => {
      const elapsed = (Date.now() - startTime) * 0.001;
      program.uniforms.uTime.value = elapsed;
      
      // Smooth mouse interpolation
      const currentMouse = program.uniforms.uMouse.value;
      currentMouse[0] += (mouseRef.current.x - currentMouse[0]) * 0.05;
      currentMouse[1] += (mouseRef.current.y - currentMouse[1]) * 0.05;
      
      renderer.render({ scene: mesh });
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (mouseInteraction) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    horizonColor, waveColor, crestColor, speed, amplitude, waveScale,
    waveRatio, swell, turbulence, tilt, zoom, height, fogDepth,
    brightness, opacity, mouseInteraction, parallaxStrength, grain, grainIntensity
  ]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 -z-10 ${className}`}
      style={{ pointerEvents: 'none' }}
    />
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}
