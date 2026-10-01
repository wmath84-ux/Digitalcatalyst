import * as THREE from "three";

export interface TextureCompressionSupport {
  astc: boolean;
  etc2: boolean;
  s3tc: boolean;
  pvrtc: boolean;
  basisUniversalPath: string;
}

/**
 * Runtime capability probe for a real mobile texture-compression pipeline.
 * Browsers cannot magically compress canvas-generated textures into ASTC/ETC2;
 * the assets must be authored offline as KTX2/Basis. This function wires the
 * engine side of that pipeline: detect hardware support once, publish it, and
 * make the renderer ready for KTX2 assets when they are added to `public/`.
 */
export function detectTextureCompression(renderer: THREE.WebGLRenderer): TextureCompressionSupport {
  const gl = renderer.getContext();
  const has = (name: string) => Boolean(gl.getExtension(name));
  return {
    astc: has("WEBGL_compressed_texture_astc"),
    etc2: has("WEBGL_compressed_texture_etc") || has("WEBGL_compressed_texture_etc1"),
    s3tc: has("WEBGL_compressed_texture_s3tc") || has("WEBKIT_WEBGL_compressed_texture_s3tc"),
    pvrtc: has("WEBGL_compressed_texture_pvrtc") || has("WEBKIT_WEBGL_compressed_texture_pvrtc"),
    basisUniversalPath: `${import.meta.env.BASE_URL}basis/`,
  };
}

export function logTextureCompressionSupport(renderer: THREE.WebGLRenderer): TextureCompressionSupport {
  const support = detectTextureCompression(renderer);
  console.info(
    `[sanctuary] texture compression support: ASTC=${support.astc ? "yes" : "no"}, ` +
    `ETC=${support.etc2 ? "yes" : "no"}, S3TC=${support.s3tc ? "yes" : "no"}, ` +
    `PVRTC=${support.pvrtc ? "yes" : "no"}. KTX2/Basis path=${support.basisUniversalPath}`,
  );
  return support;
}
