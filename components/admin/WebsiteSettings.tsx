
import React, { useState, useEffect } from 'react';
import { WebsiteSettings, HomepageSection, Announcement, ProductWithRating, ProfileMilestoneConfig, ProfileStreakConfig, ProfileMilestoneMetric, ProfileStreakMetric } from '../../App';
import { ServiceItem } from '../Services';
import { FaqItem } from '../Faq';
import { UpcomingFeatureItem } from '../UpcomingFeatures';
import { defaultDockStyle, dockCustomizationItems } from '../BottomGlassDock';
import PremiumImageUrlInput from '../common/PremiumImageUrlInput';
import CleanNeutralDesignStudio from './CleanNeutralDesignStudio';
import CleanNeutralAdvancedStudio from './CleanNeutralAdvancedStudio';
import {
    MembershipMessage,
    normalizeSubscriptionFeatures,
    normalizeSubscriptionPageContent,
    normalizeSubscriptionPlans,
    SubscriptionFeature,
    SubscriptionPageContent,
    SubscriptionPlanConfig,
} from '../../utils/subscriptionAccess';

const sectionNames: Record<HomepageSection['id'], string> = {
    hero: 'Hero Section',
    purchased: 'My Purchases',
    topRated: 'Top Rated Products',
    allProducts: 'All Products Showcase',
    services: 'Services Section',
    about: 'About Us Section',
    trust: 'Trust Badges',
    faq: 'FAQ Section',
    upcoming: 'Upcoming Features',
    news: 'Latest News',
};

const TabButton: React.FC<{ label: string, isActive: boolean, onClick: () => void }> = ({ label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`border-b-2 px-4 py-2.5 text-sm font-black whitespace-nowrap transition-colors ${
            isActive ? 'border-blue-600 bg-white text-blue-700' : 'border-transparent bg-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'
        }`}
    >
        {label}
    </button>
);

const FormRow: React.FC<{ label: string, children: React.ReactNode, description?: string }> = ({ label, children, description }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start py-4 border-b">
        <div className="md:col-span-1">
            <label className="font-semibold text-gray-700">{label}</label>
            {description && <p className="text-xs text-slate-600 mt-1">{description}</p>}
        </div>
        <div className="md:col-span-2">{children}</div>
    </div>
);

// CRUD component for Services
const ServiceManagement: React.FC<{ services: ServiceItem[], onUpdate: (services: ServiceItem[]) => void }> = ({ services, onUpdate }) => {
    const [editing, setEditing] = useState<ServiceItem | null>(null);
    const handleSave = (service: ServiceItem) => {
        if (service.id) {
            onUpdate(services.map(s => s.id === service.id ? service : s));
        } else {
            onUpdate([...services, { ...service, id: Date.now() }]);
        }
        setEditing(null);
    };
    const handleDelete = (id: number) => onUpdate(services.filter(s => s.id !== id));

    return (
        <div>
            {editing && <ServiceFormModal service={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
            <button onClick={() => setEditing({ id: 0, title: '', description: '' })} className="mb-4 bg-green-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">+ Add New Service</button>
            <div className="space-y-2">
                {services.map(service => (
                    <div key={service.id} className="flex justify-between items-center p-3 bg-slate-100/80 rounded-lg border">
                        <div>
                            <p className="font-bold">{service.title}</p>
                            <p className="text-sm text-slate-600">{service.description}</p>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => setEditing(service)} className="text-blue-600 font-semibold text-sm">Edit</button>
                            <button onClick={() => handleDelete(service.id)} className="text-red-600 font-semibold text-sm">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const ServiceFormModal: React.FC<{ service: ServiceItem, onSave: (s: ServiceItem) => void, onCancel: () => void }> = ({ service, onSave, onCancel }) => {
    const [form, setForm] = useState(service);
    return (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-lg p-6 w-full max-w-md">
                <h3 className="font-bold text-lg mb-4">{service.id ? 'Edit' : 'Add'} Service</h3>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title" className="w-full p-2 border rounded mb-2" />
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full p-2 border rounded mb-4" rows={3}></textarea>
                <div className="flex justify-end space-x-2">
                    <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(form)} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg">Save</button>
                </div>
            </div>
        </div>
    );
};

// CRUD component for FAQs
const FaqManagement: React.FC<{ faqs: FaqItem[], onUpdate: (faqs: FaqItem[]) => void }> = ({ faqs, onUpdate }) => {
    const [editing, setEditing] = useState<FaqItem | null>(null);
    const handleSave = (faq: FaqItem) => {
        if (faq.id) {
            onUpdate(faqs.map(f => f.id === faq.id ? faq : f));
        } else {
            onUpdate([...faqs, { ...faq, id: Date.now() }]);
        }
        setEditing(null);
    };
    const handleDelete = (id: number) => onUpdate(faqs.filter(f => f.id !== id));

    return (
        <div>
            {editing && <FaqFormModal faq={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
            <button onClick={() => setEditing({ id: 0, question: '', answer: '' })} className="mb-4 bg-green-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">+ Add New FAQ</button>
            <div className="space-y-2">
                {faqs.map(faq => (
                    <div key={faq.id} className="flex justify-between items-start p-3 bg-slate-100/80 rounded-lg border">
                        <div className="flex-1">
                            <p className="font-bold">{faq.question}</p>
                            <p className="text-sm text-slate-600 mt-1">{faq.answer}</p>
                        </div>
                        <div className="space-x-2 flex-shrink-0 ml-4">
                            <button onClick={() => setEditing(faq)} className="text-blue-600 font-semibold text-sm">Edit</button>
                            <button onClick={() => handleDelete(faq.id)} className="text-red-600 font-semibold text-sm">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const FaqFormModal: React.FC<{ faq: FaqItem, onSave: (f: FaqItem) => void, onCancel: () => void }> = ({ faq, onSave, onCancel }) => {
    const [form, setForm] = useState(faq);
    return (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-lg p-6 w-full max-w-md">
                <h3 className="font-bold text-lg mb-4">{faq.id ? 'Edit' : 'Add'} FAQ</h3>
                <input value={form.question} onChange={e => setForm({...form, question: e.target.value})} placeholder="Question" className="w-full p-2 border rounded mb-2" />
                <textarea value={form.answer} onChange={e => setForm({...form, answer: e.target.value})} placeholder="Answer" className="w-full p-2 border rounded mb-4" rows={4}></textarea>
                <div className="flex justify-end space-x-2">
                    <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(form)} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg">Save</button>
                </div>
            </div>
        </div>
    );
};

// CRUD component for Upcoming Features
const UpcomingFeatureManagement: React.FC<{ features: UpcomingFeatureItem[], onUpdate: (features: UpcomingFeatureItem[]) => void }> = ({ features, onUpdate }) => {
    const [editing, setEditing] = useState<UpcomingFeatureItem | null>(null);
    const handleSave = (feature: UpcomingFeatureItem) => {
        if (feature.id) {
            onUpdate(features.map(f => f.id === feature.id ? feature : f));
        } else {
            onUpdate([...features, { ...feature, id: Date.now() }]);
        }
        setEditing(null);
    };
    const handleDelete = (id: number) => onUpdate(features.filter(f => f.id !== id));

    return (
        <div>
            {editing && <UpcomingFeatureFormModal feature={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
            <button onClick={() => setEditing({ id: 0, title: '', description: '', status: 'Coming Soon', icon: 'rocket' })} className="mb-4 bg-green-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">+ Add New Feature</button>
            <div className="space-y-2">
                {features.map(feature => (
                    <div key={feature.id} className="flex justify-between items-start p-3 bg-slate-100/80 rounded-lg border">
                        <div className="flex-1">
                            <p className="font-bold">{feature.title} <span className="text-xs font-semibold bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full ml-2">{feature.status}</span></p>
                            <p className="text-sm text-slate-600 mt-1">{feature.description}</p>
                            <p className="text-xs text-slate-600 mt-1">Icon: {feature.icon}</p>
                        </div>
                        <div className="space-x-2 flex-shrink-0 ml-4">
                            <button onClick={() => setEditing(feature)} className="text-blue-600 font-semibold text-sm">Edit</button>
                            <button onClick={() => handleDelete(feature.id)} className="text-red-600 font-semibold text-sm">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const UpcomingFeatureFormModal: React.FC<{ feature: UpcomingFeatureItem, onSave: (f: UpcomingFeatureItem) => void, onCancel: () => void }> = ({ feature, onSave, onCancel }) => {
    const [form, setForm] = useState(feature);
    return (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-lg p-6 w-full max-w-md">
                <h3 className="font-bold text-lg mb-4">{feature.id ? 'Edit' : 'Add'} Feature</h3>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title" className="w-full p-2 border rounded mb-2" />
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Description" className="w-full p-2 border rounded mb-2" rows={3}></textarea>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value as UpcomingFeatureItem['status']})} className="w-full p-2 border rounded mb-2">
                    <option value="Coming Soon">Coming Soon</option>
                    <option value="In Development">In Development</option>
                    <option value="Beta">Beta</option>
                </select>
                 <input value={form.icon} onChange={e => setForm({...form, icon: e.target.value})} placeholder="Icon name (e.g., rocket)" className="w-full p-2 border rounded mb-4" />
                <div className="flex justify-end space-x-2">
                    <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(form)} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg">Save</button>
                </div>
            </div>
        </div>
    );
};


// CRUD component for Announcements
const AnnouncementManagement: React.FC<{ announcements: Announcement[], onUpdate: (announcements: Announcement[]) => void }> = ({ announcements, onUpdate }) => {
    const [editing, setEditing] = useState<Announcement | null>(null);
    const handleSave = (announcement: Announcement) => {
        if (announcement.id) {
            onUpdate(announcements.map(a => a.id === announcement.id ? announcement : a));
        } else {
            onUpdate([...announcements, { ...announcement, id: Date.now() }]);
        }
        setEditing(null);
    };
    const handleDelete = (id: number) => onUpdate(announcements.filter(a => a.id !== id));

    return (
        <div>
            {editing && <AnnouncementFormModal announcement={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
            <button onClick={() => setEditing({ id: 0, title: '', date: new Date().toISOString().split('T')[0], content: '' })} className="mb-4 bg-green-500 text-white font-semibold px-4 py-2 rounded-lg text-sm">+ Add New Announcement</button>
            <div className="space-y-2">
                {announcements.map(announcement => (
                    <div key={announcement.id} className="flex justify-between items-start p-3 bg-slate-100/80 rounded-lg border">
                        <div className="flex-1">
                            <p className="font-bold">{announcement.title} <span className="text-xs font-normal text-slate-600 ml-2">{new Date(announcement.date).toLocaleDateString()}</span></p>
                            <p className="text-sm text-slate-600 mt-1">{announcement.content}</p>
                        </div>
                        <div className="space-x-2 flex-shrink-0 ml-4">
                            <button onClick={() => setEditing(announcement)} className="text-blue-600 font-semibold text-sm">Edit</button>
                            <button onClick={() => handleDelete(announcement.id)} className="text-red-600 font-semibold text-sm">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const AnnouncementFormModal: React.FC<{ announcement: Announcement, onSave: (a: Announcement) => void, onCancel: () => void }> = ({ announcement, onSave, onCancel }) => {
    const [form, setForm] = useState(announcement);
    return (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center p-4">
            <div className="bg-white/80 backdrop-blur-xl rounded-lg p-6 w-full max-w-md">
                <h3 className="font-bold text-lg mb-4">{announcement.id ? 'Edit' : 'Add'} Announcement</h3>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Title" className="w-full p-2 border rounded mb-2" />
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-2 border rounded mb-2" />
                <textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Content" className="w-full p-2 border rounded mb-4" rows={5}></textarea>
                <div className="flex justify-end space-x-2">
                    <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(form)} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg">Save</button>
                </div>
            </div>
        </div>
    );
};


interface WebsiteSettingsProps {
    settings: WebsiteSettings;
    products?: ProductWithRating[];
    onSettingsChange: (settings: WebsiteSettings) => Promise<boolean>;
}

type EditableSubscriptionPlan = SubscriptionPlanConfig;
type EditableReward = { id: string; title: string; cost: number; };
const streakMetricOptions: ProfileStreakMetric[] = ['dailyLogin', 'studyMinutes', 'watchMinutes', 'pdfsRead', 'coursesOwned', 'completedCourses', 'quizWins', 'articlesRead', 'lifetimeCoins', 'coinTransactions', 'milestonesClaimed', 'badgesUnlocked'];
const milestoneMetricOptions: ProfileMilestoneMetric[] = ['lifetimeCoins', 'studyMinutes', 'watchMinutes', 'coursesOwned', 'completedCourses', 'quizWins', 'articlesRead', 'pdfsRead', 'streakClaims', 'badgesUnlocked'];
const metricLabels: Record<string, string> = {
    dailyLogin: 'Daily login',
    studyMinutes: 'Valid study minutes',
    watchMinutes: 'Valid YouTube watch minutes',
    pdfsRead: 'PDF/docs read count',
    coursesOwned: 'Owned courses',
    completedCourses: 'Completed courses',
    quizWins: 'Completed quiz rewards',
    articlesRead: 'Articles read',
    lifetimeCoins: 'Lifetime earned coins',
    coinTransactions: 'Coin transaction count',
    milestonesClaimed: 'Milestones claimed',
    badgesUnlocked: 'Badges unlocked',
    streakClaims: 'Daily streak claims',
};
const getRewardStatus = (reward: { active?: boolean; draft?: boolean; archived?: boolean }) => reward.archived ? 'Archived' : reward.draft ? 'Draft' : reward.active === false ? 'Disabled' : 'Active';
const statusClass = (status: string) => status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Draft' ? 'bg-amber-100 text-amber-700' : status === 'Archived' ? 'bg-slate-200 text-slate-600' : 'bg-rose-100 text-rose-700';




type WebsiteSettingsTab = 'theme' | 'layout' | 'content' | 'subscriptions' | 'reading' | 'profile' | 'community' | 'dock' | 'announcements' | 'services' | 'faq' | 'upcoming' | 'features' | 'animations';
const WEBSITE_SETTINGS_TAB_KEY = 'eduvora.storeConfigTab.v1';
const WEBSITE_SETTINGS_TABS: WebsiteSettingsTab[] = ['theme', 'layout', 'content', 'subscriptions', 'reading', 'profile', 'community', 'dock', 'announcements', 'services', 'faq', 'upcoming', 'features', 'animations'];

const readInitialWebsiteSettingsTab = (): WebsiteSettingsTab => {
    if (typeof window === 'undefined') return 'theme';
    try {
        const stored = window.sessionStorage.getItem(WEBSITE_SETTINGS_TAB_KEY) as WebsiteSettingsTab | null;
        return stored && WEBSITE_SETTINGS_TABS.includes(stored) ? stored : 'theme';
    } catch {
        return 'theme';
    }
};

const WebsiteSettingsComponent: React.FC<WebsiteSettingsProps> = ({ settings, products = [], onSettingsChange }) => {
    const [activeTab, setActiveTab] = useState<WebsiteSettingsTab>(() => readInitialWebsiteSettingsTab());
    const [localSettings, setLocalSettings] = useState<WebsiteSettings>(settings);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'failed'>('idle');

    useEffect(() => {
        setLocalSettings(settings);
        setSaveStatus('idle');
    }, [settings]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.sessionStorage.setItem(WEBSITE_SETTINGS_TAB_KEY, activeTab);
        } catch {
            // The Store Config remains usable without persisted tab state.
        }
    }, [activeTab]);

    const isDirty = JSON.stringify(localSettings) !== JSON.stringify(settings);

    const handleSave = async () => {
        if (!isDirty || saveStatus === 'saving') return;
        setSaveStatus('saving');
        const synced = await onSettingsChange(localSettings);
        setSaveStatus(synced ? 'success' : 'failed');
        setTimeout(() => setSaveStatus('idle'), 4000);
    };

    const handleNestedChange = (area: keyof WebsiteSettings, field: string, value: any) => {
        setLocalSettings(prev => ({
            ...prev,
            [area]: {
                ...(prev[area] as any),
                [field]: value,
            }
        }));
    };


    const handleHeroImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            handleNestedChange('content', 'heroImageUrl', reader.result as string);
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const handleLayoutChange = (newLayout: HomepageSection[]) => {
        setLocalSettings(prev => ({ ...prev, layout: newLayout }));
    };

    const updateContentValue = (field: string, value: any) => {
        handleNestedChange('content', field, value);
    };

    const subscriptionPlans = normalizeSubscriptionPlans((localSettings.content as any).subscriptionPlans) as EditableSubscriptionPlan[];
    const subscriptionPage = normalizeSubscriptionPageContent((localSettings.content as any).subscriptionPage);
    const subscriptionFeatures = normalizeSubscriptionFeatures((localSettings.content as any).subscriptionFeatures);

    const updateSubscriptionFeature = (featureKey: SubscriptionFeature['key'], updates: Partial<SubscriptionFeature>) => {
        const nextFeatures = subscriptionFeatures.map(feature => feature.key === featureKey ? { ...feature, ...updates } : feature);
        updateContentValue('subscriptionFeatures', nextFeatures);
    };
    const redeemRewards = (((localSettings.content as any).redeemRewards || []) as EditableReward[]);
    const eduCoinRules = ((localSettings.content as any).eduCoinRules || { purchase: 25, redeemRate: 10 }) as { purchase: number; redeemRate: number };
    const dockItems = (((localSettings.content as any).dockItems || []) as string[]);
    const dockStyle = { ...defaultDockStyle, ...((localSettings.content as any).dockStyle || {}) };
    const sidebarFontFamily = String((dockStyle as any).sidebarFontFamily || 'Inter');
    const sidebarBackgroundColor = String((dockStyle as any).sidebarBackgroundColor || dockStyle.backgroundColor || defaultDockStyle.sidebarBackgroundColor);
    const sidebarBackgroundOpacity = Number((dockStyle as any).sidebarBackgroundOpacity ?? dockStyle.backgroundOpacity ?? defaultDockStyle.sidebarBackgroundOpacity);
    const sidebarTextColor = String((dockStyle as any).sidebarTextColor || dockStyle.textColor || defaultDockStyle.sidebarTextColor);
    const sidebarTextOpacity = Number((dockStyle as any).sidebarTextOpacity ?? defaultDockStyle.sidebarTextOpacity);
    const sidebarBorderColor = String((dockStyle as any).sidebarBorderColor || dockStyle.borderColor || defaultDockStyle.sidebarBorderColor);
    const sidebarFontOptions = ['Inter', 'Lato', 'Montserrat', 'Roboto', 'Merriweather', 'Oswald'];
    const desktopNavigationMode = localSettings.desktop?.navigationMode === 'dock' ? 'dock' : 'sidebar';
    const baseCommunityPalette = {
        pageBackground: '#F8FBFF',
        surfaceColor: '#FFFFFF',
        cardColor: '#FFFFFF',
        softBackground: '#EEF6FF',
        headerBackground: '#FFFFFF',
        sidebarBackground: '#FFFFFF',
        composerBackground: '#FFFFFF',
        rightRailBackground: '#F8FBFF',
        primaryColor: '#1769FF',
        secondaryColor: '#7B61FF',
        accentColor: '#C2E7FF',
        headingColor: '#081A45',
        bodyColor: '#536178',
        mutedColor: '#7C879A',
        borderColor: '#D9E7F8',
        activeTabBackground: '#E8F2FF',
        activeTabText: '#1769FF',
        dockBackground: '#FFFFFF',
        dockItemBackground: '#F8FBFF',
        dockActiveBackground: '#E8F2FF',
        dockTextColor: '#536178',
        dockActiveTextColor: '#1769FF',
        outgoingBubble: '#1769FF',
        incomingBubble: '#FFFFFF',
    };
    const socialCommunityPalette = {
        ...baseCommunityPalette,
        pageBackground: '#F5F7FB',
        softBackground: '#F1F5F9',
        rightRailBackground: '#F8FAFC',
        primaryColor: '#2563EB',
        secondaryColor: '#7C3AED',
        accentColor: '#DBEAFE',
        headingColor: '#0F172A',
        bodyColor: '#475569',
        mutedColor: '#64748B',
        borderColor: '#E2E8F0',
        activeTabBackground: '#EFF6FF',
        activeTabText: '#2563EB',
        dockItemBackground: '#F8FAFC',
        dockActiveBackground: '#EFF6FF',
        dockTextColor: '#475569',
        dockActiveTextColor: '#2563EB',
        outgoingBubble: '#2563EB',
    };
    const storedCommunityStyle = ((localSettings.content as any).communityStyle || {});
    const legacyCommunityPalette = {
        ...baseCommunityPalette,
        ...Object.fromEntries(Object.keys(baseCommunityPalette).map(key => [key, storedCommunityStyle[key] ?? (baseCommunityPalette as any)[key]])),
    };
    const communityStyle = {
        desktopLayout: 'latest',
        mobileLayout: 'latest',
        desktopSocialLayout: false,
        ...legacyCommunityPalette,
        shadowOpacity: 16,
        ...storedCommunityStyle,
        latestPalette: {
            ...legacyCommunityPalette,
            ...(storedCommunityStyle.latestPalette || {}),
        },
        socialPalette: {
            ...socialCommunityPalette,
            ...(storedCommunityStyle.socialPalette || {}),
        },
        classicPalette: {
            ...legacyCommunityPalette,
            ...(storedCommunityStyle.classicPalette || {}),
        },
    };
    const selectedCommunityMode: 'classic' | 'latest' | 'social' = communityStyle.desktopSocialLayout
        ? 'social'
        : communityStyle.desktopLayout === 'classic'
            ? 'classic'
            : 'latest';
    const selectedCommunityPaletteKey = selectedCommunityMode === 'social'
        ? 'socialPalette'
        : selectedCommunityMode === 'classic'
            ? 'classicPalette'
            : 'latestPalette';
    const selectedCommunityPalette = communityStyle[selectedCommunityPaletteKey];
    const readingStyle = {
        backgroundColor: '#F8FAFD', backgroundOpacity: 98, panelOpacity: 96, cardOpacity: 94, accentColor: '#C2E7FF', accentOpacity: 24,
        newsHeadingFont: 'Merriweather', blogHeadingFont: 'Montserrat', bodyFont: 'Lato', newsHeadingColor: '#083B4C', blogHeadingColor: '#3B1D5A',
        bodyTextColor: '#334155', metadataColor: '#64748B', linkColor: '#1769FF', quoteBackgroundColor: '#EEF6FF', quoteBorderColor: '#1769FF',
        titleSizeMobile: 38, titleSizeDesktop: 64, bodySizeMobile: 17, bodySizeDesktop: 19, lineHeight: 1.85, contentWidth: 860,
        ...((localSettings.content as any).readingStyle || {})
    };
    const readingFontMap: Record<string, string> = { Merriweather: 'Merriweather, Georgia, serif', Montserrat: 'Montserrat, Inter, sans-serif', Lato: 'Lato, Inter, sans-serif', Inter: 'Inter, sans-serif', Roboto: 'Roboto, Arial, sans-serif', Oswald: 'Oswald, Arial, sans-serif' };
    const profileStyle = { backgroundColor: '#e2e8f0', backgroundTint: '#e0e7ff', cardOpacity: 82, heroOverlayOpacity: 76, accentColor: '#f97316', ...((localSettings.content as any).profileStyle || {}) };
    const profileStreaks = (((localSettings.content as any).profileStreaks || []) as ProfileStreakConfig[]);
    const profileMilestones = (((localSettings.content as any).profileMilestones || []) as ProfileMilestoneConfig[]);
    const rewardValidationIssues = [
        ...profileStreaks.flatMap(streak => [
            !String(streak.title || '').trim() ? `${streak.id || 'Streak'} is missing a title.` : '',
            Number(streak.goal) <= 0 ? `${streak.title || streak.id} needs a goal greater than 0.` : '',
            Number(streak.coinReward || 0) < 0 ? `${streak.title || streak.id} cannot have negative coins.` : '',
        ].filter(Boolean)),
        ...profileMilestones.flatMap(milestone => [
            !String(milestone.title || '').trim() ? `${milestone.id || 'Milestone'} is missing a title.` : '',
            Number(milestone.requirement) <= 0 ? `${milestone.title || milestone.id} needs a requirement greater than 0.` : '',
            Number(milestone.coinReward || 0) < 0 ? `${milestone.title || milestone.id} cannot have negative coins.` : '',
        ].filter(Boolean)),
    ];
    const selectedColorExperience = localSettings.theme.colorExperience || 'clean-neutral';
    const originalPaletteActive = selectedColorExperience === 'original';
    const cleanNeutralModeActive = selectedColorExperience === 'clean-neutral';
    const fixedProfessionalModeActive = cleanNeutralModeActive;
    const themePreviewPalettes = {
        'clean-neutral': { background: '#F7F7F8', surface: '#FFFFFF', primary: '#171717', accent: '#EDEDED', text: '#262626' },
    };
    const selectedThemePreviewPalette = originalPaletteActive
        ? {
            background: localSettings.theme.backgroundColor,
            surface: '#FFFFFF',
            primary: localSettings.theme.primaryColor,
            accent: localSettings.theme.accentColor,
            text: localSettings.theme.textColor,
        }
        : themePreviewPalettes[selectedColorExperience as keyof typeof themePreviewPalettes] || themePreviewPalettes['clean-neutral'];
    const themePreviewFont = cleanNeutralModeActive
        ? 'Inter, ui-sans-serif, system-ui, sans-serif'
        : localSettings.theme.fontPairing === 'roboto-merriweather'
            ? 'Roboto, sans-serif'
            : localSettings.theme.fontPairing === 'montserrat-oswald'
                ? 'Montserrat, sans-serif'
                : 'Inter, sans-serif';
    const themePreviewRadius = cleanNeutralModeActive ? '0.625rem' : localSettings.theme.cornerRadius;
    const themePreviewShadows = {
        light: '0 7px 20px rgba(15,23,42,0.07)',
        medium: '0 14px 36px rgba(15,23,42,0.10)',
        heavy: '0 20px 48px rgba(15,23,42,0.14)',
    };
    const themePreviewShadow = cleanNeutralModeActive
        ? '0 1px 3px rgba(0,0,0,0.04)'
        : themePreviewShadows[localSettings.theme.shadowIntensity as keyof typeof themePreviewShadows] || themePreviewShadows.medium;
    const defaultDockItems = dockCustomizationItems;
    const selectedDockItems = dockItems.length ? dockItems : defaultDockItems;

    const updatePlan = (planIndex: number, updates: Partial<EditableSubscriptionPlan>) => {
        const nextPlans = subscriptionPlans.map((plan, index) => index === planIndex ? { ...plan, ...updates } : plan);
        updateContentValue('subscriptionPlans', nextPlans);
    };


    const updateSubscriptionPage = (updates: Partial<SubscriptionPageContent>) => {
        updateContentValue('subscriptionPage', { ...subscriptionPage, ...updates });
    };

    const updateMembershipMessage = (field: 'aiMentorLocked' | 'communityLocked' | 'profileUpgrade', updates: Partial<MembershipMessage>) => {
        updateSubscriptionPage({ [field]: { ...subscriptionPage[field], ...updates } } as Partial<SubscriptionPageContent>);
    };

    const togglePlanProduct = (planIndex: number, productId: number) => {
        const plan = subscriptionPlans[planIndex];
        const currentIds = plan.unlockProductIds || [];
        const nextIds = currentIds.includes(productId) ? currentIds.filter(id => id !== productId) : [...currentIds, productId];
        updatePlan(planIndex, { unlockProductIds: nextIds });
    };

    const updateReward = (rewardIndex: number, updates: Partial<EditableReward>) => {
        updateContentValue('redeemRewards', redeemRewards.map((reward, index) => index === rewardIndex ? { ...reward, ...updates } : reward));
    };

    const addReward = () => {
        updateContentValue('redeemRewards', [...redeemRewards, { id: `reward-${Date.now()}`, title: 'New Reward', cost: 100 }]);
    };

    const removeReward = (rewardIndex: number) => {
        updateContentValue('redeemRewards', redeemRewards.filter((_, index) => index !== rewardIndex));
    };

    const toggleDockItem = (label: string) => {
        if (label === 'Home') return;
        const nextItems = selectedDockItems.includes(label)
            ? selectedDockItems.filter(item => item !== label)
            : [...selectedDockItems, label];
        updateContentValue('dockItems', nextItems.includes('Home') ? nextItems : ['Home', ...nextItems]);
    };

    const moveDockItem = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;
        if (index <= 0 || nextIndex <= 0 || nextIndex >= selectedDockItems.length) return;
        const nextItems = [...selectedDockItems];
        [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
        updateContentValue('dockItems', nextItems);
    };

    const updateDockStyle = (field: string, value: string | number | boolean) => {
        updateContentValue('dockStyle', { ...dockStyle, [field]: value });
    };

    const updateCommunityStyle = (field: string, value: string | number | boolean) => {
        updateContentValue('communityStyle', { ...communityStyle, [field]: value });
    };

    const selectCommunityMode = (mode: 'classic' | 'latest' | 'social') => {
        updateContentValue('communityStyle', {
            ...communityStyle,
            desktopLayout: mode === 'classic' ? 'classic' : 'latest',
            desktopSocialLayout: mode === 'social',
        });
    };

    const updateSelectedCommunityPalette = (field: string, value: string) => {
        updateContentValue('communityStyle', {
            ...communityStyle,
            [selectedCommunityPaletteKey]: {
                ...selectedCommunityPalette,
                [field]: value,
            },
        });
    };

    const updateReadingStyle = (field: string, value: string | number) => {
        updateContentValue('readingStyle', { ...readingStyle, [field]: value });
    };




    const updateProfileStyle = (field: string, value: string | number) => {
        updateContentValue('profileStyle', { ...profileStyle, [field]: value });
    };

    const updateProfileStreak = (index: number, updates: Partial<ProfileStreakConfig>) => {
        updateContentValue('profileStreaks', profileStreaks.map((streak, streakIndex) => streakIndex === index ? { ...streak, ...updates, updatedAt: new Date().toISOString() } : streak));
    };

    const addProfileStreak = () => {
        updateContentValue('profileStreaks', [...profileStreaks, { id: `streak-${Date.now()}`, title: 'New Daily Strip', icon: '🔥', category: 'Daily Streak', metric: 'dailyLogin', goal: 1, unit: 'day', coinReward: 10, accent: 'from-orange-400 via-amber-400 to-yellow-300', note: 'Describe the daily action users should complete.', active: false, draft: true, archived: false, updatedAt: new Date().toISOString() }]);
    };

    const duplicateProfileStreak = (index: number) => {
        const streak = profileStreaks[index];
        updateContentValue('profileStreaks', [...profileStreaks, { ...streak, id: `${streak.id}-copy-${Date.now()}`, title: `${streak.title} Copy`, active: false, draft: true, archived: false, updatedAt: new Date().toISOString() }]);
    };

    const archiveProfileStreak = (index: number) => {
        updateProfileStreak(index, { active: false, draft: false, archived: true });
    };

    const updateProfileMilestone = (index: number, updates: Partial<ProfileMilestoneConfig>) => {
        updateContentValue('profileMilestones', profileMilestones.map((milestone, milestoneIndex) => milestoneIndex === index ? { ...milestone, ...updates, updatedAt: new Date().toISOString() } : milestone));
    };

    const addProfileMilestone = () => {
        updateContentValue('profileMilestones', [...profileMilestones, { id: `milestone-${Date.now()}`, title: 'New Milestone', icon: '🏆', category: 'Milestone', metric: 'lifetimeCoins', requirement: 500, description: 'Describe this real-data milestone.', actionLabel: 'Claim Reward', coinReward: 50, unlockProductIds: [], active: false, draft: true, archived: false, updatedAt: new Date().toISOString() }]);
    };

    const duplicateProfileMilestone = (index: number) => {
        const milestone = profileMilestones[index];
        updateContentValue('profileMilestones', [...profileMilestones, { ...milestone, id: `${milestone.id}-copy-${Date.now()}`, title: `${milestone.title} Copy`, active: false, draft: true, archived: false, updatedAt: new Date().toISOString() }]);
    };

    const archiveProfileMilestone = (index: number) => {
        updateProfileMilestone(index, { active: false, draft: false, archived: true });
    };

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const newLayout = [...localSettings.layout];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= newLayout.length) return;
        [newLayout[index], newLayout[newIndex]] = [newLayout[newIndex], newLayout[index]];
        handleLayoutChange(newLayout);
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'theme': return (
                <div>
                    <section className="mb-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 sm:p-5">
                        <div className="flex flex-col gap-1">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Global colour experience</p>
                            <h2 className="text-xl font-black text-slate-950">Choose the complete website colour mode</h2>
                            <p className="text-sm font-semibold leading-6 text-slate-600">This selection controls every public page, Community screen, modal, card, button, form and Admin page. Choose a mode, then click Save Changes.</p>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'clean-neutral') === 'original'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'original')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'clean-neutral') === 'original'
                                        ? 'border-blue-600 bg-blue-600 text-white shadow-lg'
                                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300'
                                }`}
                            >
                                <span className="block text-base font-black">Original Colours</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'clean-neutral') === 'original' ? 'text-white/85' : 'text-slate-500'}`}>Use the original brand colour controls below.</span>
                            </button>
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'clean-neutral') === 'clean-neutral'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'clean-neutral')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'clean-neutral') === 'clean-neutral'
                                        ? 'border-[#171717] bg-[#171717] text-white shadow-none'
                                        : 'border-[#E5E5E5] bg-white text-[#171717] hover:border-[#A3A3A3]'
                                }`}
                            >
                                <span className="block text-base font-black">Clean Neutral</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'clean-neutral') === 'clean-neutral' ? 'text-white/80' : 'text-[#737373]'}`}>Soft pages, white cards, black typography, restrained borders and professional UX across every page.</span>
                            </button>
                        </div>
                        {cleanNeutralModeActive && (
                            <div className="mt-4 rounded-xl border border-[#E5E5E5] bg-white p-4">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#737373]">Professional design contract locked</p>
                                <h3 className="mt-1 text-base font-black text-[#171717]">All 20 Clean Neutral rules apply globally</h3>
                                <p className="mt-1 text-xs font-semibold leading-5 text-[#525252]">Typography, card hierarchy, icon colours, active and inactive states, primary and secondary buttons, inputs, borders, shadows, status colours, spacing, radius and motion use fixed audited values on public pages, Community, Admin, course player, checkout and every overlay.</p>
                            </div>
                        )}
                        {cleanNeutralModeActive && (
                            <>
                                <CleanNeutralDesignStudio
                                    value={localSettings.theme.cleanNeutralCustomizer}
                                    onChange={customizer => handleNestedChange('theme', 'cleanNeutralCustomizer', customizer)}
                                />
                                <CleanNeutralAdvancedStudio
                                    value={localSettings.theme.cleanNeutralCustomizer}
                                    onChange={customizer => handleNestedChange('theme', 'cleanNeutralCustomizer', customizer)}
                                />
                            </>
                        )}
                    </section>
                    <div className="mb-4">
                        <h3 className="text-lg font-black text-slate-900">Original palette controls</h3>
                        <p className="mt-1 text-sm text-slate-600">These detailed colours remain available for Current / Original Colours mode.</p>
                    </div>
                    <fieldset disabled={!originalPaletteActive} className={`theme-control-availability space-y-4 rounded-2xl border p-4 ${originalPaletteActive ? 'border-blue-100 bg-blue-50/40' : 'border-slate-200 bg-slate-50 opacity-55'}`}>
                        <legend className="px-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600">
                            {originalPaletteActive ? 'Editing the active Original palette' : 'Select Current / Original Colours to edit these values'}
                        </legend>
                        <FormRow label="Primary Color" description="Main brand color for headers, buttons, and links.">
                            <input type="color" value={localSettings.theme.primaryColor} onChange={e => handleNestedChange('theme', 'primaryColor', e.target.value)} className="h-10 w-full rounded-md border p-1 disabled:cursor-not-allowed" />
                        </FormRow>
                        <FormRow label="Accent Color" description="Used for highlights and secondary elements.">
                            <input type="color" value={localSettings.theme.accentColor} onChange={e => handleNestedChange('theme', 'accentColor', e.target.value)} className="h-10 w-full rounded-md border p-1 disabled:cursor-not-allowed" />
                        </FormRow>
                        <FormRow label="Background Color" description="The main background color for most pages.">
                            <input type="color" value={localSettings.theme.backgroundColor} onChange={e => handleNestedChange('theme', 'backgroundColor', e.target.value)} className="h-10 w-full rounded-md border p-1 disabled:cursor-not-allowed" />
                        </FormRow>
                        <FormRow label="Text Color" description="Main text color.">
                            <input type="color" value={localSettings.theme.textColor} onChange={e => handleNestedChange('theme', 'textColor', e.target.value)} className="h-10 w-full rounded-md border p-1 disabled:cursor-not-allowed" />
                        </FormRow>
                    </fieldset>
                    <FormRow label="Typography" description={cleanNeutralModeActive ? 'Clean Neutral uses fixed Inter typography for consistent professional hierarchy.' : 'Choose a real loaded font pairing for the complete website.'}>
                        <select disabled={fixedProfessionalModeActive} value={localSettings.theme.fontPairing} onChange={e => handleNestedChange('theme', 'fontPairing', e.target.value)} className="theme-control-availability w-full rounded border p-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-55">
                            <option value="inter-lato">Inter & Lato</option>
                            <option value="roboto-merriweather">Roboto & Merriweather</option>
                            <option value="montserrat-oswald">Montserrat & Oswald</option>
                        </select>
                    </FormRow>
                     <FormRow label="Corner Radius" description={cleanNeutralModeActive ? 'Clean Neutral locks controls to 10px and cards to 14px for consistent hierarchy.' : `Controls global cards and buttons. Current: ${localSettings.theme.cornerRadius}`}>
                        <input disabled={fixedProfessionalModeActive} type="range" min="0" max="2" step="0.1" value={parseFloat(localSettings.theme.cornerRadius)} onChange={e => handleNestedChange('theme', 'cornerRadius', `${e.target.value}rem`)} className="theme-control-availability w-full disabled:cursor-not-allowed disabled:opacity-45" />
                    </FormRow>
                     <FormRow label="Shadow Intensity" description={cleanNeutralModeActive ? 'Clean Neutral locks cards to an ultra-subtle shadow and reserves stronger elevation for floating overlays.' : 'Controls base, large, and extra-large shadow depth across the real website.'}>
                        <select disabled={cleanNeutralModeActive} value={localSettings.theme.shadowIntensity} onChange={e => handleNestedChange('theme', 'shadowIntensity', e.target.value)} className="w-full rounded border p-2">
                            <option value="light">Light</option>
                            <option value="medium">Medium</option>
                            <option value="heavy">Heavy</option>
                        </select>
                    </FormRow>
                    <section
                        className="theme-settings-live-preview overflow-hidden border p-5"
                        style={{
                            backgroundColor: selectedThemePreviewPalette.background,
                            borderColor: selectedThemePreviewPalette.accent,
                            borderRadius: themePreviewRadius,
                            boxShadow: themePreviewShadow,
                            fontFamily: themePreviewFont,
                        }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: selectedThemePreviewPalette.primary }}>Live website preview</p>
                                <h3 className="mt-1 text-xl font-black" style={{ color: selectedThemePreviewPalette.text }}>Product discovery card</h3>
                            </div>
                            <span className="rounded-full px-3 py-1 text-[10px] font-black" style={{ backgroundColor: selectedThemePreviewPalette.accent, color: selectedThemePreviewPalette.text }}>
                                {selectedColorExperience}
                            </span>
                        </div>
                        <div className="mt-4 border p-4" style={{ backgroundColor: selectedThemePreviewPalette.surface, borderColor: selectedThemePreviewPalette.accent, borderRadius: themePreviewRadius, boxShadow: themePreviewShadow }}>
                            <p className="text-sm font-semibold" style={{ color: selectedThemePreviewPalette.text }}>Typography, palette, radius and all three shadow depths update after Save Changes.</p>
                            <button type="button" className="mt-4 px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: selectedThemePreviewPalette.primary, borderRadius: themePreviewRadius }}>
                                Sample primary action
                            </button>
                        </div>
                    </section>
                </div>
            );
            case 'layout': return (
                <div className="space-y-3">
                    {localSettings.layout.map((section, index) => (
                        <div key={section.id} className="flex items-center justify-between p-3 bg-slate-100/80 rounded-lg border">
                            <div className="flex items-center gap-4"><div className="flex flex-col gap-1"><button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="disabled:opacity-20">▲</button><button onClick={() => moveSection(index, 'down')} disabled={index === localSettings.layout.length - 1} className="disabled:opacity-20">▼</button></div><div><p className="font-semibold text-gray-700">{sectionNames[section.id]}</p>{section.hasOwnProperty('title') && (<input type="text" value={section.title} onChange={e => handleLayoutChange(localSettings.layout.map(s => s.id === section.id ? { ...s, title: e.target.value } : s))} className="text-xs p-1 border rounded mt-1 w-full" placeholder="Section Title"/>)}</div></div>
                            <label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={section.visible} onChange={e => handleLayoutChange(localSettings.layout.map(s => s.id === section.id ? { ...s, visible: e.target.checked } : s))} className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div></label>
                        </div>
                    ))}
                </div>
            );
             case 'content': return (
                <div>
                    {/* Hero Section Text */}
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
                        <h3 className="font-bold text-blue-800 mb-2">Hero Section Text</h3>
                        <FormRow label="Website Name"><input type="text" value={(localSettings.content as any).siteName || 'Digital Catalyst'} onChange={e => handleNestedChange('content', 'siteName', e.target.value)} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="Hero Title"><input type="text" value={localSettings.content.heroTitle} onChange={e => handleNestedChange('content', 'heroTitle', e.target.value)} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="Hero Subtitle"><textarea value={localSettings.content.heroSubtitle} onChange={e => handleNestedChange('content', 'heroSubtitle', e.target.value)} className="w-full p-2 border rounded" rows={3}></textarea></FormRow>
                        <FormRow label="Hero Image URL" description="Choose a hero image, check the preview, then save settings.">
                            <PremiumImageUrlInput
                                value={localSettings.content.heroImageUrl || ''}
                                onChange={(url) => handleNestedChange('content', 'heroImageUrl', url)}
                                label="Hero image URL"
                                previewAlt="Hero preview"
                                aspect="video"
                                compact
                                helperText="Choose an image, preview it, then save settings."
                            />
                        </FormRow>
                    </div>

                    {/* Hero Metrics Configuration */}
                    <div className="bg-indigo-50 p-4 rounded-lg mb-6 border border-indigo-200">
                        <h3 className="font-bold text-indigo-800 mb-2">Hero Floating Metrics</h3>
                        <p className="text-sm text-indigo-600 mb-4">Customize the floating cards seen on the hero image.</p>

                        <FormRow label="Use Real Data" description="Automatically calculate Revenue and Users from site data.">
                            <input
                                type="checkbox"
                                checked={localSettings.content.heroMetrics?.enableRealData || false}
                                onChange={e => {
                                    setLocalSettings(prev => ({
                                        ...prev,
                                        content: {
                                            ...prev.content,
                                            heroMetrics: { ...prev.content.heroMetrics, enableRealData: e.target.checked }
                                        }
                                    }));
                                }}
                                className="w-5 h-5"
                            />
                        </FormRow>

                        {!localSettings.content.heroMetrics?.enableRealData && (
                            <>
                                <FormRow label="Custom Revenue Text" description="e.g., +128% or $50k">
                                    <input
                                        type="text"
                                        value={localSettings.content.heroMetrics?.customRevenueChange || ""}
                                        onChange={e => setLocalSettings(prev => ({...prev, content: {...prev.content, heroMetrics: {...prev.content.heroMetrics, customRevenueChange: e.target.value}}}))}
                                        className="w-full p-2 border rounded"
                                    />
                                </FormRow>
                                <FormRow label="Custom Active Users" description="e.g., 2.4k+">
                                    <input
                                        type="text"
                                        value={localSettings.content.heroMetrics?.customActiveUsers || ""}
                                        onChange={e => setLocalSettings(prev => ({...prev, content: {...prev.content, heroMetrics: {...prev.content.heroMetrics, customActiveUsers: e.target.value}}}))}
                                        className="w-full p-2 border rounded"
                                    />
                                </FormRow>
                            </>
                        )}
                    </div>

                    {/* About Us Section */}
                    <div className="bg-slate-100/80 p-4 rounded-lg mb-6 border border-slate-200/80">
                        <h3 className="font-bold text-gray-800 mb-2">About Us Section</h3>
                        <FormRow label="About Us Title"><input type="text" value={localSettings.content.aboutUsTitle} onChange={e => handleNestedChange('content', 'aboutUsTitle', e.target.value)} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="About Us Text"><textarea value={localSettings.content.aboutUsText} onChange={e => handleNestedChange('content', 'aboutUsText', e.target.value)} className="w-full p-2 border rounded" rows={4}></textarea></FormRow>
                        <FormRow label="About Us Image Seed"><input type="text" value={localSettings.content.aboutUsImageSeed} onChange={e => handleNestedChange('content', 'aboutUsImageSeed', e.target.value)} className="w-full p-2 border rounded" /></FormRow>
                    </div>


                    <div className="bg-slate-100/80 rounded-lg p-4 mt-4 border border-slate-200">
                        <div className="mb-4">
                            <h3 className="font-bold text-gray-800">Gamification & Subscription</h3>
                            <p className="text-sm text-slate-600 mt-1">No JSON needed — edit rewards, coins, plans, unlocked products, and dock labels directly.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-xl border bg-white p-4">
                                <h4 className="font-bold text-gray-800">EduCoin Rules</h4>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="block text-sm font-semibold text-gray-700">Coins per purchase
                                        <input type="number" min="0" value={eduCoinRules.purchase} onChange={e => updateContentValue('eduCoinRules', { ...eduCoinRules, purchase: Number(e.target.value) || 0 })} className="mt-1 w-full rounded border p-2" />
                                    </label>
                                    <label className="block text-sm font-semibold text-gray-700">Coins per ₹1 discount
                                        <input type="number" min="1" value={eduCoinRules.redeemRate || 10} onChange={e => updateContentValue('eduCoinRules', { ...eduCoinRules, redeemRate: Number(e.target.value) || 10 })} className="mt-1 w-full rounded border p-2" />
                                        <span className="mt-1 block text-xs text-slate-500">Default economy ratio is 10 EduCoins = ₹1.</span>
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="font-bold text-gray-800">Rewards</h4>
                                    <button type="button" onClick={addReward} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white">+ Add Reward</button>
                                </div>
                                <div className="mt-3 space-y-3">
                                    {redeemRewards.map((reward, rewardIndex) => (
                                        <div key={reward.id || rewardIndex} className="grid grid-cols-1 gap-2 rounded-lg border bg-slate-100/80 p-3 sm:grid-cols-[1fr_7rem_auto]">
                                            <input value={reward.title} onChange={e => updateReward(rewardIndex, { title: e.target.value })} placeholder="Reward title" className="rounded border p-2" />
                                            <input type="number" min="0" value={reward.cost} onChange={e => updateReward(rewardIndex, { cost: Number(e.target.value) || 0 })} placeholder="Cost" className="rounded border p-2" />
                                            <button type="button" onClick={() => removeReward(rewardIndex)} className="rounded border border-red-200 px-3 py-2 text-sm font-bold text-red-600">Remove</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                            <h4 className="font-bold text-gray-800">Subscription Access</h4>
                            <p className="mt-1 text-sm text-slate-600">Use the dedicated Subscriptions tab to manage Pro/Elite plans, page copy, benefits, earning power, locked messages, CTAs, and product access.</p>
                            <button type="button" onClick={() => setActiveTab('subscriptions')} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Open Subscription Customizer</button>
                        </div>

                    </div>

                    {/* Footer & Social */}
                    <div className="bg-slate-100/80 p-4 rounded-lg border border-slate-200/80">
                        <h3 className="font-bold text-gray-800 mb-2">Footer & Social</h3>
                        <FormRow label="Footer Text" description="Use {year} to automatically insert the current year."><input type="text" value={localSettings.content.footerText} onChange={e => handleNestedChange('content', 'footerText', e.target.value)} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="Facebook URL"><input type="url" value={localSettings.content.socialLinks.facebook} onChange={e => handleNestedChange('content', 'socialLinks', {...localSettings.content.socialLinks, facebook: e.target.value})} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="Twitter URL"><input type="url" value={localSettings.content.socialLinks.twitter} onChange={e => handleNestedChange('content', 'socialLinks', {...localSettings.content.socialLinks, twitter: e.target.value})} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="Instagram URL"><input type="url" value={localSettings.content.socialLinks.instagram} onChange={e => handleNestedChange('content', 'socialLinks', {...localSettings.content.socialLinks, instagram: e.target.value})} className="w-full p-2 border rounded" /></FormRow>
                        <FormRow label="LinkedIn URL"><input type="url" value={localSettings.content.socialLinks.linkedin} onChange={e => handleNestedChange('content', 'socialLinks', {...localSettings.content.socialLinks, linkedin: e.target.value})} className="w-full p-2 border rounded" /></FormRow>
                    </div>
                </div>
            );


            case 'subscriptions': return (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Subscription Page</p>
                        <h2 className="mt-2 text-2xl font-black text-slate-900">Eduvora Plus+ Subscription Customizer</h2>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">A single Eduvora Plus+ subscription unlocks everything: AI Mentor, Community, EduCoin earning, badges, streaks, milestones, rewards, and MyDay. Members purchase a one-time, weekly, monthly, quarterly, or yearly cycle.</p>
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                        <h3 className="text-lg font-black text-slate-900">Page Header & Billing Labels</h3>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="text-sm font-semibold text-slate-700">Eyebrow<input value={subscriptionPage.eyebrow} onChange={e => updateSubscriptionPage({ eyebrow: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold text-slate-700">Main Title<input value={subscriptionPage.title} onChange={e => updateSubscriptionPage({ title: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="md:col-span-2 text-sm font-semibold text-slate-700">Subtitle<textarea value={subscriptionPage.subtitle} onChange={e => updateSubscriptionPage({ subtitle: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold text-slate-700">Monthly Label<input value={subscriptionPage.monthlyLabel} onChange={e => updateSubscriptionPage({ monthlyLabel: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold text-slate-700">Yearly Label<input value={subscriptionPage.yearlyLabel} onChange={e => updateSubscriptionPage({ yearlyLabel: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold text-slate-700">Yearly Badge<input value={subscriptionPage.yearlyBadge} onChange={e => updateSubscriptionPage({ yearlyBadge: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold text-slate-700">Value Section Title<input value={subscriptionPage.valueTitle} onChange={e => updateSubscriptionPage({ valueTitle: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="md:col-span-2 text-sm font-semibold text-slate-700">Value Section Description<textarea value={subscriptionPage.valueDescription} onChange={e => updateSubscriptionPage({ valueDescription: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="md:col-span-2 text-sm font-semibold text-slate-700">Renewal Note<textarea value={subscriptionPage.renewalNote} onChange={e => updateSubscriptionPage({ renewalNote: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border p-2" /></label>
                        </div>
                    </div>

                    <div className="rounded-2xl border bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Subscription Card Images</h3>
                                <p className="mt-1 text-sm font-semibold text-slate-600">Six cards shown in the stacked subscription carousel. Upload or paste a Cloudinary URL for each slot; empty slots fall back to defaults.</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {[0, 1, 2, 3, 4, 5].map(slot => (
                                <div key={slot}>
                                    <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-indigo-600">Card {slot + 1}</p>
                                    <PremiumImageUrlInput
                                        value={subscriptionPage.cardImages?.[slot] || ''}
                                        onChange={(url) => {
                                            const cardImages = [...(subscriptionPage.cardImages?.length ? subscriptionPage.cardImages : [])];
                                            while (cardImages.length < 6) cardImages.push('');
                                            cardImages[slot] = url;
                                            updateSubscriptionPage({ cardImages });
                                        }}
                                        label={`Card ${slot + 1} image URL`}
                                        previewAlt={`Subscription card ${slot + 1} preview`}
                                        aspect="portrait"
                                        compact
                                        helperText="Choose an image, preview it, then save settings."
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        {subscriptionPlans.map((plan, planIndex) => (
                            <div key={plan.accessTier} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div><p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">{plan.accessTier} membership</p><h3 className="text-xl font-black text-slate-900">{plan.name}</h3></div>
                                    <label className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700"><input type="checkbox" checked={plan.featured === true} onChange={e => updatePlan(planIndex, { featured: e.target.checked })} /> Featured plan</label>
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <label className="text-sm font-semibold text-slate-700">Plan Name<input value={plan.name} onChange={e => updatePlan(planIndex, { name: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">One-time Price (₹)<input type="number" min="0" value={plan.oncePrice ?? ''} onChange={e => updatePlan(planIndex, { oncePrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Weekly Price (₹)<input type="number" min="0" value={plan.weeklyPrice ?? ''} onChange={e => updatePlan(planIndex, { weeklyPrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Monthly Price (₹)<input type="number" min="0" value={plan.monthlyPrice ?? plan.price} onChange={e => { const nextPrice = Number(e.target.value) || 0; updatePlan(planIndex, { monthlyPrice: nextPrice, price: nextPrice }); }} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Quarterly Price (₹)<input type="number" min="0" value={plan.quarterlyPrice ?? ''} onChange={e => updatePlan(planIndex, { quarterlyPrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Yearly Price (₹)<input type="number" min="0" value={plan.yearlyPrice ?? ((plan.monthlyPrice ?? plan.price) * 12)} onChange={e => updatePlan(planIndex, { yearlyPrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">EduCoin Price<input type="number" min="0" value={plan.coinPrice || 0} onChange={e => updatePlan(planIndex, { coinPrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Earning Multiplier<input type="number" min="1" max="5" step="0.25" value={plan.earningMultiplier} onChange={e => updatePlan(planIndex, { earningMultiplier: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Badge Text<input value={plan.badge || ''} onChange={e => updatePlan(planIndex, { badge: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">Audience Label<input value={plan.audienceLabel} onChange={e => updatePlan(planIndex, { audienceLabel: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="text-sm font-semibold text-slate-700">CTA Label<input value={plan.ctaLabel} onChange={e => updatePlan(planIndex, { ctaLabel: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                </div>
                                <label className="mt-3 block text-sm font-semibold text-slate-700">Description<textarea value={plan.description} onChange={e => updatePlan(planIndex, { description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-2" /></label>
                                <label className="mt-3 block text-sm font-semibold text-slate-700">Benefits (one per line)<textarea value={plan.benefits.join('\n')} onChange={e => updatePlan(planIndex, { benefits: e.target.value.split('\n').map(item => item.trim()).filter(Boolean) })} rows={8} className="mt-1 w-full rounded-lg border p-2 font-mono text-sm" /></label>
                                <div className="mt-4">
                                    <p className="text-sm font-black text-slate-800">Selected premium products/content</p>
                                    {products.length ? <div className="mt-2 grid gap-2 md:grid-cols-2">{products.map(product => <label key={product.id} className="flex items-center gap-2 rounded-lg border bg-slate-50 p-2 text-sm font-semibold"><input type="checkbox" checked={plan.unlockProductIds.includes(product.id)} onChange={() => togglePlanProduct(planIndex, product.id)} /><span>{product.title}</span></label>)}</div> : <input value={plan.unlockProductIds.join(', ')} onChange={e => updatePlan(planIndex, { unlockProductIds: e.target.value.split(',').map(value => Number(value.trim())).filter(Boolean) })} className="mt-2 w-full rounded-lg border p-2" />}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="subscription-feature-pricing">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Feature-wise Pricing</p>
                                <h3 className="text-xl font-black text-slate-900">Subscription Features</h3>
                                <p className="text-sm text-slate-600">Har feature ka monthly price yahan set karein. 0 rakha to feature free rahega. Poora bundle (sab features) ka price upar plan ke Monthly Price se aata hai.</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {subscriptionFeatures.map(feature => (
                                <div key={feature.key} className="rounded-xl border bg-slate-50 p-3">
                                    <p className="text-sm font-black text-slate-900">{feature.icon} {feature.name}</p>
                                    <label className="mt-2 block text-sm font-semibold text-slate-700">Monthly Price (₹)<input type="number" min="0" value={feature.monthlyPrice} onChange={e => updateSubscriptionFeature(feature.key, { monthlyPrice: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border p-2" /></label>
                                    <label className="mt-2 block text-sm font-semibold text-slate-700">Badge (optional)<input value={feature.badge || ''} onChange={e => updateSubscriptionFeature(feature.key, { badge: e.target.value })} className="mt-1 w-full rounded-lg border p-2" placeholder="e.g. Best for doubts" /></label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                        {([
                            ['aiMentorLocked', 'AI Mentor Locked Message'],
                            ['communityLocked', 'Community Locked Message'],
                            ['profileUpgrade', 'Normal User Profile Message'],
                        ] as const).map(([field, label]) => {
                            const message = subscriptionPage[field];
                            return <div key={field} className="rounded-2xl border bg-white p-4"><h3 className="font-black text-slate-900">{label}</h3><label className="mt-3 block text-sm font-semibold text-slate-700">Eyebrow<input value={message.eyebrow} onChange={e => updateMembershipMessage(field, { eyebrow: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label><label className="mt-3 block text-sm font-semibold text-slate-700">Title<input value={message.title} onChange={e => updateMembershipMessage(field, { title: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label><label className="mt-3 block text-sm font-semibold text-slate-700">Message<textarea value={message.description} onChange={e => updateMembershipMessage(field, { description: e.target.value })} rows={10} className="mt-1 w-full rounded-lg border p-2" /></label><label className="mt-3 block text-sm font-semibold text-slate-700">CTA Label<input value={message.ctaLabel} onChange={e => updateMembershipMessage(field, { ctaLabel: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label></div>;
                        })}
                    </div>
                </div>
            );

            case 'profile': return (
                <div className="space-y-5">
                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">Profile Background & Glass UI</h4>
                        <p className="text-sm text-slate-600">These colors globally apply to every user's profile page.</p>
                        <div className="mt-4 space-y-4">
                            <FormRow label="Profile Background"><input type="color" value={profileStyle.backgroundColor} onChange={e => updateProfileStyle('backgroundColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Profile Tint"><input type="color" value={profileStyle.backgroundTint} onChange={e => updateProfileStyle('backgroundTint', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Accent Glow"><input type="color" value={profileStyle.accentColor} onChange={e => updateProfileStyle('accentColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label={`Card Opacity (${profileStyle.cardOpacity}%)`}><input type="range" min="55" max="100" value={profileStyle.cardOpacity} onChange={e => updateProfileStyle('cardOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                            <FormRow label={`Hero Overlay (${profileStyle.heroOverlayOpacity}%)`}><input type="range" min="35" max="95" value={profileStyle.heroOverlayOpacity} onChange={e => updateProfileStyle('heroOverlayOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Reward Builder Overview</p>
                                <h4 className="text-xl font-black text-slate-900">Global badge, streak, and milestone rules</h4>
                                <p className="text-sm text-slate-600">Draft rewards stay hidden. Active rewards are evaluated from real profile progress and archived rewards remain safe for old claim history.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                                <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-emerald-600">{[...profileStreaks, ...profileMilestones].filter(item => getRewardStatus(item) === 'Active').length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Active</p></div>
                                <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-amber-600">{[...profileStreaks, ...profileMilestones].filter(item => getRewardStatus(item) === 'Draft').length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Draft</p></div>
                                <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-indigo-600">{profileStreaks.length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Streaks</p></div>
                                <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-purple-600">{profileMilestones.length}</p><p className="text-[10px] font-bold uppercase text-slate-500">Milestones</p></div>
                            </div>
                        </div>
                        {rewardValidationIssues.length > 0 && (
                            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                <p className="font-black">Validation summary before publish</p>
                                <ul className="mt-1 list-disc pl-5">{rewardValidationIssues.slice(0, 5).map(issue => <li key={issue}>{issue}</li>)}</ul>
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h4 className="font-bold text-gray-800">Daily Coin Streak Strips</h4>
                                <p className="text-sm text-slate-600">Create and customize strips globally. Keep 12 active strips for a full retention board.</p>
                            </div>
                            <button type="button" onClick={addProfileStreak} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white">+ Add Strip</button>
                        </div>
                        <div className="mt-4 space-y-4">
                            {profileStreaks.map((streak, index) => (
                                <div key={streak.id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(getRewardStatus(streak))}`}>{getRewardStatus(streak)}</span>
                                        <p className="text-xs font-semibold text-slate-500">Rule: unlock after {streak.goal} {streak.unit} of {metricLabels[streak.metric] || streak.metric}. Reward: {streak.coinReward || 0} coins.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                                        <input value={streak.title} onChange={e => updateProfileStreak(index, { title: e.target.value })} placeholder="Title" className="rounded border p-2 md:col-span-2" />
                                        <input value={streak.icon} onChange={e => updateProfileStreak(index, { icon: e.target.value })} placeholder="Icon" className="rounded border p-2" />
                                        <input value={streak.category || ''} onChange={e => updateProfileStreak(index, { category: e.target.value })} placeholder="Category" className="rounded border p-2" />
                                        <select value={streak.metric} onChange={e => updateProfileStreak(index, { metric: e.target.value as ProfileStreakMetric })} className="rounded border p-2 md:col-span-2">{streakMetricOptions.map(metric => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}</select>
                                        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={streak.active !== false && !streak.draft && !streak.archived} onChange={e => updateProfileStreak(index, { active: e.target.checked, draft: !e.target.checked, archived: false })} /> Publish active</label>
                                        <input type="number" min="1" value={streak.goal} onChange={e => updateProfileStreak(index, { goal: Number(e.target.value) || 1 })} placeholder="Goal" className="rounded border p-2" />
                                        <input value={streak.unit} onChange={e => updateProfileStreak(index, { unit: e.target.value })} placeholder="Unit" className="rounded border p-2" />
                                        <input type="number" min="0" value={streak.coinReward} onChange={e => updateProfileStreak(index, { coinReward: Number(e.target.value) || 0 })} placeholder="Coins" className="rounded border p-2" />
                                        <input value={streak.accent} onChange={e => updateProfileStreak(index, { accent: e.target.value })} placeholder="Tailwind gradient classes" className="rounded border p-2 md:col-span-2" />
                                        <button type="button" onClick={() => updateProfileStreak(index, { active: false, draft: true, archived: false })} className="rounded border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700">Draft</button>
                                        <button type="button" onClick={() => duplicateProfileStreak(index)} className="rounded border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-600">Duplicate</button>
                                        <button type="button" onClick={() => archiveProfileStreak(index)} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">Archive</button>
                                        <textarea value={streak.note} onChange={e => updateProfileStreak(index, { note: e.target.value })} placeholder="Motivation note" className="rounded border p-2 md:col-span-6" rows={2} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h4 className="font-bold text-gray-800">Glowing Milestones</h4>
                                <p className="text-sm text-slate-600">Admin-controlled real-data milestones with coin rewards, downloads, and optional product unlocks.</p>
                            </div>
                            <button type="button" onClick={addProfileMilestone} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">+ Add Milestone</button>
                        </div>
                        <div className="mt-4 space-y-4">
                            {profileMilestones.map((milestone, index) => (
                                <div key={milestone.id || index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(getRewardStatus(milestone))}`}>{getRewardStatus(milestone)}</span>
                                        <p className="text-xs font-semibold text-slate-500">Rule: unlock after {milestone.requirement} {metricLabels[milestone.metric] || milestone.metric}. Reward: {milestone.coinReward || 0} coins.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                                        <input value={milestone.title} onChange={e => updateProfileMilestone(index, { title: e.target.value })} placeholder="Title" className="rounded border p-2 md:col-span-2" />
                                        <input value={milestone.icon} onChange={e => updateProfileMilestone(index, { icon: e.target.value })} placeholder="Icon" className="rounded border p-2" />
                                        <input value={milestone.category || ''} onChange={e => updateProfileMilestone(index, { category: e.target.value })} placeholder="Category" className="rounded border p-2" />
                                        <select value={milestone.metric} onChange={e => updateProfileMilestone(index, { metric: e.target.value as ProfileMilestoneMetric })} className="rounded border p-2 md:col-span-2">{milestoneMetricOptions.map(metric => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}</select>
                                        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={milestone.active !== false && !milestone.draft && !milestone.archived} onChange={e => updateProfileMilestone(index, { active: e.target.checked, draft: !e.target.checked, archived: false })} /> Publish active</label>
                                        <input type="number" min="1" value={milestone.requirement} onChange={e => updateProfileMilestone(index, { requirement: Number(e.target.value) || 1 })} placeholder="Requirement" className="rounded border p-2" />
                                        <input type="number" min="0" value={milestone.coinReward || 0} onChange={e => updateProfileMilestone(index, { coinReward: Number(e.target.value) || 0 })} placeholder="Coins" className="rounded border p-2" />
                                        <input value={milestone.actionLabel} onChange={e => updateProfileMilestone(index, { actionLabel: e.target.value })} placeholder="Button label" className="rounded border p-2 md:col-span-2" />
                                        <input value={(milestone.unlockProductIds || []).join(',')} onChange={e => updateProfileMilestone(index, { unlockProductIds: e.target.value.split(',').map(value => Number(value.trim())).filter(Boolean) })} placeholder="Unlock product IDs" className="rounded border p-2 md:col-span-2" />
                                        <button type="button" onClick={() => updateProfileMilestone(index, { active: false, draft: true, archived: false })} className="rounded border border-amber-200 px-3 py-2 text-sm font-bold text-amber-700">Draft</button>
                                        <button type="button" onClick={() => duplicateProfileMilestone(index)} className="rounded border border-indigo-200 px-3 py-2 text-sm font-bold text-indigo-600">Duplicate</button>
                                        <button type="button" onClick={() => archiveProfileMilestone(index)} className="rounded border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">Archive</button>
                                        <textarea value={milestone.description} onChange={e => updateProfileMilestone(index, { description: e.target.value })} placeholder="Description" className="rounded border p-2 md:col-span-6" rows={2} />
                                        <textarea value={milestone.downloadContent || ''} onChange={e => updateProfileMilestone(index, { downloadContent: e.target.value })} placeholder="Optional download text content" className="rounded border p-2 md:col-span-6" rows={2} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );


            case 'reading': return (
                <div className="space-y-5">
                    <div className="rounded-[1.5rem] border border-blue-100 bg-gradient-to-br from-white via-[#F8FBFF] to-[#EEF6FF] p-5 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">Reading typography studio</p>
                        <h4 className="mt-2 text-xl font-black text-slate-900">News and Blog article design</h4>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These controls drive the real mobile and desktop Reading page. Save Changes publishes the fonts, sizes, colors, spacing, quotes and readable content width for every user.</p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
                        <div className="space-y-5">
                            <section className="rounded-xl border bg-white p-4">
                                <h5 className="font-black text-slate-900">Fonts and responsive sizing</h5>
                                <div className="mt-4 space-y-4">
                                    <FormRow label="News heading font" description="Used for News article and announcement titles/headings.">
                                        <select value={readingStyle.newsHeadingFont} onChange={e => updateReadingStyle('newsHeadingFont', e.target.value)} className="w-full rounded border p-2">
                                            {['Merriweather','Montserrat','Lato','Inter','Roboto','Oswald'].map(font => <option key={`news-font-${font}`} value={font}>{font}</option>)}
                                        </select>
                                    </FormRow>
                                    <FormRow label="Blog heading font" description="Used for Blog titles and section headings.">
                                        <select value={readingStyle.blogHeadingFont} onChange={e => updateReadingStyle('blogHeadingFont', e.target.value)} className="w-full rounded border p-2">
                                            {['Montserrat','Merriweather','Lato','Inter','Roboto','Oswald'].map(font => <option key={`blog-font-${font}`} value={font}>{font}</option>)}
                                        </select>
                                    </FormRow>
                                    <FormRow label="Article body font" description="Used for paragraphs, lists and long-form reading.">
                                        <select value={readingStyle.bodyFont} onChange={e => updateReadingStyle('bodyFont', e.target.value)} className="w-full rounded border p-2">
                                            {['Lato','Inter','Roboto','Merriweather','Montserrat'].map(font => <option key={`body-font-${font}`} value={font}>{font}</option>)}
                                        </select>
                                    </FormRow>
                                    <FormRow label={`Mobile title size (${readingStyle.titleSizeMobile}px)`} description="Responsive title size on phones and compact tablets."><input type="range" min="30" max="56" step="1" value={readingStyle.titleSizeMobile} onChange={e => updateReadingStyle('titleSizeMobile', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Desktop title size (${readingStyle.titleSizeDesktop}px)`} description="Maximum title size on larger screens."><input type="range" min="44" max="84" step="1" value={readingStyle.titleSizeDesktop} onChange={e => updateReadingStyle('titleSizeDesktop', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Mobile body size (${readingStyle.bodySizeMobile}px)`} description="Long-form paragraph size on mobile."><input type="range" min="15" max="22" step="1" value={readingStyle.bodySizeMobile} onChange={e => updateReadingStyle('bodySizeMobile', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Desktop body size (${readingStyle.bodySizeDesktop}px)`} description="Long-form paragraph size on desktop."><input type="range" min="16" max="25" step="1" value={readingStyle.bodySizeDesktop} onChange={e => updateReadingStyle('bodySizeDesktop', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Line height (${Number(readingStyle.lineHeight).toFixed(2)})`} description="Controls breathing room between article lines."><input type="range" min="1.45" max="2.2" step="0.05" value={readingStyle.lineHeight} onChange={e => updateReadingStyle('lineHeight', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Readable width (${readingStyle.contentWidth}px)`} description="Maximum paragraph width; narrower lines are easier to read."><input type="range" min="680" max="1080" step="20" value={readingStyle.contentWidth} onChange={e => updateReadingStyle('contentWidth', Number(e.target.value))} className="w-full" /></FormRow>
                                </div>
                            </section>

                            <section className="rounded-xl border bg-white p-4">
                                <h5 className="font-black text-slate-900">Article colors and surfaces</h5>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    {[
                                        ['newsHeadingColor','News heading', readingStyle.newsHeadingColor],
                                        ['blogHeadingColor','Blog heading', readingStyle.blogHeadingColor],
                                        ['bodyTextColor','Body text', readingStyle.bodyTextColor],
                                        ['metadataColor','Metadata', readingStyle.metadataColor],
                                        ['linkColor','Links and bullets', readingStyle.linkColor],
                                        ['quoteBackgroundColor','Quote background', readingStyle.quoteBackgroundColor],
                                        ['quoteBorderColor','Quote border', readingStyle.quoteBorderColor],
                                        ['backgroundColor','Reading background', readingStyle.backgroundColor],
                                        ['accentColor','Accent and progress', readingStyle.accentColor],
                                    ].map(([field,label,value]) => (
                                        <label key={field} className="rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                                            <span className="mb-2 block">{label}</span>
                                            <input type="color" value={String(value)} onChange={e => updateReadingStyle(String(field), e.target.value)} className="h-10 w-full rounded border p-1" />
                                        </label>
                                    ))}
                                </div>
                                <div className="mt-4 space-y-4">
                                    <FormRow label={`Background opacity (${readingStyle.backgroundOpacity}%)`} description="Page overlay solidity."><input type="range" min="55" max="100" step="1" value={readingStyle.backgroundOpacity} onChange={e => updateReadingStyle('backgroundOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Panel opacity (${readingStyle.panelOpacity}%)`} description="Main Reading drawer panel solidity."><input type="range" min="65" max="100" step="1" value={readingStyle.panelOpacity} onChange={e => updateReadingStyle('panelOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Card opacity (${readingStyle.cardOpacity}%)`} description="Article card and header surface solidity."><input type="range" min="55" max="100" step="1" value={readingStyle.cardOpacity} onChange={e => updateReadingStyle('cardOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                    <FormRow label={`Accent softness (${readingStyle.accentOpacity}%)`} description="Strength of decorative reading glow."><input type="range" min="0" max="45" step="1" value={readingStyle.accentOpacity} onChange={e => updateReadingStyle('accentOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                </div>
                            </section>
                        </div>

                        <aside className="xl:sticky xl:top-4 xl:self-start">
                            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-100 p-4">
                                <p className="text-sm font-black text-slate-700">Live Reading preview</p>
                                <div className="mt-4 rounded-[1.5rem] border p-5 shadow-xl" style={{ backgroundColor: readingStyle.backgroundColor }}>
                                    <div className="rounded-[1.25rem] border border-white/70 p-5" style={{ backgroundColor: `rgba(255,255,255,${Number(readingStyle.cardOpacity) / 100})`, maxWidth: `${Math.min(360, Number(readingStyle.contentWidth))}px` }}>
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: readingStyle.metadataColor }}>News desk · 6 min read</p>
                                        <h5 className="mt-3 font-black" style={{ fontFamily: readingFontMap[readingStyle.newsHeadingFont], color: readingStyle.newsHeadingColor, fontSize: `${Math.min(32, Number(readingStyle.titleSizeMobile))}px`, lineHeight: 1.12 }}>A clear headline built for serious reading</h5>
                                        <p className="mt-4" style={{ fontFamily: readingFontMap[readingStyle.bodyFont], color: readingStyle.bodyTextColor, fontSize: `${Math.min(18, Number(readingStyle.bodySizeMobile))}px`, lineHeight: readingStyle.lineHeight }}>Article paragraphs now follow the exact font, color, size, width and spacing configured here.</p>
                                        <blockquote className="mt-4 border-l-4 px-4 py-3 italic" style={{ fontFamily: readingFontMap[readingStyle.newsHeadingFont], color: readingStyle.bodyTextColor, backgroundColor: readingStyle.quoteBackgroundColor, borderColor: readingStyle.quoteBorderColor }}>A focused quote style helps important ideas stand out.</blockquote>
                                        <a className="mt-4 inline-block font-black underline" style={{ color: readingStyle.linkColor }}>Sample article link</a>
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            );
            case 'community': return (
                <div className="space-y-6">
                    <section className="border border-slate-300 bg-white p-5 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Community workspace</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">Layout-aware Community customization</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose the real desktop Community mode first. The color studio below automatically switches to that mode's saved palette, so Social Workspace and Latest UX no longer overwrite one another.</p>
                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                            {([
                                ['classic', 'Classic layout', 'Preserved Community layout with its own palette.'],
                                ['latest', 'Latest desktop UX', 'Clean modern layout without the social three-column rail.'],
                                ['social', 'Social Workspace', 'Three-column feed, internal Community sidebar and right rail.'],
                            ] as const).map(([mode, title, description]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => selectCommunityMode(mode)}
                                    aria-pressed={selectedCommunityMode === mode}
                                    className={`border p-4 text-left transition ${selectedCommunityMode === mode ? 'border-blue-600 bg-blue-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-slate-400'}`}
                                >
                                    <span className="block font-black text-slate-950">{title}</span>
                                    <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">{description}</span>
                                    <span className={`mt-3 inline-flex px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${selectedCommunityMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{selectedCommunityMode === mode ? 'Selected' : 'Choose'}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                        <div className="border border-slate-300 bg-white p-5 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{selectedCommunityMode} palette</p>
                            <h3 className="mt-1 text-xl font-black text-slate-950">
                                {selectedCommunityMode === 'social' ? 'Social Workspace colors' : selectedCommunityMode === 'latest' ? 'Latest desktop colors' : 'Classic Community colors'}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-slate-600">Every control below is connected to the active Community mode. Save Changes publishes this palette without changing the other modes.</p>
                            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {([
                                    ['pageBackground','Page background'],
                                    ['surfaceColor','Main surface'],
                                    ['cardColor','Feed and cards'],
                                    ['softBackground','Soft background'],
                                    ['headerBackground','Header background'],
                                    ['sidebarBackground','Internal sidebar'],
                                    ['composerBackground','Composer'],
                                    ['rightRailBackground','Right rail'],
                                    ['primaryColor','Primary action'],
                                    ['secondaryColor','Secondary action'],
                                    ['accentColor','Accent'],
                                    ['headingColor','Heading text'],
                                    ['bodyColor','Body text'],
                                    ['mutedColor','Muted text'],
                                    ['borderColor','Borders'],
                                    ['activeTabBackground','Active navigation'],
                                    ['activeTabText','Active navigation text'],
                                    ['outgoingBubble','Outgoing bubble'],
                                    ['incomingBubble','Incoming bubble'],
                                    ['dockBackground','Mobile Community dock'],
                                    ['dockItemBackground','Dock item'],
                                    ['dockActiveBackground','Dock active item'],
                                    ['dockTextColor','Dock text'],
                                    ['dockActiveTextColor','Dock active text'],
                                ] as const).map(([field, label]) => (
                                    <label key={field} className="border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                                        <span className="mb-2 block">{label}</span>
                                        <input type="color" value={String(selectedCommunityPalette[field])} onChange={event => updateSelectedCommunityPalette(field, event.target.value)} className="h-10 w-full border p-1" />
                                    </label>
                                ))}
                            </div>
                            <FormRow label={`Shadow opacity (${communityStyle.shadowOpacity}%)`} description="Shared Community card shadow strength.">
                                <input type="range" min="0" max="40" step="1" value={communityStyle.shadowOpacity} onChange={event => updateCommunityStyle('shadowOpacity', Number(event.target.value))} className="w-full" />
                            </FormRow>
                        </div>

                        <aside className="border border-slate-300 bg-slate-100 p-4 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Live {selectedCommunityMode} preview</p>
                            <div className="mt-4 overflow-hidden border shadow-sm" style={{ backgroundColor: selectedCommunityPalette.pageBackground, borderColor: selectedCommunityPalette.borderColor }}>
                                <header className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ backgroundColor: selectedCommunityPalette.headerBackground, borderColor: selectedCommunityPalette.borderColor }}>
                                    <div><p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: selectedCommunityPalette.primaryColor }}>Eduvora Community</p><h4 className="font-black" style={{ color: selectedCommunityPalette.headingColor }}>{selectedCommunityMode === 'social' ? 'Social Workspace' : selectedCommunityMode === 'latest' ? 'Latest Community' : 'Classic Community'}</h4></div>
                                    <span className="px-3 py-1.5 text-[10px] font-black text-white" style={{ backgroundColor: selectedCommunityPalette.primaryColor }}>Action</span>
                                </header>
                                <div className={`grid min-h-[19rem] ${selectedCommunityMode === 'social' ? 'grid-cols-[4.5rem_minmax(0,1fr)_5.5rem]' : 'grid-cols-[4.5rem_minmax(0,1fr)]'}`}>
                                    <aside className="border-r p-2" style={{ backgroundColor: selectedCommunityPalette.sidebarBackground, borderColor: selectedCommunityPalette.borderColor }}>
                                        {[0,1,2,3].map(index => <span key={index} className="mb-2 flex h-9 items-center justify-center border text-xs font-black" style={{ backgroundColor: index === 0 ? selectedCommunityPalette.activeTabBackground : selectedCommunityPalette.softBackground, borderColor: selectedCommunityPalette.borderColor, color: index === 0 ? selectedCommunityPalette.activeTabText : selectedCommunityPalette.mutedColor }}>●</span>)}
                                    </aside>
                                    <main className="min-w-0 p-3" style={{ backgroundColor: selectedCommunityPalette.surfaceColor }}>
                                        <article className="border p-3" style={{ backgroundColor: selectedCommunityPalette.cardColor, borderColor: selectedCommunityPalette.borderColor }}>
                                            <h5 className="font-black" style={{ color: selectedCommunityPalette.headingColor }}>Community feed card</h5>
                                            <p className="mt-2 text-xs font-semibold leading-5" style={{ color: selectedCommunityPalette.bodyColor }}>The selected layout uses this exact card, text, border and accent palette.</p>
                                            <span className="mt-3 inline-flex px-2 py-1 text-[10px] font-black" style={{ backgroundColor: selectedCommunityPalette.accentColor, color: selectedCommunityPalette.primaryColor }}>Selected mode</span>
                                        </article>
                                        <div className="mt-3 border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: selectedCommunityPalette.composerBackground, borderColor: selectedCommunityPalette.borderColor, color: selectedCommunityPalette.mutedColor }}>Write a reply…</div>
                                    </main>
                                    {selectedCommunityMode === 'social' ? <aside className="border-l p-2" style={{ backgroundColor: selectedCommunityPalette.rightRailBackground, borderColor: selectedCommunityPalette.borderColor }}><div className="border p-2 text-[10px] font-black" style={{ backgroundColor: selectedCommunityPalette.cardColor, borderColor: selectedCommunityPalette.borderColor, color: selectedCommunityPalette.headingColor }}>Requests</div><div className="mt-2 border p-2 text-[10px] font-black" style={{ backgroundColor: selectedCommunityPalette.cardColor, borderColor: selectedCommunityPalette.borderColor, color: selectedCommunityPalette.headingColor }}>Suggestions</div></aside> : null}
                                </div>
                            </div>
                        </aside>
                    </section>
                </div>
            );
            case 'dock': return (
                <div className="store-config-dock-studio grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                    <div className="space-y-6">
                        <section className="border border-slate-300 bg-white p-5 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Real navigation deployment</p>
                            <h2 className="mt-1 text-2xl font-black text-slate-950">Dock Settings</h2>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Every control below is connected to the actual mobile dock and desktop navigation. Community-only controls have moved to the Community tab.</p>
                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                <label className="border border-slate-200 bg-slate-50 p-4">
                                    <span className="block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Desktop navigation</span>
                                    <select value={desktopNavigationMode} onChange={e => handleNestedChange('desktop', 'navigationMode', e.target.value as 'sidebar' | 'dock')} className="mt-2 w-full border border-slate-300 bg-white px-3 py-2.5 font-bold text-slate-900">
                                        <option value="sidebar">Expanded side panel</option>
                                        <option value="dock">Bottom dock</option>
                                    </select>
                                    <span className="mt-2 block text-xs leading-5 text-slate-500">Bottom dock mode now genuinely renders on desktop with numeric badges and no glow.</span>
                                </label>
                                <div className="grid gap-2 border border-slate-200 bg-slate-50 p-4">
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Show mobile dock</span><input type="checkbox" checked={dockStyle.mobileEnabled !== false} onChange={e => updateDockStyle('mobileEnabled', e.target.checked)} className="h-5 w-5" /></label>
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Keep dock on all main pages</span><input type="checkbox" checked={dockStyle.persistAcrossPages !== false} onChange={e => updateDockStyle('persistAcrossPages', e.target.checked)} className="h-5 w-5" /></label>
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Show labels</span><input type="checkbox" checked={dockStyle.showLabels !== false} onChange={e => updateDockStyle('showLabels', e.target.checked)} className="h-5 w-5" /></label>
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Show numeric badges</span><input type="checkbox" checked={dockStyle.showBadges !== false} onChange={e => updateDockStyle('showBadges', e.target.checked)} className="h-5 w-5" /></label>
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>Auto-hide bottom dock on scroll</span><input type="checkbox" checked={dockStyle.autoHideOnScroll === true} onChange={e => updateDockStyle('autoHideOnScroll', e.target.checked)} className="h-5 w-5" /></label>
                                </div>
                            </div>
                        </section>

                        <section className="border border-slate-300 bg-white p-5 shadow-sm">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div><h3 className="text-lg font-black text-slate-950">Items and order</h3><p className="mt-1 text-sm text-slate-600">Home is required. Reorder the rest; the same saved order is used by mobile dock, desktop bottom dock and side panel.</p></div>
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{selectedDockItems.length} active</span>
                            </div>
                            <div className="mt-4 divide-y divide-slate-200 border border-slate-200">
                                {selectedDockItems.map((label, index) => (
                                    <div key={label} className="flex items-center gap-3 bg-white px-3 py-3">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-xs font-black text-slate-500">{index + 1}</span>
                                        <span className="min-w-0 flex-1 font-black text-slate-900">{label}</span>
                                        <button type="button" onClick={() => moveDockItem(index, -1)} disabled={index <= 1} className="border border-slate-300 px-2.5 py-1.5 text-xs font-black disabled:opacity-30" aria-label={`Move ${label} up`}>↑</button>
                                        <button type="button" onClick={() => moveDockItem(index, 1)} disabled={index === 0 || index >= selectedDockItems.length - 1} className="border border-slate-300 px-2.5 py-1.5 text-xs font-black disabled:opacity-30" aria-label={`Move ${label} down`}>↓</button>
                                        <button type="button" onClick={() => toggleDockItem(label)} disabled={label === 'Home'} className="border border-rose-200 px-2.5 py-1.5 text-xs font-black text-rose-700 disabled:cursor-not-allowed disabled:opacity-30">Remove</button>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {defaultDockItems.filter(label => !selectedDockItems.includes(label)).map(label => <button type="button" key={label} onClick={() => toggleDockItem(label)} className="border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-800">+ {label}</button>)}
                            </div>
                        </section>

                        <section className="border border-slate-300 bg-white p-5 shadow-sm">
                            <h3 className="text-lg font-black text-slate-950">Surface and color</h3>
                            <p className="mt-1 text-sm text-slate-600">The side panel and bottom dock share these saved surfaces.</p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {[
                                    ['backgroundColor','Dock background',dockStyle.backgroundColor], ['itemColor','Item background',dockStyle.itemColor], ['accentColor','Active/accent',dockStyle.accentColor], ['textColor','Text',dockStyle.textColor], ['borderColor','Border',dockStyle.borderColor],
                                ].map(([field,label,value]) => <label key={String(field)} className="border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"><span className="mb-2 block">{label}</span><input type="color" value={String(value)} onChange={e => updateDockStyle(String(field), e.target.value)} className="h-10 w-full border p-1" /></label>)}
                            </div>
                            <div className="mt-4 space-y-1 border-t border-slate-200 pt-2">
                                <FormRow label={`Background opacity (${dockStyle.backgroundOpacity}%)`}><input type="range" min="20" max="100" value={dockStyle.backgroundOpacity} onChange={e => updateDockStyle('backgroundOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Item opacity (${dockStyle.itemOpacity}%)`}><input type="range" min="20" max="100" value={dockStyle.itemOpacity} onChange={e => updateDockStyle('itemOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Accent strength (${dockStyle.accentOpacity}%)`}><input type="range" min="0" max="70" value={dockStyle.accentOpacity} onChange={e => updateDockStyle('accentOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Backdrop blur (${dockStyle.blur}px)`}><input type="range" min="0" max="36" value={dockStyle.blur} onChange={e => updateDockStyle('blur', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label="Shadow depth"><select value={dockStyle.shadowStrength} onChange={e => updateDockStyle('shadowStrength', e.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2"><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></FormRow>
                            </div>
                        </section>

                        <section className="border border-slate-300 bg-white p-5 shadow-sm">
                            <h3 className="text-lg font-black text-slate-950">Sizing and spacing</h3>
                            <div className="mt-3 space-y-1">
                                <FormRow label={`Bottom dock height (${dockStyle.height}px)`}><input type="range" min="58" max="112" value={dockStyle.height} onChange={e => updateDockStyle('height', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Icon size (${dockStyle.iconSize}px)`}><input type="range" min="28" max="52" value={dockStyle.iconSize} onChange={e => updateDockStyle('iconSize', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Label size (${dockStyle.labelSize}px)`}><input type="range" min="9" max="16" value={dockStyle.labelSize} onChange={e => updateDockStyle('labelSize', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Inner padding (${dockStyle.padding}px)`}><input type="range" min="8" max="22" value={dockStyle.padding} onChange={e => updateDockStyle('padding', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Item gap (${dockStyle.gap}px)`}><input type="range" min="4" max="20" value={dockStyle.gap} onChange={e => updateDockStyle('gap', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Dock radius (${dockStyle.radius}px)`}><input type="range" min="0" max="40" value={dockStyle.radius} onChange={e => updateDockStyle('radius', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Item radius (${dockStyle.itemRadius}px)`}><input type="range" min="0" max="28" value={dockStyle.itemRadius} onChange={e => updateDockStyle('itemRadius', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Bottom safe gap (${dockStyle.bottomOffset}px)`}><input type="range" min="0" max="32" value={dockStyle.bottomOffset} onChange={e => updateDockStyle('bottomOffset', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Desktop expanded width (${dockStyle.desktopExpandedWidth}px)`}><input type="range" min="260" max="380" value={dockStyle.desktopExpandedWidth} onChange={e => updateDockStyle('desktopExpandedWidth', Number(e.target.value))} className="w-full" /></FormRow>
                                <FormRow label={`Desktop collapsed width (${dockStyle.desktopCollapsedWidth}px)`}><input type="range" min="72" max="108" value={dockStyle.desktopCollapsedWidth} onChange={e => updateDockStyle('desktopCollapsedWidth', Number(e.target.value))} className="w-full" /></FormRow>
                                <div className="mt-4 border-t border-slate-200 pt-4">
                                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Website side panel only</p>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <label className="border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"><span className="mb-2 block">Side panel colour</span><input type="color" value={sidebarBackgroundColor} onChange={e => updateDockStyle('sidebarBackgroundColor', e.target.value)} className="h-10 w-full border p-1" /></label>
                                        <label className="border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"><span className="mb-2 block">Side panel text colour</span><input type="color" value={sidebarTextColor} onChange={e => updateDockStyle('sidebarTextColor', e.target.value)} className="h-10 w-full border p-1" /></label>
                                        <label className="border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700"><span className="mb-2 block">Side panel border colour</span><input type="color" value={sidebarBorderColor} onChange={e => updateDockStyle('sidebarBorderColor', e.target.value)} className="h-10 w-full border p-1" /></label>
                                        <FormRow label="Website side panel font" description="Custom font for the desktop website side panel labels, heading and helper text.">
                                            <select value={sidebarFontFamily} onChange={e => updateDockStyle('sidebarFontFamily', e.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2 font-bold text-slate-900">
                                                {sidebarFontOptions.map(font => <option key={`sidebar-font-${font}`} value={font}>{font}</option>)}
                                            </select>
                                        </FormRow>
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <FormRow label={`Side panel transparency (${sidebarBackgroundOpacity}%)`}><input type="range" min="20" max="100" value={sidebarBackgroundOpacity} onChange={e => updateDockStyle('sidebarBackgroundOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                        <FormRow label={`Font transparency (${sidebarTextOpacity}%)`}><input type="range" min="35" max="100" value={sidebarTextOpacity} onChange={e => updateDockStyle('sidebarTextOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                        <section className="border border-slate-300 bg-slate-950 p-4 text-white shadow-lg">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">Live mobile / bottom dock</p>
                            <div className="mt-4 overflow-hidden border" style={{ backgroundColor: `${dockStyle.backgroundColor}${Math.round((Number(dockStyle.backgroundOpacity) / 100) * 255).toString(16).padStart(2, '0')}`, borderColor: dockStyle.borderColor, borderRadius: Number(dockStyle.radius), padding: Number(dockStyle.padding), minHeight: Number(dockStyle.height), boxShadow: dockStyle.shadowStrength === 'none' ? 'none' : dockStyle.shadowStrength === 'strong' ? '0 22px 52px rgba(15,23,42,0.35)' : '0 12px 30px rgba(15,23,42,0.22)' }}>
                                <div className="flex overflow-hidden" style={{ gap: Number(dockStyle.gap) }}>
                                    {selectedDockItems.slice(0, 4).map((label, index) => <div key={label} className="relative min-w-[4rem] border px-2 py-2 text-center" style={{ backgroundColor: `${dockStyle.itemColor}${Math.round((Number(dockStyle.itemOpacity) / 100) * 255).toString(16).padStart(2, '0')}`, borderColor: index === 0 ? dockStyle.accentColor : dockStyle.borderColor, borderRadius: Number(dockStyle.itemRadius), color: dockStyle.textColor }}><div className="mx-auto flex items-center justify-center bg-white/90" style={{ width: Number(dockStyle.iconSize), height: Number(dockStyle.iconSize), borderRadius: Math.max(4, Number(dockStyle.itemRadius) - 4) }}>{['🏠','🛍️','📚','❤️'][index] || '•'}</div>{dockStyle.showLabels !== false && <p className="mt-1 font-black" style={{ fontSize: Number(dockStyle.labelSize) }}>{label}</p>}{dockStyle.showBadges !== false && index === 1 && <span className="absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 text-[9px] font-black text-white" style={{ backgroundColor: dockStyle.accentColor }}>3</span>}</div>)}
                                </div>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-slate-300">Mobile unseen items keep the required glow. Desktop bottom dock uses this design with numeric badges only.</p>
                        </section>

                        <section className="border border-slate-300 bg-white p-4 shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Desktop side panel preview</p>
                            <div className="mt-4 border p-3" style={{ backgroundColor: `${dockStyle.backgroundColor}${Math.round((Number(dockStyle.backgroundOpacity) / 100) * 255).toString(16).padStart(2, '0')}`, borderColor: dockStyle.borderColor, borderRadius: Number(dockStyle.radius), fontFamily: sidebarFontFamily }}>
                                {selectedDockItems.slice(0, 4).map((label, index) => <div key={label} className="mb-2 flex items-center border px-3 py-2 last:mb-0" style={{ gap: Number(dockStyle.gap), backgroundColor: index === 0 ? dockStyle.accentColor : `${dockStyle.itemColor}${Math.round((Number(dockStyle.itemOpacity) / 100) * 255).toString(16).padStart(2, '0')}`, borderColor: index === 0 ? dockStyle.accentColor : dockStyle.borderColor, borderRadius: Number(dockStyle.itemRadius), color: index === 0 ? '#FFFFFF' : dockStyle.textColor }}><span className="flex items-center justify-center bg-white/90" style={{ width: Number(dockStyle.iconSize), height: Number(dockStyle.iconSize), borderRadius: Math.max(4, Number(dockStyle.itemRadius) - 4) }}>{['🏠','🛍️','📚','❤️'][index] || '•'}</span>{dockStyle.showLabels !== false && <span className="font-black" style={{ fontSize: Number(dockStyle.labelSize) }}>{label}</span>}{dockStyle.showBadges !== false && index === 2 && <span className="ml-auto rounded-full px-2 py-1 text-[9px] font-black text-white" style={{ backgroundColor: dockStyle.accentColor }}>7</span>}</div>)}
                            </div>
                        </section>
                    </aside>
                </div>
            );
            case 'announcements': return <AnnouncementManagement announcements={localSettings.content.announcements} onUpdate={announcements => handleNestedChange('content', 'announcements', announcements)} />;
            case 'services': return <ServiceManagement services={localSettings.content.services} onUpdate={services => handleNestedChange('content', 'services', services)} />;
            case 'faq': return <FaqManagement faqs={localSettings.content.faqs} onUpdate={faqs => handleNestedChange('content', 'faqs', faqs)} />;
            case 'upcoming': return <UpcomingFeatureManagement features={localSettings.content.upcomingFeatures} onUpdate={features => handleNestedChange('content', 'upcomingFeatures', features)} />;
            case 'features': return (
                <div>
                    <FormRow label="Show Wishlist" description="Enable or disable the 'heart' icon and Wishlist page."><input type="checkbox" checked={localSettings.features.showFavourites} onChange={e => handleNestedChange('features', 'showFavourites', e.target.checked)} className="form-checkbox h-5 w-5" /></FormRow>
                    <FormRow label="Show Reviews" description="Enable or disable the entire customer review and rating system."><input type="checkbox" checked={localSettings.features.showReviews} onChange={e => handleNestedChange('features', 'showReviews', e.target.checked)} className="form-checkbox h-5 w-5" /></FormRow>
                    <FormRow label="Show Sale Badges" description="Show or hide the 'SALE' badge on product cards."><input type="checkbox" checked={localSettings.features.showSaleBadges} onChange={e => handleNestedChange('features', 'showSaleBadges', e.target.checked)} className="form-checkbox h-5 w-5" /></FormRow>
                    <FormRow label="Hide footer on mobile for all users" description="When enabled, the global footer is hidden only on mobile viewports and remains visible on tablet/desktop. This is saved to Firebase website settings."><input type="checkbox" checked={Boolean(localSettings.mobile?.hideFooter)} onChange={e => handleNestedChange('mobile', 'hideFooter', e.target.checked)} className="form-checkbox h-5 w-5" /></FormRow>
                </div>
            );
            case 'animations': return (
                <div>
                     <FormRow label="Turn off homepage animations" description="Switch this on to disable non-essential homepage motion, pulse/bounce effects, and heavy transitions for smoother scrolling on mobile."><input type="checkbox" checked={!localSettings.animations.enabled} onChange={e => handleNestedChange('animations', 'enabled', !e.target.checked)} className="form-checkbox h-5 w-5" /></FormRow>
                </div>
            );
            default: return null;
        }
    };

    return (
        <div className="store-config-workspace overflow-hidden border border-slate-300 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Site Customizer</h1>
                    <p className="text-slate-600 mt-1">Section buttons and toggles update this local draft first. Click Save Changes to publish them to the website.</p>{isDirty && <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-black text-amber-800">Unsaved changes — click Save Changes to publish.</p>}{saveStatus === 'success' && <p className="mt-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-black text-emerald-800">Settings saved and synced.</p>}{saveStatus === 'failed' && <p className="mt-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-black text-rose-800">Saved locally but cloud sync failed. Please retry when online.</p>}
                </div>
                <button onClick={handleSave} disabled={!isDirty || saveStatus === 'saving'} className={`mt-4 md:mt-0 rounded-lg px-6 py-2.5 font-bold text-white transition-colors relative ${isDirty ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:bg-blue-700' : 'bg-slate-400 opacity-60'}`}>
                    {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 pt-2 custom-scrollbar">
                <TabButton label="Theme" isActive={activeTab === 'theme'} onClick={() => setActiveTab('theme')} />
                <TabButton label="Layout" isActive={activeTab === 'layout'} onClick={() => setActiveTab('layout')} />
                <TabButton label="Content" isActive={activeTab === 'content'} onClick={() => setActiveTab('content')} />
                <TabButton label="Subscriptions" isActive={activeTab === 'subscriptions'} onClick={() => setActiveTab('subscriptions')} />
                <TabButton label="Reading" isActive={activeTab === 'reading'} onClick={() => setActiveTab('reading')} />
                <TabButton label="Profile" isActive={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                <TabButton label="Community" isActive={activeTab === 'community'} onClick={() => setActiveTab('community')} />
                <TabButton label="Dock" isActive={activeTab === 'dock'} onClick={() => setActiveTab('dock')} />
                <TabButton label="Announcements" isActive={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')} />
                <TabButton label="Services" isActive={activeTab === 'services'} onClick={() => setActiveTab('services')} />
                <TabButton label="FAQ" isActive={activeTab === 'faq'} onClick={() => setActiveTab('faq')} />
                <TabButton label="Upcoming" isActive={activeTab === 'upcoming'} onClick={() => setActiveTab('upcoming')} />
                <TabButton label="Features" isActive={activeTab === 'features'} onClick={() => setActiveTab('features')} />
                <TabButton label="Animations" isActive={activeTab === 'animations'} onClick={() => setActiveTab('animations')} />
            </div>

            <div className="p-5">{renderContent()}</div>
        </div>
    );
};

export default WebsiteSettingsComponent;
