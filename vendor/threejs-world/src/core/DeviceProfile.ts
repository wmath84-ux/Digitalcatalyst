/** Digital Catalyst mobile budgets for the SAME procedural world.
 * Browser hints are conservative signals, not reliable SoC/RAM identification.
 * ?quality=desktop|mobile-low|mobile-balanced provides reproducible A/B runs.
 */
export interface DeviceHints {
  userAgent: string;
  maxTouchPoints: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgentData?: { mobile?: boolean };
}
export type ProfileName = 'desktop' | 'mobile-low' | 'mobile-balanced';
export interface DeviceProfile {
  name: ProfileName;
  mobile: boolean;
  targetFps: number;
  maxDpr: number;
  minDpr: number;
  maxPixels: number;
  cascades: number;
  shadowSize: number;
  shadowFar: number;
  compactScale: number;
  treeNear: number;
  treeMid: number;
  particles: number;
  probeGrid: number;
  postScale: number;
}
const profiles: Record<ProfileName, DeviceProfile> = {
  desktop: { name: 'desktop', mobile: false, targetFps: 0, maxDpr: 1.5, minDpr: 1,
    maxPixels: Infinity, cascades: 4, shadowSize: 2048, shadowFar: 3200,
    compactScale: 1, treeNear: 150, treeMid: 460, particles: 131072, probeGrid: 256, postScale: 0.5 },
  'mobile-low': { name: 'mobile-low', mobile: true, targetFps: 30, maxDpr: 1, minDpr: 0.5,
    maxPixels: 720 * 1280, cascades: 1, shadowSize: 512, shadowFar: 50,
    compactScale: 0.125, treeNear: 24, treeMid: 90, particles: 1024, probeGrid: 64, postScale: 0.25 },
  'mobile-balanced': { name: 'mobile-balanced', mobile: true, targetFps: 30, maxDpr: 1.25, minDpr: 0.6,
    maxPixels: 1080 * 1440, cascades: 2, shadowSize: 1024, shadowFar: 100,
    compactScale: 0.25, treeNear: 40, treeMid: 140, particles: 4096, probeGrid: 96, postScale: 0.35 },
};
export function selectProfile(hints: DeviceHints, override?: string | null): DeviceProfile {
  if (override && Object.prototype.hasOwnProperty.call(profiles, override)) {
    return profiles[override as ProfileName];
  }
  const mobile = hints.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(hints.userAgent)
    || (/Macintosh/i.test(hints.userAgent) && hints.maxTouchPoints > 2);
  if (!mobile) return profiles.desktop;
  // Missing memory hints (notably iOS) must NOT default to a flagship budget.
  return (hints.deviceMemory ?? 4) >= 6 && (hints.hardwareConcurrency ?? 4) >= 6
    ? profiles['mobile-balanced'] : profiles['mobile-low'];
}
export const PROFILE = selectProfile(
  typeof navigator === 'undefined' ? { userAgent: '', maxTouchPoints: 0 } : navigator,
  typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('quality'),
);
export const PROFILING = !PROFILE.mobile || (typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('hud') === '1');
/** Bound the actual render-target pixel area, even on very large tablets. */
export function cappedDpr(width: number, height: number, requested: number, profile = PROFILE): number {
  const safe = Number.isFinite(requested) && requested > 0 ? requested : 1;
  return Math.max(0.1, Math.min(safe, profile.maxDpr,
    Math.sqrt(profile.maxPixels / Math.max(1, width * height))));
}
/** Effects that cost extra render-target round trips; keep sky, water and GI. */
export function effectExclusions(search: string = window.location.search, profile: DeviceProfile = PROFILE): Set<string> {
  const exclusions = new Set((new URLSearchParams(search).get('ablate') ?? '').split(','));
  if (profile.mobile) {
    for (const name of ['froxels', 'caustics', 'bounce', 'bloom', 'contact']) exclusions.add(name);
    if (profile.name === 'mobile-low') {
      exclusions.add('ao');
      exclusions.add('taa');
    }
  }
  return exclusions;
}
