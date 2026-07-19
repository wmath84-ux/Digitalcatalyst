import React, { useMemo, useState } from 'react';
import {
  CLEAN_NEUTRAL_DEVICE_SCOPES,
  CLEAN_NEUTRAL_PAGE_REGISTRY,
  normalizeCleanNeutralCustomizer,
  type CleanNeutralCustomizerSettings,
} from '../../utils/cleanNeutralCustomizer';
import {
  CLEAN_NEUTRAL_ICON_SLOT_REGISTRY,
  CLEAN_NEUTRAL_REGION_REGISTRY,
  DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER,
  PROFESSIONAL_ICON_LIBRARY,
  makeCleanNeutralIconTargetKey,
  makeCleanNeutralRegionTargetKey,
  normalizeCleanNeutralAdvancedCustomizer,
  type CleanNeutralAdvancedCustomizerSettings,
  type CleanNeutralIconOverride,
  type CleanNeutralIconSlotId,
  type CleanNeutralRegionId,
  type CleanNeutralRegionOverride,
  type ProfessionalIconName,
} from '../../utils/cleanNeutralAdvancedCustomizer';
import ProfessionalIcon from '../common/ProfessionalIcon';

interface Props {
  value?: CleanNeutralCustomizerSettings;
  onChange: (value: CleanNeutralCustomizerSettings) => void;
}

const pageGroups = ['Main pages', 'Learning', 'Reading', 'Home sections', 'Administration'] as const;

const CleanNeutralAdvancedStudio: React.FC<Props> = ({ value, onChange }) => {
  const normalized = useMemo(() => normalizeCleanNeutralCustomizer(value), [value]);
  const advanced = useMemo(
    () => normalizeCleanNeutralAdvancedCustomizer(normalized.advanced),
    [normalized.advanced],
  );
  const [activeTab, setActiveTab] = useState<'regions' | 'icons'>('regions');
  const [selectedPages, setSelectedPages] = useState<Set<string>>(() => new Set(['home']));
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(() => new Set(['desktop']));
  const [selectedRegions, setSelectedRegions] = useState<Set<CleanNeutralRegionId>>(() => new Set(['shell.page']));
  const [selectedIconSlot, setSelectedIconSlot] = useState<CleanNeutralIconSlotId>('nav.home');
  const [pageSearch, setPageSearch] = useState('');
  const [regionSearch, setRegionSearch] = useState('');
  const [iconSearch, setIconSearch] = useState('');

  const targetPairs = useMemo(
    () => Array.from(selectedPages).flatMap(pageId =>
      Array.from(selectedDevices).map(device => ({ pageId, device }))),
    [selectedDevices, selectedPages],
  );

  const writeAdvanced = (next: CleanNeutralAdvancedCustomizerSettings) => {
    onChange({
      ...normalized,
      advanced: normalizeCleanNeutralAdvancedCustomizer(next),
    });
  };

  const toggleSetValue = <T extends string>(current: Set<T>, valueItem: T): Set<T> => {
    const next = new Set(current);
    next.has(valueItem) ? next.delete(valueItem) : next.add(valueItem);
    return next;
  };

  const updateRegions = (patch: CleanNeutralRegionOverride) => {
    if (targetPairs.length === 0 || selectedRegions.size === 0) return;
    const regionTargets = { ...advanced.regionTargets };
    targetPairs.forEach(({ pageId, device }) => {
      selectedRegions.forEach(regionId => {
        const key = makeCleanNeutralRegionTargetKey(pageId, device, regionId);
        regionTargets[key] = { ...(regionTargets[key] || {}), ...patch };
      });
    });
    writeAdvanced({ ...advanced, regionTargets });
  };

  const resetRegions = () => {
    const regionTargets = { ...advanced.regionTargets };
    targetPairs.forEach(({ pageId, device }) => {
      selectedRegions.forEach(regionId => {
        delete regionTargets[makeCleanNeutralRegionTargetKey(pageId, device, regionId)];
      });
    });
    writeAdvanced({ ...advanced, regionTargets });
  };

  const updateIcon = (patch: CleanNeutralIconOverride) => {
    if (targetPairs.length === 0) return;
    const iconTargets = { ...advanced.iconTargets };
    targetPairs.forEach(({ pageId, device }) => {
      const key = makeCleanNeutralIconTargetKey(pageId, device, selectedIconSlot);
      iconTargets[key] = { ...(iconTargets[key] || {}), ...patch };
    });
    writeAdvanced({ ...advanced, iconTargets });
  };

  const resetIcon = () => {
    const iconTargets = { ...advanced.iconTargets };
    targetPairs.forEach(({ pageId, device }) => {
      delete iconTargets[makeCleanNeutralIconTargetKey(pageId, device, selectedIconSlot)];
    });
    writeAdvanced({ ...advanced, iconTargets });
  };

  const selectedIconValue = useMemo(() => {
    const first = targetPairs[0];
    if (!first) return {} as CleanNeutralIconOverride;
    return advanced.iconTargets[makeCleanNeutralIconTargetKey(first.pageId, first.device, selectedIconSlot)] || {};
  }, [advanced.iconTargets, selectedIconSlot, targetPairs]);

  const filteredPages = CLEAN_NEUTRAL_PAGE_REGISTRY.filter(page => {
    const search = pageSearch.trim().toLowerCase();
    return !search || page.label.toLowerCase().includes(search) || page.group.toLowerCase().includes(search);
  });

  const filteredRegions = CLEAN_NEUTRAL_REGION_REGISTRY.filter(region => {
    const search = regionSearch.trim().toLowerCase();
    return !search || region.label.toLowerCase().includes(search) || region.group.toLowerCase().includes(search);
  });

  const filteredIcons = PROFESSIONAL_ICON_LIBRARY.filter(icon =>
    icon.includes(iconSearch.trim().toLowerCase()));

  const selectedSlotDefinition = CLEAN_NEUTRAL_ICON_SLOT_REGISTRY.find(slot => slot.id === selectedIconSlot)!;
  const selectedIconName = selectedIconValue.name || selectedSlotDefinition.defaultIcon;

  return (
    <section data-clean-neutral-region="admin.content" className="mt-4 rounded-2xl border border-[#D4D4D4] bg-white p-4 sm:p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#737373]">Advanced region + icon studio</p>
        <h3 className="mt-1 text-xl font-black text-[#171717]">Control safe regions and professional icons</h3>
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#525252]">
          Values are allowlisted, validated and stored per page/device. No raw CSS, selectors, HTML, JavaScript or pasted SVG is accepted.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
        <aside className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[#737373]">Target pages</p>
          <input value={pageSearch} onChange={event => setPageSearch(event.target.value)} placeholder="Search pages…" className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-semibold" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedPages(new Set(CLEAN_NEUTRAL_PAGE_REGISTRY.map(page => page.id)))} className="rounded-lg border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-black">All Pages</button>
            <button type="button" onClick={() => setSelectedPages(new Set())} className="rounded-lg border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-black">Clear</button>
          </div>
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {pageGroups.map(group => {
              const pages = filteredPages.filter(page => page.group === group);
              if (!pages.length) return null;
              return (
                <div key={group}>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.15em] text-[#737373]">{group}</p>
                  {pages.map(page => (
                    <label key={page.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-[#262626] hover:bg-white">
                      <input type="checkbox" checked={selectedPages.has(page.id)} onChange={() => setSelectedPages(current => toggleSetValue(current, page.id))} />
                      {page.label}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs font-black uppercase tracking-[0.15em] text-[#737373]">Devices</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CLEAN_NEUTRAL_DEVICE_SCOPES.map(device => (
              <label key={device} className={`cursor-pointer rounded-lg border px-2 py-2 text-center text-xs font-black ${selectedDevices.has(device) ? 'border-[#171717] bg-[#171717] text-white' : 'border-[#D4D4D4] bg-white text-[#525252]'}`}>
                <input type="checkbox" className="sr-only" checked={selectedDevices.has(device)} onChange={() => setSelectedDevices(current => toggleSetValue(current, device))} />
                {device}
              </label>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-white p-2 text-[11px] font-bold text-[#525252]">{targetPairs.length} page/device targets selected</p>
        </aside>

        <div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] p-1">
            <button type="button" onClick={() => setActiveTab('regions')} className={`min-h-11 rounded-lg text-sm font-black ${activeTab === 'regions' ? 'bg-[#171717] text-white' : 'text-[#525252]'}`}>Region Layout</button>
            <button type="button" onClick={() => setActiveTab('icons')} className={`min-h-11 rounded-lg text-sm font-black ${activeTab === 'icons' ? 'bg-[#171717] text-white' : 'text-[#525252]'}`}>Icon Studio</button>
          </div>

          {activeTab === 'regions' ? (
            <div className="mt-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(14rem,0.65fr)_minmax(0,1.35fr)]">
                <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3">
                  <input value={regionSearch} onChange={event => setRegionSearch(event.target.value)} placeholder="Search regions…" className="h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-semibold" />
                  <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                    {filteredRegions.map(region => (
                      <label key={region.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold hover:bg-white">
                        <input type="checkbox" checked={selectedRegions.has(region.id)} onChange={() => setSelectedRegions(current => toggleSetValue(current, region.id))} />
                        <span><span className="block text-[#262626]">{region.label}</span><span className="text-[10px] text-[#737373]">{region.group}</span></span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['opacity', 'Opacity %', 0, 100, 100],
                    ['maxWidth', 'Maximum width', 160, 2400, 1200],
                    ['minHeight', 'Minimum height', 0, 1600, 0],
                    ['paddingX', 'Horizontal padding', 0, 96, 16],
                    ['paddingY', 'Vertical padding', 0, 96, 16],
                    ['marginTop', 'Top margin', -96, 240, 0],
                    ['marginBottom', 'Bottom margin', -96, 240, 0],
                    ['gap', 'Internal gap', 0, 96, 12],
                    ['fontSize', 'Font size', 9, 96, 16],
                    ['lineHeight', 'Line height', 1, 2.5, 1.5],
                    ['letterSpacing', 'Letter spacing', -2, 12, 0],
                    ['borderWidth', 'Border width', 0, 8, 1],
                    ['radius', 'Region radius', 0, 64, 14],
                  ].map(([field, label, min, max, fallback]) => (
                    <label key={String(field)} className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black text-[#262626]">
                      {String(label)}
                      <input type="number" min={Number(min)} max={Number(max)} step={field === 'lineHeight' || field === 'letterSpacing' ? 0.1 : 1} defaultValue={Number(fallback)} onChange={event => updateRegions({ [field]: Number(event.target.value) } as CleanNeutralRegionOverride)} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold" />
                    </label>
                  ))}

                  <label className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black">
                    Font family
                    <select defaultValue="inherit" onChange={event => updateRegions({ fontFamily: event.target.value as CleanNeutralRegionOverride['fontFamily'] })} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                      {['inherit', 'inter', 'lato', 'montserrat', 'roboto', 'merriweather', 'oswald'].map(valueItem => <option key={valueItem} value={valueItem}>{valueItem}</option>)}
                    </select>
                  </label>
                  <label className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black">
                    Font weight
                    <select defaultValue="700" onChange={event => updateRegions({ fontWeight: Number(event.target.value) as CleanNeutralRegionOverride['fontWeight'] })} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                      {[400, 500, 600, 700, 800, 900].map(valueItem => <option key={valueItem} value={valueItem}>{valueItem}</option>)}
                    </select>
                  </label>
                  <label className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black">
                    Border style
                    <select defaultValue="solid" onChange={event => updateRegions({ borderStyle: event.target.value as CleanNeutralRegionOverride['borderStyle'] })} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                      {['none', 'solid', 'dashed'].map(valueItem => <option key={valueItem} value={valueItem}>{valueItem}</option>)}
                    </select>
                  </label>
                  <label className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black">
                    Text alignment
                    <select defaultValue="inherit" onChange={event => updateRegions({ textAlign: event.target.value as CleanNeutralRegionOverride['textAlign'] })} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                      {['inherit', 'left', 'center', 'right'].map(valueItem => <option key={valueItem} value={valueItem}>{valueItem}</option>)}
                    </select>
                  </label>
                  <label className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3 text-xs font-black">
                    Overflow
                    <select defaultValue="inherit" onChange={event => updateRegions({ overflow: event.target.value as CleanNeutralRegionOverride['overflow'] })} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                      {['inherit', 'visible', 'hidden', 'auto'].map(valueItem => <option key={valueItem} value={valueItem}>{valueItem}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <button type="button" onClick={resetRegions} className="mt-3 rounded-xl border border-[#D4D4D4] bg-[#F7F7F8] px-4 py-3 text-sm font-black">Reset selected regions to inherit</button>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
              <div className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3">
                <input value={iconSearch} onChange={event => setIconSearch(event.target.value)} placeholder="Search professional icons…" className="h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-semibold" />
                <div className="mt-3 max-h-72 grid grid-cols-3 gap-2 overflow-y-auto">
                  {filteredIcons.map(icon => (
                    <button key={icon} type="button" onClick={() => updateIcon({ name: icon })} className={`flex min-h-16 flex-col items-center justify-center rounded-lg border p-2 text-[10px] font-bold ${selectedIconName === icon ? 'border-[#171717] bg-[#171717] text-white' : 'border-[#D4D4D4] bg-white text-[#525252]'}`}>
                      <ProfessionalIcon slot={selectedIconSlot} fallbackName={icon} label={icon} size={22} ignoreRuntime />
                      <span className="mt-1 truncate">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-[#262626]">
                  Icon slot
                  <select value={selectedIconSlot} onChange={event => setSelectedIconSlot(event.target.value as CleanNeutralIconSlotId)} className="mt-2 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">
                    {CLEAN_NEUTRAL_ICON_SLOT_REGISTRY.map(slot => <option key={slot.id} value={slot.id}>{slot.group} — {slot.label}</option>)}
                  </select>
                </label>

                <div className="mt-3 rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#737373]">Preview</p>
                  <div className="mt-4 flex min-h-24 items-center justify-center rounded-xl border border-[#D4D4D4] bg-white">
                    <ProfessionalIcon slot={selectedIconSlot} fallbackName={selectedIconName} label={selectedIconValue.label || selectedSlotDefinition.label} defaultDisplayMode="icon-with-text" size={selectedIconValue.size || 28} />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black">Display mode<select value={selectedIconValue.displayMode || 'icon-with-text'} onChange={event => updateIcon({ displayMode: event.target.value as CleanNeutralIconOverride['displayMode'] })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold"><option value="icon-only">Icon only</option><option value="icon-with-text">Icon with text</option></select></label>
                  <label className="text-xs font-black">Position<select value={selectedIconValue.position || 'top'} onChange={event => updateIcon({ position: event.target.value as CleanNeutralIconOverride['position'] })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold">{['top', 'bottom', 'left', 'right'].map(valueItem => <option key={valueItem}>{valueItem}</option>)}</select></label>
                  <label className="text-xs font-black">Label<input value={selectedIconValue.label || ''} maxLength={60} onChange={event => updateIcon({ label: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold" /></label>
                  <label className="text-xs font-black">Colour<input type="color" value={selectedIconValue.color || '#262626'} onChange={event => updateIcon({ color: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white p-1" /></label>
                  <label className="text-xs font-black">Size<input type="number" min="12" max="64" value={selectedIconValue.size || 24} onChange={event => updateIcon({ size: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold" /></label>
                  <label className="text-xs font-black">Stroke width<input type="number" min="1" max="3" step="0.1" value={selectedIconValue.strokeWidth || 1.8} onChange={event => updateIcon({ strokeWidth: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold" /></label>
                  <label className="text-xs font-black">Icon/text gap<input type="number" min="0" max="32" value={selectedIconValue.gap ?? 6} onChange={event => updateIcon({ gap: Number(event.target.value) })} className="mt-1 h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold" /></label>
                </div>
                <button type="button" onClick={resetIcon} className="mt-3 rounded-xl border border-[#D4D4D4] bg-[#F7F7F8] px-4 py-3 text-sm font-black">Reset selected icon to inherit</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CleanNeutralAdvancedStudio;

export const cleanNeutralAdvancedRegionCount = CLEAN_NEUTRAL_REGION_REGISTRY.length;
export const cleanNeutralAdvancedIconSlotCount = CLEAN_NEUTRAL_ICON_SLOT_REGISTRY.length;
export const cleanNeutralProfessionalIconCount = PROFESSIONAL_ICON_LIBRARY.length;
export const cleanNeutralAdvancedDefaults = DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER;
