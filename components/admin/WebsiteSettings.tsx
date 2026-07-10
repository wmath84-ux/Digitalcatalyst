
import React, { useState, useEffect } from 'react';
import { WebsiteSettings, HomepageSection, Announcement, ProductWithRating, ProfileMilestoneConfig, ProfileStreakConfig, ProfileMilestoneMetric, ProfileStreakMetric } from '../../App';
import { ServiceItem } from '../Services';
import { FaqItem } from '../Faq';
import { UpcomingFeatureItem } from '../UpcomingFeatures';
import { defaultDockStyle, dockCustomizationItems } from '../BottomGlassDock';
import PremiumImageUrlInput from '../common/PremiumImageUrlInput';

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
        className={`py-2 px-4 font-semibold text-sm rounded-lg transition-colors whitespace-nowrap ${
            isActive ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
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

type EditableSubscriptionPlan = { id: string; name: string; price: number; coinPrice?: number; description: string; unlockProductIds: number[]; badge?: string; };
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

const WebsiteSettingsComponent: React.FC<WebsiteSettingsProps> = ({ settings, products = [], onSettingsChange }) => {
    const [activeTab, setActiveTab] = useState<'theme' | 'layout' | 'content' | 'reading' | 'profile' | 'dock' | 'announcements' | 'services' | 'faq' | 'upcoming' | 'features' | 'animations'>('theme');
    const [localSettings, setLocalSettings] = useState<WebsiteSettings>(settings);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'failed'>('idle');

    useEffect(() => {
        setLocalSettings(settings);
        setSaveStatus('idle');
    }, [settings]);

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

    const subscriptionPlans = (((localSettings.content as any).subscriptionPlans || []) as EditableSubscriptionPlan[]).map(plan => ({
        ...plan,
        coinPrice: Number(plan.coinPrice || 0),
        unlockProductIds: plan.unlockProductIds || [],
    }));
    const redeemRewards = (((localSettings.content as any).redeemRewards || []) as EditableReward[]);
    const eduCoinRules = ((localSettings.content as any).eduCoinRules || { purchase: 25, redeemRate: 10 }) as { purchase: number; redeemRate: number };
    const dockItems = (((localSettings.content as any).dockItems || []) as string[]);
    const dockStyle = { backgroundColor: '#FBFDFF', backgroundOpacity: 92, itemOpacity: 96, accentOpacity: 22, height: 76, iconSize: 36, labelSize: 11, padding: 12, ...((localSettings.content as any).dockStyle || {}) };
    const desktopNavigationMode = localSettings.desktop?.navigationMode === 'dock' ? 'dock' : 'sidebar';
    const communityStyle = {
        desktopLayout: 'latest',
        mobileLayout: 'latest',
        desktopSocialLayout: false,
        pageBackground: '#F8FBFF',
        surfaceColor: '#FFFFFF',
        cardColor: '#FFFFFF',
        softBackground: '#EEF6FF',
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
        shadowOpacity: 16,
        ...((localSettings.content as any).communityStyle || {}),
    };
    const latestDesktopCommunityLayout = communityStyle.desktopLayout !== 'classic';
    const latestMobileCommunityLayout = communityStyle.mobileLayout !== 'classic';
    const socialDesktopCommunityLayout = Boolean(communityStyle.desktopSocialLayout);
    const readingStyle = { backgroundColor: '#F8FAFD', backgroundOpacity: 98, panelOpacity: 96, cardOpacity: 94, accentColor: '#C2E7FF', accentOpacity: 66, ...((localSettings.content as any).readingStyle || {}) };
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
    const defaultDockItems = dockCustomizationItems;
    const selectedDockItems = dockItems.length ? dockItems : defaultDockItems;

    const updatePlan = (planIndex: number, updates: Partial<EditableSubscriptionPlan>) => {
        const nextPlans = subscriptionPlans.map((plan, index) => index === planIndex ? { ...plan, ...updates } : plan);
        updateContentValue('subscriptionPlans', nextPlans);
    };

    const addPlan = () => {
        updateContentValue('subscriptionPlans', [
            ...subscriptionPlans,
            { id: `plan-${Date.now()}`, name: 'New Plan', price: 299, coinPrice: 0, description: 'Describe this plan', unlockProductIds: [] },
        ]);
    };

    const removePlan = (planIndex: number) => {
        updateContentValue('subscriptionPlans', subscriptionPlans.filter((_, index) => index !== planIndex));
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
        const nextItems = selectedDockItems.includes(label)
            ? selectedDockItems.filter(item => item !== label)
            : [...selectedDockItems, label];
        updateContentValue('dockItems', nextItems);
    };

    const updateDockStyle = (field: string, value: string | number) => {
        updateContentValue('dockStyle', { ...dockStyle, [field]: value });
    };

    const updateCommunityStyle = (field: string, value: string | number | boolean) => {
        updateContentValue('communityStyle', { ...communityStyle, [field]: value });
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
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'immersive') === 'original'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'original')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'immersive') === 'original'
                                        ? 'border-blue-600 bg-blue-600 text-white shadow-lg'
                                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300'
                                }`}
                            >
                                <span className="block text-base font-black">Current / Original Colours</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'immersive') === 'original' ? 'text-white/85' : 'text-slate-500'}`}>Restores the website appearance exactly as it exists before the immersive layer.</span>
                            </button>
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'immersive') === 'immersive'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'immersive')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'immersive') === 'immersive'
                                        ? 'border-blue-600 bg-blue-600 text-white shadow-lg'
                                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300'
                                }`}
                            >
                                <span className="block text-base font-black">Immersive Colours</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'immersive') === 'immersive' ? 'text-white/85' : 'text-slate-500'}`}>Applies the solid, eye-comfortable palette across the complete website without decorative gradients.</span>
                            </button>
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'immersive') === 'warm'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'warm')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'immersive') === 'warm'
                                        ? 'border-[#7A4A3A] bg-[#7A4A3A] text-white shadow-lg'
                                        : 'border-[#DED4C6] bg-[#FFFEFB] text-[#2F2925] hover:border-[#A56A4F]'
                                }`}
                            >
                                <span className="block text-base font-black">Warm Chocolate Cream</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'immersive') === 'warm' ? 'text-white/85' : 'text-[#6F625B]'}`}>Uses the calm cream, ivory and chocolate colour direction from the Community profile experience.</span>
                            </button>
                            <button
                                type="button"
                                aria-pressed={(localSettings.theme.colorExperience || 'immersive') === 'modern-white'}
                                onClick={() => handleNestedChange('theme', 'colorExperience', 'modern-white')}
                                className={`rounded-2xl border p-4 text-left transition ${
                                    (localSettings.theme.colorExperience || 'immersive') === 'modern-white'
                                        ? 'border-slate-950 bg-slate-950 text-white shadow-lg'
                                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300'
                                }`}
                            >
                                <span className="block text-base font-black">Modern White</span>
                                <span className={`mt-1 block text-xs font-semibold leading-5 ${(localSettings.theme.colorExperience || 'immersive') === 'modern-white' ? 'text-white/85' : 'text-slate-500'}`}>Uses crisp white cards, soft neutral pages and modern blue actions like current premium apps.</span>
                            </button>
                        </div>
                    </section>
                    <div className="mb-4">
                        <h3 className="text-lg font-black text-slate-900">Original palette controls</h3>
                        <p className="mt-1 text-sm text-slate-600">These detailed colours remain available for Current / Original Colours mode.</p>
                    </div>
                    <FormRow label="Primary Color" description="Main brand color for headers, buttons, and links.">
                        <input type="color" value={localSettings.theme.primaryColor} onChange={e => handleNestedChange('theme', 'primaryColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                    </FormRow>
                    <FormRow label="Accent Color" description="Used for highlights and secondary elements.">
                        <input type="color" value={localSettings.theme.accentColor} onChange={e => handleNestedChange('theme', 'accentColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                    </FormRow>
                    <FormRow label="Background Color" description="The main background color for most pages.">
                        <input type="color" value={localSettings.theme.backgroundColor} onChange={e => handleNestedChange('theme', 'backgroundColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                    </FormRow>
                    <FormRow label="Text Color" description="Main text color.">
                        <input type="color" value={localSettings.theme.textColor} onChange={e => handleNestedChange('theme', 'textColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                    </FormRow>
                    <FormRow label="Typography" description="Choose a font pairing for your site.">
                        <select value={localSettings.theme.fontPairing} onChange={e => handleNestedChange('theme', 'fontPairing', e.target.value)} className="w-full p-2 border rounded">
                            <option value="inter-lato">Inter & Lato</option>
                            <option value="roboto-merriweather">Roboto & Merriweather</option>
                            <option value="montserrat-oswald">Montserrat & Oswald</option>
                        </select>
                    </FormRow>
                     <FormRow label="Corner Radius" description="Controls the roundness of buttons and cards.">
                        <input type="range" min="0" max="2" step="0.1" value={parseFloat(localSettings.theme.cornerRadius)} onChange={e => handleNestedChange('theme', 'cornerRadius', `${e.target.value}rem`)} className="w-full" />
                    </FormRow>
                     <FormRow label="Shadow Intensity" description="Controls the depth of shadows on cards.">
                        <select value={localSettings.theme.shadowIntensity} onChange={e => handleNestedChange('theme', 'shadowIntensity', e.target.value)} className="w-full p-2 border rounded">
                            <option value="light">Light</option>
                            <option value="medium">Medium</option>
                            <option value="heavy">Heavy</option>
                        </select>
                    </FormRow>
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

                        <div className="mt-5 rounded-xl border bg-white p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h4 className="font-bold text-gray-800">Subscription Plans</h4>
                                    <p className="text-sm text-slate-600">Plan name, price, description, badge, and products to unlock.</p>
                                </div>
                                <button type="button" onClick={addPlan} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">+ Add Plan</button>
                            </div>
                            <div className="mt-4 space-y-4">
                                {subscriptionPlans.map((plan, planIndex) => (
                                    <div key={plan.id || planIndex} className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                                            <label className="text-sm font-semibold text-gray-700">Plan Name
                                                <input value={plan.name} onChange={e => updatePlan(planIndex, { name: e.target.value })} className="mt-1 w-full rounded border p-2" />
                                            </label>
                                            <label className="text-sm font-semibold text-gray-700">Price (₹)
                                                <input type="number" min="0" value={plan.price} onChange={e => updatePlan(planIndex, { price: Number(e.target.value) || 0 })} className="mt-1 w-full rounded border p-2" />
                                            </label>
                                            <label className="text-sm font-semibold text-gray-700">Badge Text
                                                <input value={plan.badge || ''} onChange={e => updatePlan(planIndex, { badge: e.target.value })} placeholder="Popular / Best Value" className="mt-1 w-full rounded border p-2" />
                                            </label>
                                            <label className="text-sm font-semibold text-gray-700">EduCoin Price (0 disables)
                                                <input type="number" min="0" value={plan.coinPrice || 0} onChange={e => updatePlan(planIndex, { coinPrice: Number(e.target.value) || 0 })} className="mt-1 w-full rounded border p-2" />
                                            </label>
                                            <button type="button" onClick={() => removePlan(planIndex)} className="mt-6 rounded border border-red-200 px-3 py-2 text-sm font-bold text-red-600">Remove Plan</button>
                                        </div>
                                        <label className="mt-3 block text-sm font-semibold text-gray-700">Description
                                            <textarea value={plan.description} onChange={e => updatePlan(planIndex, { description: e.target.value })} rows={2} className="mt-1 w-full rounded border p-2" />
                                        </label>
                                        <div className="mt-3">
                                            <p className="text-sm font-semibold text-gray-700">Products unlocked by this plan</p>
                                            {products.length ? (
                                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    {products.map(product => (
                                                        <label key={product.id} className="flex items-center gap-2 rounded-lg border bg-white p-2 text-sm text-gray-700">
                                                            <input type="checkbox" checked={(plan.unlockProductIds || []).includes(product.id)} onChange={() => togglePlanProduct(planIndex, product.id)} />
                                                            <span className="font-semibold">{product.title}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : (
                                                <input value={(plan.unlockProductIds || []).join(', ')} onChange={e => updatePlan(planIndex, { unlockProductIds: e.target.value.split(',').map(value => Number(value.trim())).filter(Boolean) })} placeholder="Product IDs e.g. 1, 2, 3" className="mt-2 w-full rounded border p-2" />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">News & Blog Reading Colors</h4>
                        <p className="text-sm text-slate-600">Customize the reading hub and news/blog section for every user. Keep opacity moderate for easy reading.</p>
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
                            <div className="space-y-4">
                                <FormRow label="Reading Background" description="Soft page background behind news/blog and reading drawer.">
                                    <input type="color" value={readingStyle.backgroundColor} onChange={e => updateReadingStyle('backgroundColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                                </FormRow>
                                <FormRow label={`Background Dim (${readingStyle.backgroundOpacity}%)`} description="Higher value makes the reading surface more dim/solid, but not dark.">
                                    <input type="range" min="55" max="100" step="1" value={readingStyle.backgroundOpacity} onChange={e => updateReadingStyle('backgroundOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <FormRow label={`Drawer Panel Opacity (${readingStyle.panelOpacity}%)`} description="Controls the main drawer glass panel transparency.">
                                    <input type="range" min="65" max="100" step="1" value={readingStyle.panelOpacity} onChange={e => updateReadingStyle('panelOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <FormRow label={`Card Opacity (${readingStyle.cardOpacity}%)`} description="Controls cards and header glass surfaces in reading mode.">
                                    <input type="range" min="45" max="100" step="1" value={readingStyle.cardOpacity} onChange={e => updateReadingStyle('cardOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <FormRow label="Accent Color" description="Used for progress, chips, and subtle reading highlights.">
                                    <input type="color" value={readingStyle.accentColor} onChange={e => updateReadingStyle('accentColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                                </FormRow>
                                <FormRow label={`Accent Softness (${readingStyle.accentOpacity}%)`} description="Controls how strong the colored background glow appears.">
                                    <input type="range" min="0" max="45" step="1" value={readingStyle.accentOpacity} onChange={e => updateReadingStyle('accentOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
                                <p className="text-sm font-bold text-slate-700">Live Preview</p>
                                <div className="mt-4 rounded-[2rem] border border-white/50 p-4 shadow-xl" style={{ backgroundColor: `${readingStyle.backgroundColor}${Math.round((Number(readingStyle.backgroundOpacity) / 100) * 255).toString(16).padStart(2, '0')}` }}>
                                    <div className="rounded-[1.5rem] border border-white/50 p-4" style={{ backgroundColor: `rgba(255,255,255,${Number(readingStyle.cardOpacity) / 100})` }}>
                                        <div className="mb-3 h-2 rounded-full" style={{ backgroundColor: readingStyle.accentColor, opacity: Number(readingStyle.accentOpacity) / 100 }} />
                                        <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-700">Reading Mode</p>
                                        <h5 className="mt-2 text-lg font-black text-slate-900">Comfortable article preview</h5>
                                        <p className="mt-2 text-sm leading-6 text-slate-600">Soft dim background, readable cards, and controlled accent glow.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
            case 'dock': return (
                <div className="space-y-5">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-[#F4F9FA] via-white to-[#EEF4FF] p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Community desktop experience</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">Use latest clean Community UX</h4>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Latest is the default. Turn this switch off and save to restore the preserved classic desktop layout. Mobile Community layout and behaviour remain unchanged.</p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center gap-3">
                                <input type="checkbox" className="peer sr-only" checked={latestDesktopCommunityLayout} onChange={e => updateCommunityStyle('desktopLayout', e.target.checked ? 'latest' : 'classic')} />
                                <span className="relative h-8 w-14 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition-transform peer-checked:after:translate-x-6" />
                                <span className="min-w-[4.5rem] text-sm font-black text-slate-700">{latestDesktopCommunityLayout ? 'Latest' : 'Classic'}</span>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-emerald-100 bg-gradient-to-br from-[#EAF7F4] via-white to-[#EAF2FF] p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Alternative desktop community</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">Enable classic social workspace UX</h4>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Adds the reference-style three-column desktop workspace with compact identity/navigation, stories, a readable single-column media feed, full-page post threads, requests, suggestions and contacts. Turning it off instantly returns to the preserved Classic/Latest desktop selector above. Mobile Community stays unchanged.</p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center gap-3">
                                <input type="checkbox" className="peer sr-only" checked={socialDesktopCommunityLayout} onChange={e => updateCommunityStyle('desktopSocialLayout', e.target.checked)} />
                                <span className="relative h-8 w-14 rounded-full bg-slate-300 transition peer-checked:bg-emerald-600 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition-transform peer-checked:after:translate-x-6" />
                                <span className="min-w-[4.5rem] text-sm font-black text-slate-700">{socialDesktopCommunityLayout ? 'Social' : 'Existing'}</span>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">Community mobile experience</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">Use latest clean mobile Community UX</h4>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Latest is the default. It keeps the existing Community logic while applying the cleaner phone header, feed tabs, cards, post view, reply composer and bottom navigation. Turn it off and save to restore the preserved classic mobile layout.</p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center gap-3">
                                <input type="checkbox" className="peer sr-only" checked={latestMobileCommunityLayout} onChange={e => updateCommunityStyle('mobileLayout', e.target.checked ? 'latest' : 'classic')} />
                                <span className="relative h-8 w-14 rounded-full bg-slate-300 transition peer-checked:bg-cyan-600 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition-transform peer-checked:after:translate-x-6" />
                                <span className="min-w-[4.5rem] text-sm font-black text-slate-700">{latestMobileCommunityLayout ? 'Latest' : 'Classic'}</span>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Desktop navigation</p>
                                <h4 className="mt-1 text-lg font-black text-slate-900">Use expanded side panel</h4>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Enabled by default. Turn it off and save to restore the existing bottom dock on desktop. Mobile dock behavior stays unchanged.</p>
                            </div>
                            <label className="relative inline-flex cursor-pointer items-center gap-3">
                                <input type="checkbox" className="peer sr-only" checked={desktopNavigationMode === 'sidebar'} onChange={e => handleNestedChange('desktop', 'navigationMode', e.target.checked ? 'sidebar' : 'dock')} />
                                <span className="relative h-8 w-14 rounded-full bg-slate-300 transition peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-violet-600 after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-md after:transition-transform peer-checked:after:translate-x-6" />
                                <span className="min-w-[4.5rem] text-sm font-black text-slate-700">{desktopNavigationMode === 'sidebar' ? 'Side panel' : 'Bottom dock'}</span>
                            </label>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">Navigation Items</h4>
                        <p className="text-sm text-slate-600">Choose which labels appear in both the desktop side panel and preserved bottom dock.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {defaultDockItems.map(label => (
                                <button type="button" key={label} onClick={() => toggleDockItem(label)} className={`rounded-full border px-4 py-2 text-sm font-bold ${selectedDockItems.includes(label) ? 'border-blue-600 bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'border-slate-200/80 bg-slate-100/80 text-gray-700'}`}>{label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">Community Color Customization</h4>
                        <p className="text-sm text-slate-600">These colors globally apply to every user's Community screen, mobile community dock, sidebar, cards, tabs, and chat surfaces.</p>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormRow label="Community Page Background"><input type="color" value={communityStyle.pageBackground} onChange={e => updateCommunityStyle('pageBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Surface Color"><input type="color" value={communityStyle.surfaceColor} onChange={e => updateCommunityStyle('surfaceColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Card Color"><input type="color" value={communityStyle.cardColor} onChange={e => updateCommunityStyle('cardColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Soft Background"><input type="color" value={communityStyle.softBackground} onChange={e => updateCommunityStyle('softBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Primary Color"><input type="color" value={communityStyle.primaryColor} onChange={e => updateCommunityStyle('primaryColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Secondary Color"><input type="color" value={communityStyle.secondaryColor} onChange={e => updateCommunityStyle('secondaryColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Accent Color"><input type="color" value={communityStyle.accentColor} onChange={e => updateCommunityStyle('accentColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Heading Text"><input type="color" value={communityStyle.headingColor} onChange={e => updateCommunityStyle('headingColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Body Text"><input type="color" value={communityStyle.bodyColor} onChange={e => updateCommunityStyle('bodyColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Muted Text"><input type="color" value={communityStyle.mutedColor} onChange={e => updateCommunityStyle('mutedColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Border Color"><input type="color" value={communityStyle.borderColor} onChange={e => updateCommunityStyle('borderColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Active Tab Background"><input type="color" value={communityStyle.activeTabBackground} onChange={e => updateCommunityStyle('activeTabBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Active Tab Text"><input type="color" value={communityStyle.activeTabText} onChange={e => updateCommunityStyle('activeTabText', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Outgoing Bubble"><input type="color" value={communityStyle.outgoingBubble} onChange={e => updateCommunityStyle('outgoingBubble', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Incoming Bubble"><input type="color" value={communityStyle.incomingBubble} onChange={e => updateCommunityStyle('incomingBubble', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label={`Shadow Opacity (${communityStyle.shadowOpacity}%)`}><input type="range" min="0" max="40" step="1" value={communityStyle.shadowOpacity} onChange={e => updateCommunityStyle('shadowOpacity', Number(e.target.value))} className="w-full" /></FormRow>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">Community Dock Color Customization</h4>
                        <p className="text-sm text-slate-600">These colors globally apply to the mobile community dock buttons.</p>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <FormRow label="Community Dock Background"><input type="color" value={communityStyle.dockBackground} onChange={e => updateCommunityStyle('dockBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Dock Item Background"><input type="color" value={communityStyle.dockItemBackground} onChange={e => updateCommunityStyle('dockItemBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Active Dock Background"><input type="color" value={communityStyle.dockActiveBackground} onChange={e => updateCommunityStyle('dockActiveBackground', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Dock Text Color"><input type="color" value={communityStyle.dockTextColor} onChange={e => updateCommunityStyle('dockTextColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                            <FormRow label="Active Dock Text"><input type="color" value={communityStyle.dockActiveTextColor} onChange={e => updateCommunityStyle('dockActiveTextColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" /></FormRow>
                        </div>

                        <div className="mt-5 rounded-[2rem] border border-slate-200 bg-slate-100 p-4">
                            <p className="text-sm font-bold text-slate-700">Community Dock Preview</p>
                            <div className="mt-4 flex gap-2 overflow-hidden rounded-[1.65rem] border p-2 shadow-xl" style={{ backgroundColor: communityStyle.dockBackground, borderColor: communityStyle.borderColor }}>
                                {['Feed', 'Status', 'Chat'].map((label, index) => (
                                    <div key={label} className="min-w-[76px] rounded-[1.2rem] px-2 py-2 text-center" style={{ backgroundColor: index === 0 ? communityStyle.dockActiveBackground : communityStyle.dockItemBackground, color: index === 0 ? communityStyle.dockActiveTextColor : communityStyle.dockTextColor }}>
                                        <span className="block text-xl">{index === 0 ? '📢' : index === 1 ? '⭕' : '💬'}</span>
                                        <span className="text-[10px] font-black">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                        <h4 className="font-bold text-gray-800">Dock Color & Transparency</h4>
                        <p className="text-sm text-slate-600">These saved values control the preserved bottom dock and the matching desktop side-panel surfaces.</p>
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
                            <div className="space-y-4">
                                <FormRow label="Dock Background Color" description="Main dark/glass color behind the dock.">
                                    <input type="color" value={dockStyle.backgroundColor} onChange={e => updateDockStyle('backgroundColor', e.target.value)} className="w-full h-10 p-1 border rounded-md" />
                                </FormRow>
                                <FormRow label={`Dock Transparency (${dockStyle.backgroundOpacity}%)`} description="Higher value means a darker, less transparent dock.">
                                    <input type="range" min="20" max="100" step="1" value={dockStyle.backgroundOpacity} onChange={e => updateDockStyle('backgroundOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <FormRow label={`Item Transparency (${dockStyle.itemOpacity}%)`} description="Controls the small glass tile behind every dock icon.">
                                    <input type="range" min="0" max="40" step="1" value={dockStyle.itemOpacity} onChange={e => updateDockStyle('itemOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <FormRow label={`Accent Saturation (${dockStyle.accentOpacity}%)`} description="Controls the colored gradient glow inside each dock item.">
                                    <input type="range" min="0" max="85" step="1" value={dockStyle.accentOpacity} onChange={e => updateDockStyle('accentOpacity', Number(e.target.value))} className="w-full" />
                                </FormRow>
                                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                                    <h5 className="font-black text-slate-900">Dock Size Customization</h5>
                                    <p className="text-xs text-slate-600">Preview and save responsive dock sizing without changing dock navigation behavior.</p>
                                    <div className="mt-3 space-y-4">
                                        <FormRow label={`Dock Height (${dockStyle.height}px)`} description="Controls the minimum glass dock height.">
                                            <input type="range" min="58" max="112" step="1" value={dockStyle.height} onChange={e => updateDockStyle('height', Number(e.target.value))} className="w-full" />
                                        </FormRow>
                                        <FormRow label={`Icon Size (${dockStyle.iconSize}px)`} description="Controls each dock icon bubble size.">
                                            <input type="range" min="28" max="52" step="1" value={dockStyle.iconSize} onChange={e => updateDockStyle('iconSize', Number(e.target.value))} className="w-full" />
                                        </FormRow>
                                        <FormRow label={`Label Size (${dockStyle.labelSize}px)`} description="Controls dock label typography size.">
                                            <input type="range" min="9" max="14" step="1" value={dockStyle.labelSize} onChange={e => updateDockStyle('labelSize', Number(e.target.value))} className="w-full" />
                                        </FormRow>
                                        <FormRow label={`Dock Padding (${dockStyle.padding}px)`} description="Controls the dock inner padding rhythm.">
                                            <input type="range" min="8" max="22" step="1" value={dockStyle.padding} onChange={e => updateDockStyle('padding', Number(e.target.value))} className="w-full" />
                                        </FormRow>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4">
                                <p className="text-sm font-bold text-slate-700">Live Preview</p>
                                <div className="mt-4 rounded-[2rem] border border-blue-100 shadow-xl" style={{ backgroundColor: `${dockStyle.backgroundColor}${Math.round((Number(dockStyle.backgroundOpacity) / 100) * 255).toString(16).padStart(2, '0')}`, minHeight: Number(dockStyle.height), padding: Number(dockStyle.padding) }}>
                                    <div className="flex gap-2 overflow-hidden">
                                        {defaultDockItems.slice(0, 4).map(label => (
                                            <div key={label} className="min-w-[4.25rem] rounded-2xl border border-white/10 px-3 py-2 text-center text-white" style={{ backgroundColor: `rgba(255,255,255,${Number(dockStyle.itemOpacity) / 100})` }}>
                                                <div className="mx-auto rounded-xl bg-gradient-to-br from-blue-600 to-violet-500" style={{ opacity: Number(dockStyle.accentOpacity) / 100, width: Number(dockStyle.iconSize), height: Number(dockStyle.iconSize) }} />
                                                <p className="mt-1 font-black" style={{ fontSize: Number(dockStyle.labelSize) }}>{label}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
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
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.04)] border">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 border-b pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Site Customizer</h1>
                    <p className="text-slate-600 mt-1">Section buttons and toggles update this local draft first. Click Save Changes to publish them to the website.</p>{isDirty && <p className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-black text-amber-800">Unsaved changes — click Save Changes to publish.</p>}{saveStatus === 'success' && <p className="mt-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-black text-emerald-800">Settings saved and synced.</p>}{saveStatus === 'failed' && <p className="mt-2 rounded-xl bg-rose-100 px-3 py-2 text-sm font-black text-rose-800">Saved locally but cloud sync failed. Please retry when online.</p>}
                </div>
                <button onClick={handleSave} disabled={!isDirty || saveStatus === 'saving'} className={`mt-4 md:mt-0 rounded-lg px-6 py-2.5 font-bold text-white transition-colors relative ${isDirty ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:bg-blue-700' : 'bg-slate-400 opacity-60'}`}>
                    {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
            
            <div className="flex flex-wrap gap-2 mb-6">
                <TabButton label="Theme" isActive={activeTab === 'theme'} onClick={() => setActiveTab('theme')} />
                <TabButton label="Layout" isActive={activeTab === 'layout'} onClick={() => setActiveTab('layout')} />
                <TabButton label="Content" isActive={activeTab === 'content'} onClick={() => setActiveTab('content')} />
                <TabButton label="Reading" isActive={activeTab === 'reading'} onClick={() => setActiveTab('reading')} />
                <TabButton label="Profile" isActive={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                <TabButton label="Dock" isActive={activeTab === 'dock'} onClick={() => setActiveTab('dock')} />
                <TabButton label="Announcements" isActive={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')} />
                <TabButton label="Services" isActive={activeTab === 'services'} onClick={() => setActiveTab('services')} />
                <TabButton label="FAQ" isActive={activeTab === 'faq'} onClick={() => setActiveTab('faq')} />
                <TabButton label="Upcoming" isActive={activeTab === 'upcoming'} onClick={() => setActiveTab('upcoming')} />
                <TabButton label="Features" isActive={activeTab === 'features'} onClick={() => setActiveTab('features')} />
                <TabButton label="Animations" isActive={activeTab === 'animations'} onClick={() => setActiveTab('animations')} />
            </div>

            <div className="mt-4">{renderContent()}</div>
        </div>
    );
};

export default WebsiteSettingsComponent;
