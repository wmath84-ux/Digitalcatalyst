import React, { useMemo, useState } from 'react';
import {
  CLEAN_NEUTRAL_DEVICE_SCOPES,
  CLEAN_NEUTRAL_PAGE_REGISTRY,
  CLEAN_NEUTRAL_RULE_IDS,
  DEFAULT_CLEAN_NEUTRAL_RULE_VALUES,
  makeCleanNeutralTargetKey,
  normalizeCleanNeutralCustomizer,
  resolveCleanNeutralRuleValues,
  splitCleanNeutralTargetKey,
  type CleanNeutralCustomizerSettings,
  type CleanNeutralDeviceScope,
  type CleanNeutralPageId,
  type CleanNeutralRuleId,
  type CleanNeutralRuleValues,
  type CleanNeutralTargetOverride,
} from '../../utils/cleanNeutralCustomizer';

type RuleControlKind = 'color' | 'number' | 'select';

interface RuleDefinition {
  id: CleanNeutralRuleId;
  label: string;
  description: string;
  group: 'Colours' | 'Buttons & states' | 'Shape & motion';
  kind: RuleControlKind;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
}

interface CleanNeutralDesignStudioProps {
  value?: CleanNeutralCustomizerSettings;
  onChange: (value: CleanNeutralCustomizerSettings) => void;
}

const RULE_DEFINITIONS: RuleDefinition[] = [
  { id: 'pageBackground', label: 'Page background', description: 'Outer page or workspace canvas.', group: 'Colours', kind: 'color' },
  { id: 'sectionBackground', label: 'Section background', description: 'Secondary bands and grouped page areas.', group: 'Colours', kind: 'color' },
  { id: 'surfaceBackground', label: 'Card / surface background', description: 'Cards, panels, dialogs and drawers.', group: 'Colours', kind: 'color' },
  { id: 'headingColor', label: 'Heading colour', description: 'Titles, strong labels and major headings.', group: 'Colours', kind: 'color' },
  { id: 'bodyTextColor', label: 'Body text colour', description: 'Default body text inherited by the page.', group: 'Colours', kind: 'color' },
  { id: 'secondaryTextColor', label: 'Secondary text colour', description: 'Descriptions, paragraphs and supporting copy.', group: 'Colours', kind: 'color' },
  { id: 'mutedTextColor', label: 'Muted text colour', description: 'Metadata, helper text and placeholders.', group: 'Colours', kind: 'color' },
  { id: 'iconColor', label: 'Default icon colour', description: 'Standalone SVG icons; button icons inherit button text.', group: 'Colours', kind: 'color' },
  { id: 'primaryButtonBackground', label: 'Primary button background', description: 'Main action button surface.', group: 'Buttons & states', kind: 'color' },
  { id: 'primaryButtonText', label: 'Primary button text', description: 'Text and icons inside primary actions.', group: 'Buttons & states', kind: 'color' },
  { id: 'secondaryButtonBackground', label: 'Secondary button background', description: 'Neutral and secondary controls.', group: 'Buttons & states', kind: 'color' },
  { id: 'secondaryButtonText', label: 'Secondary button text', description: 'Text and icons inside secondary controls.', group: 'Buttons & states', kind: 'color' },
  { id: 'activeStateBackground', label: 'Active state background', description: 'Selected tabs, routes and active navigation.', group: 'Buttons & states', kind: 'color' },
  { id: 'activeStateText', label: 'Active state text', description: 'Text and icons in selected neutral states.', group: 'Buttons & states', kind: 'color' },
  { id: 'inactiveStateText', label: 'Inactive state text', description: 'Inactive navigation and disabled-style labels.', group: 'Buttons & states', kind: 'color' },
  { id: 'borderColor', label: 'Border colour', description: 'Cards, controls and neutral separators.', group: 'Buttons & states', kind: 'color' },
  { id: 'controlRadius', label: 'Control radius', description: 'Buttons, fields and compact controls in pixels.', group: 'Shape & motion', kind: 'number', min: 0, max: 48 },
  { id: 'cardRadius', label: 'Card radius', description: 'Cards, panels, drawers and dialogs in pixels.', group: 'Shape & motion', kind: 'number', min: 0, max: 48 },
  {
    id: 'shadowIntensity',
    label: 'Shadow intensity',
    description: 'Elevation used by cards and floating layers.',
    group: 'Shape & motion',
    kind: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'subtle', label: 'Subtle' },
      { value: 'medium', label: 'Medium' },
      { value: 'strong', label: 'Strong' },
    ],
  },
  {
    id: 'motionIntensity',
    label: 'Motion intensity',
    description: 'Transition speed without allowing unsafe custom animation.',
    group: 'Shape & motion',
    kind: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'reduced', label: 'Reduced' },
      { value: 'standard', label: 'Standard' },
    ],
  },
];

const pageGroups = ['Main pages', 'Learning', 'Reading', 'Home sections', 'Administration'] as const;

const DeviceIcon: React.FC<{ device: CleanNeutralDeviceScope; className?: string }> = ({ device, className = 'h-4 w-4' }) => {
  if (device === 'mobile') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="7.5" y="2.5" width="9" height="19" rx="2" />
        <path d="M10 5h4M11 18.5h2" />
      </svg>
    );
  }

  if (device === 'tablet') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4.5" y="2.5" width="15" height="19" rx="2" />
        <path d="M10.5 18.5h3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="3.5" width="19" height="13" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </svg>
  );
};

const AllPagesIcon: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const labelForDevice = (device: CleanNeutralDeviceScope): string =>
  device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';

const CleanNeutralDesignStudio: React.FC<CleanNeutralDesignStudioProps> = ({ value, onChange }) => {
  const normalized = useMemo(() => normalizeCleanNeutralCustomizer(value), [value]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(
    () => new Set([makeCleanNeutralTargetKey('home', 'desktop')]),
  );

  const allTargetKeys = useMemo(
    () => CLEAN_NEUTRAL_PAGE_REGISTRY.flatMap(page =>
      CLEAN_NEUTRAL_DEVICE_SCOPES.map(device => makeCleanNeutralTargetKey(page.id, device))),
    [],
  );

  const selectedTargetList = useMemo(
    () => (Array.from(selectedTargets) as string[]).filter(key => Boolean(splitCleanNeutralTargetKey(key))),
    [selectedTargets],
  );

  const filteredPages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? CLEAN_NEUTRAL_PAGE_REGISTRY.filter(page =>
          page.label.toLowerCase().includes(query) ||
          page.id.toLowerCase().includes(query) ||
          page.group.toLowerCase().includes(query))
      : CLEAN_NEUTRAL_PAGE_REGISTRY;
  }, [search]);

  const toggleCollection = (keys: string[]) => {
    setSelectedTargets(current => {
      const next = new Set(current);
      const shouldSelect = keys.some(key => !next.has(key));
      keys.forEach(key => shouldSelect ? next.add(key) : next.delete(key));
      return next;
    });
  };

  const setRuleForSelectedTargets = (ruleId: CleanNeutralRuleId, nextValue: unknown) => {
    if (selectedTargetList.length === 0) return;

    const targets: Record<string, CleanNeutralTargetOverride> = { ...normalized.targets };
    selectedTargetList.forEach(targetKey => {
      targets[targetKey] = {
        ...(targets[targetKey] || {}),
        [ruleId]: nextValue,
      };
    });

    onChange(normalizeCleanNeutralCustomizer({ version: 1, targets }));
  };

  const resetSelectedTargets = () => {
    if (selectedTargetList.length === 0) return;
    const targets = { ...normalized.targets };
    selectedTargetList.forEach(targetKey => delete targets[targetKey]);
    onChange({ version: 1, targets });
  };

  const readRuleState = (ruleId: CleanNeutralRuleId): { value: CleanNeutralRuleValues[CleanNeutralRuleId]; mixed: boolean } => {
    const values = selectedTargetList.map(targetKey => {
      const target = splitCleanNeutralTargetKey(targetKey);
      if (!target) return DEFAULT_CLEAN_NEUTRAL_RULE_VALUES[ruleId];
      return resolveCleanNeutralRuleValues(normalized, target.pageId, target.device)[ruleId];
    });

    const first = values[0] ?? DEFAULT_CLEAN_NEUTRAL_RULE_VALUES[ruleId];
    return {
      value: first,
      mixed: values.some(valueItem => String(valueItem) !== String(first)),
    };
  };

  const renderRuleControl = (rule: RuleDefinition) => {
    const state = readRuleState(rule.id);
    const disabled = selectedTargetList.length === 0;

    if (rule.kind === 'color') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(state.value)}
            disabled={disabled}
            onChange={event => setRuleForSelectedTargets(rule.id, event.target.value)}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-[#D4D4D4] bg-white p-1 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`${rule.label} colour`}
          />
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[#E5E5E5] bg-[#F7F7F8] px-3 py-2.5 text-xs font-bold text-[#262626]">
            {String(state.value)}
          </code>
          {state.mixed && <span className="rounded-full bg-[#EDEDED] px-2 py-1 text-[10px] font-black text-[#525252]">Mixed</span>}
        </div>
      );
    }

    if (rule.kind === 'number') {
      const numericValue = Number(state.value);
      return (
        <div className="grid grid-cols-[1fr_5rem] items-center gap-2">
          <input
            type="range"
            min={rule.min}
            max={rule.max}
            value={numericValue}
            disabled={disabled}
            onChange={event => setRuleForSelectedTargets(rule.id, Number(event.target.value))}
            className="w-full"
          />
          <div className="relative">
            <input
              type="number"
              min={rule.min}
              max={rule.max}
              value={numericValue}
              disabled={disabled}
              onChange={event => setRuleForSelectedTargets(rule.id, Number(event.target.value))}
              className="h-11 w-full rounded-lg border border-[#D4D4D4] bg-white px-2 pr-7 text-sm font-bold text-[#171717]"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#737373]">px</span>
          </div>
          {state.mixed && <span className="col-span-2 text-right text-[10px] font-black text-[#737373]">Mixed values — editing updates every selected target</span>}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <select
          value={String(state.value)}
          disabled={disabled}
          onChange={event => setRuleForSelectedTargets(rule.id, event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-[#D4D4D4] bg-white px-3 text-sm font-bold text-[#171717]"
        >
          {(rule.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {state.mixed && <span className="rounded-full bg-[#EDEDED] px-2 py-1 text-[10px] font-black text-[#525252]">Mixed</span>}
      </div>
    );
  };

  return (
    <section data-clean-neutral-admin-studio className="mt-4 rounded-2xl border border-[#D4D4D4] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#737373]">Page + device design studio</p>
          <h3 className="mt-1 text-xl font-black text-[#171717]">Customize the 20 Clean Neutral rules</h3>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#525252]">
            Select one or many page/device targets. Every change below is applied to all selected targets together and remains inherited until you create an override.
          </p>
        </div>
        <button
          type="button"
          onClick={resetSelectedTargets}
          disabled={selectedTargetList.length === 0}
          className="min-h-11 shrink-0 rounded-xl border border-[#D4D4D4] bg-[#F7F7F8] px-4 py-2 text-sm font-black text-[#171717] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Reset selected to global
        </button>
      </div>

      <div className="relative mt-5">
        <button
          type="button"
          aria-expanded={isSelectorOpen}
          onClick={() => setIsSelectorOpen(open => !open)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#D4D4D4] bg-[#F7F7F8] px-4 text-left"
        >
          <span>
            <span className="block text-xs font-black uppercase tracking-[0.15em] text-[#737373]">Pages & devices</span>
            <span className="mt-0.5 block text-sm font-black text-[#171717]">{selectedTargetList.length} of {allTargetKeys.length} targets selected</span>
          </span>
          <span className="text-lg font-black text-[#525252]">{isSelectorOpen ? '−' : '+'}</span>
        </button>

        {isSelectorOpen && (
          <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-[80] max-h-[min(70vh,44rem)] overflow-y-auto rounded-2xl border border-[#D4D4D4] bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] p-3 text-sm font-black text-[#171717]">
                <input
                  type="checkbox"
                  checked={allTargetKeys.every(key => selectedTargets.has(key))}
                  onChange={() => toggleCollection(allTargetKeys)}
                  className="h-4 w-4"
                />
                <AllPagesIcon />
                All Pages
              </label>
              {CLEAN_NEUTRAL_DEVICE_SCOPES.map(device => {
                const keys = CLEAN_NEUTRAL_PAGE_REGISTRY.map(page => makeCleanNeutralTargetKey(page.id, device));
                return (
                  <label key={device} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] p-3 text-sm font-black text-[#171717]">
                    <input
                      type="checkbox"
                      checked={keys.every(key => selectedTargets.has(key))}
                      onChange={() => toggleCollection(keys)}
                      className="h-4 w-4"
                    />
                    <DeviceIcon device={device} />
                    All {labelForDevice(device)}
                  </label>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search pages, sections or workspaces…"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#D4D4D4] bg-white px-3 text-sm font-semibold text-[#171717] placeholder:text-[#737373]"
              />
              <button type="button" onClick={() => setSelectedTargets(new Set())} className="rounded-xl border border-[#D4D4D4] px-3 text-xs font-black text-[#525252]">Clear</button>
            </div>

            <div className="mt-4 space-y-4">
              {pageGroups.map(group => {
                const pages = filteredPages.filter(page => page.group === group);
                if (pages.length === 0) return null;

                return (
                  <div key={group}>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#737373]">{group}</p>
                    <div className="space-y-2">
                      {pages.map(page => {
                        const pageKeys = CLEAN_NEUTRAL_DEVICE_SCOPES.map(device => makeCleanNeutralTargetKey(page.id, device));
                        const selectedCount = pageKeys.filter(key => selectedTargets.has(key)).length;

                        return (
                          <div key={page.id} className="grid gap-2 rounded-xl border border-[#E5E5E5] bg-white p-3 lg:grid-cols-[minmax(12rem,1fr)_auto] lg:items-center">
                            <label className="flex cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedCount === pageKeys.length}
                                onChange={() => toggleCollection(pageKeys)}
                                className="h-4 w-4"
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-black text-[#171717]">{page.label}</span>
                                <span className="block text-[10px] font-bold text-[#737373]">{page.id} · {selectedCount}/3 selected</span>
                              </span>
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {CLEAN_NEUTRAL_DEVICE_SCOPES.map(device => {
                                const targetKey = makeCleanNeutralTargetKey(page.id, device);
                                const checked = selectedTargets.has(targetKey);
                                return (
                                  <label key={device} title={`${page.label} — ${labelForDevice(device)}`} className={`flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 text-[10px] font-black ${checked ? 'border-[#171717] bg-[#171717] text-white' : 'border-[#D4D4D4] bg-[#F7F7F8] text-[#525252]'}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCollection([targetKey])}
                                      className="sr-only"
                                    />
                                    <DeviceIcon device={device} className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">{labelForDevice(device)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {selectedTargetList.slice(0, 8).map(targetKey => {
          const target = splitCleanNeutralTargetKey(targetKey);
          if (!target) return null;
          const page = CLEAN_NEUTRAL_PAGE_REGISTRY.find(item => item.id === target.pageId);
          return (
            <span key={targetKey} className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D4] bg-[#F7F7F8] px-3 py-1.5 text-[10px] font-black text-[#525252]">
              <DeviceIcon device={target.device} className="h-3.5 w-3.5" />
              {page?.label || target.pageId} · {labelForDevice(target.device)}
            </span>
          );
        })}
        {selectedTargetList.length > 8 && <span className="rounded-full bg-[#EDEDED] px-3 py-1.5 text-[10px] font-black text-[#525252]">+{selectedTargetList.length - 8} more</span>}
      </div>

      {selectedTargetList.length === 0 && (
        <p className="mt-4 rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] p-3 text-sm font-bold text-[#525252]">
          Select at least one page/device target before editing rules.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {(['Colours', 'Buttons & states', 'Shape & motion'] as const).map(group => (
          <div key={group}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-base font-black text-[#171717]">{group}</h4>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#737373]">
                {RULE_DEFINITIONS.filter(rule => rule.group === group).length} rules
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {RULE_DEFINITIONS.filter(rule => rule.group === group).map(rule => (
                <div key={rule.id} className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-3">
                  <div className="mb-3">
                    <label className="text-sm font-black text-[#171717]">{rule.label}</label>
                    <p className="mt-0.5 text-xs font-semibold leading-5 text-[#737373]">{rule.description}</p>
                  </div>
                  {renderRuleControl(rule)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-[#E5E5E5] bg-[#F7F7F8] p-3 text-xs font-semibold leading-5 text-[#525252]">
        Stored values are validated and sparse: unedited targets inherit the audited global Clean Neutral defaults. Raw CSS, HTML and arbitrary selectors are not accepted.
      </div>
    </section>
  );
};

export default CleanNeutralDesignStudio;

export const cleanNeutralDesignStudioRuleCount = CLEAN_NEUTRAL_RULE_IDS.length;
