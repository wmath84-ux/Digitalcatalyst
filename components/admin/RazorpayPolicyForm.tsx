
import React, { useState, useEffect } from 'react';

const ShieldIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5.023L2 5.051a12.01 12.01 0 01-1 3.053c-.523 1.617-.955 3.256-1 4.887A12.01 12.01 0 012 14.949l.166.027a11.953 11.953 0 017.834 3.024l.05.044a11.953 11.953 0 017.834-3.024l.166-.027a12.01 12.01 0 013-1.999c.045-1.631.477-3.27.955-4.887a12.01 12.01 0 01-1-3.053l-.166-.027A11.954 11.954 0 0110 1.944zM9 13a1 1 0 112 0v1a1 1 0 11-2 0v-1zm1-4a1 1 0 00-1 1v2a1 1 0 102 0V10a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const DocumentIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>;
const TruckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5.05a2.5 2.5 0 014.9 0V8a1 1 0 00-1-1h-3.95z" /></svg>;
const PhoneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>;
const RefundIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1.707-11.707a1 1 0 00-1.414-1.414L6 9.586V7a1 1 0 00-2 0v5a1 1 0 001 1h5a1 1 0 000-2H8.414l3.293-3.293z" clipRule="evenodd" /></svg>;
const CheckmarkIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>


type PolicyOption = 'yes' | 'no' | 'na';
type PolicyStatus = 'missing' | 'verified';

interface PolicyState {
  option: PolicyOption | null;
  url: string;
  status: PolicyStatus;
}

type PolicyKey = 'privacy' | 'terms' | 'shipping' | 'contact' | 'refunds';

const policyDetails: Record<PolicyKey, { title: string; icon: React.ReactNode; hasNa?: boolean }> = {
    privacy: { title: 'Privacy Policy', icon: <ShieldIcon /> },
    terms: { title: 'Terms and Conditions', icon: <DocumentIcon /> },
    shipping: { title: 'Shipping Policy', icon: <TruckIcon />, hasNa: true },
    contact: { title: 'Contact Us', icon: <PhoneIcon /> },
    refunds: { title: 'Cancellations and Refunds', icon: <RefundIcon /> },
};


interface PolicySectionProps {
    id: PolicyKey;
    title: string;
    icon: React.ReactNode;
    hasNa?: boolean;
    isFocused: boolean;
    state: PolicyState;
    onOptionChange: (id: PolicyKey, option: PolicyOption) => void;
    onUrlChange: (id: PolicyKey, url: string) => void;
}

const PolicySection: React.FC<PolicySectionProps> = ({ id, title, icon, hasNa, isFocused, state, onOptionChange, onUrlChange }) => {
    return (
        <div className={`p-4 border rounded-lg transition-all duration-300 ${state.status === 'verified' ? 'bg-gray-50 border-gray-200' : 'bg-white'} ${isFocused ? 'border-razorpay-light-blue ring-2 ring-razorpay-light-blue/50' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    {icon}
                    <h3 className="font-semibold text-gray-800">{title}</h3>
                </div>
                {state.status === 'missing' && <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">Missing</span>}
                {state.status === 'verified' && <div className="flex items-center gap-1.5"><CheckmarkIcon /><span className="text-xs font-bold text-green-700">Verified</span></div>}
            </div>

            {state.status !== 'verified' && (
              <div className="mt-4 pl-8 space-y-3">
                  <label className="flex items-center text-sm">
                      <input type="radio" name={id} checked={state.option === 'yes'} onChange={() => onOptionChange(id, 'yes')} className="form-radio h-4 w-4 text-razorpay-light-blue" />
                      <span className="ml-2 text-gray-700">Yes I have the link for this</span>
                  </label>
                  
                  {state.option === 'yes' && (
                      <div className="pl-6">
                          <input 
                              type="url"
                              placeholder="https://example.com/your-policy-page"
                              value={state.url}
                              onChange={(e) => onUrlChange(id, e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-razorpay-light-blue focus:border-transparent transition"
                          />
                      </div>
                  )}

                  <label className="flex items-center text-sm">
                      <input type="radio" name={id} checked={state.option === 'no'} onChange={() => onOptionChange(id, 'no')} className="form-radio h-4 w-4 text-razorpay-light-blue" />
                      <span className="ml-2 text-gray-700">No, create this page for me</span>
                  </label>

                  {hasNa && (
                      <label className="flex items-center text-sm">
                          <input type="radio" name={id} checked={state.option === 'na'} onChange={() => onOptionChange(id, 'na')} className="form-radio h-4 w-4 text-razorpay-light-blue" />
                          <span className="ml-2 text-gray-700">NA</span>
                      </label>
                  )}
              </div>
            )}
        </div>
    )
};

interface Notification {
    type: 'success' | 'error';
    message: string;
}

const NotificationBanner: React.FC<{ notification: Notification; onClose: () => void }> = ({ notification, onClose }) => {
    const isSuccess = notification.type === 'success';
    const bgColor = isSuccess ? 'bg-green-100 border-green-500' : 'bg-red-100 border-red-500';
    const textColor = isSuccess ? 'text-green-800' : 'text-red-800';
    const icon = isSuccess ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
    );

    return (
        <div className={`fixed top-8 right-8 z-50 p-4 border-l-4 rounded-lg shadow-lg flex items-center gap-4 transition-transform transform translate-x-0 ${bgColor} ${textColor}`}>
            {icon}
            <span className="font-semibold text-sm">{notification.message}</span>
            <button onClick={onClose} className="ml-4 text-lg font-bold">&times;</button>
        </div>
    );
};


const RazorpayPolicyForm: React.FC = () => {
    const [policies, setPolicies] = useState<Record<PolicyKey, PolicyState>>({
        privacy: { option: 'yes', url: '/privacy-policy', status: 'verified' },
        terms: { option: 'yes', url: '/terms-and-conditions', status: 'verified' },
        shipping: { option: 'na', url: '', status: 'verified' },
        contact: { option: 'yes', url: '/contact-us', status: 'verified' },
        refunds: { option: 'yes', url: '/cancellations-and-refunds', status: 'verified' },
    });
    const [notification, setNotification] = useState<Notification | null>(null);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => {
                setNotification(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleOptionChange = (policy: PolicyKey, option: PolicyOption) => {
        setPolicies(prev => ({
            ...prev,
            [policy]: { ...prev[policy], option, status: 'missing' } // Reset status on change
        }));
    };

    const handleUrlChange = (policy: PolicyKey, url: string) => {
        setPolicies(prev => ({
            ...prev,
            [policy]: { ...prev[policy], url }
        }));
    };
    
    const handleSave = () => {
        setNotification(null);
        let allSet = true;
        const updatedPolicies = { ...policies };
        
        const policyKeys = Object.keys(updatedPolicies) as PolicyKey[];
        
        for (const key of policyKeys) {
            const policy = updatedPolicies[key];
            if (policy.status === 'verified') continue; // Skip already verified ones

            if (policy.option === 'yes' && policy.url.trim() !== '' && (policy.url.startsWith('http') || policy.url.startsWith('/'))) {
                updatedPolicies[key].status = 'verified';
            } else if (policy.option === 'no' || policy.option === 'na') {
                 updatedPolicies[key].status = 'verified';
            } else {
                allSet = false;
                updatedPolicies[key].status = 'missing';
            }
        }

        setPolicies(updatedPolicies);

        const anyMissing = (Object.values(updatedPolicies) as PolicyState[]).some(p => p.status === 'missing');

        if (!anyMissing) {
             setNotification({type: 'success', message: 'All policy details have been saved and verified!'});
        } else {
             setNotification({type: 'error', message: 'Some policies are missing valid links. Please review and save again.'});
        }
    };

    const handleCreateNow = () => {
        setNotification(null);
        const updatedPolicies = { ...policies };
        let policiesWereGenerated = false;
        const policyKeys = Object.keys(updatedPolicies) as PolicyKey[];

        for (const key of policyKeys) {
            if (updatedPolicies[key].status === 'missing') {
                policiesWereGenerated = true;
                updatedPolicies[key] = {
                    ...updatedPolicies[key],
                    status: 'verified',
                    option: 'yes',
                    url: `/generated/${key}-policy`
                };
            }
        }

        if (policiesWereGenerated) {
            setPolicies(updatedPolicies);
            setNotification({
                type: 'success',
                message: 'Successfully generated all missing policy pages for you!'
            });
        } else {
            setNotification({
                type: 'success',
                message: 'All your policies are already verified. Nothing to generate!'
            });
        }
    };

    const policyKeys = Object.keys(policyDetails) as PolicyKey[];
    const firstMissingKey = policyKeys.find(key => policies[key].status === 'missing');

    return (
        <div className="flex flex-col items-center">
            {notification && <NotificationBanner notification={notification} onClose={() => setNotification(null)} />}
            <div className="w-full max-w-3xl bg-white p-8 rounded-xl shadow-lg border">
                <h1 className="text-2xl font-bold text-center text-razorpay-blue">Required policy pages on your website</h1>
                <p className="text-center text-gray-500 mt-2 mb-8">If you don't have any of these required pages/details, we'll help you create them.</p>

                <div className="space-y-4">
                    {policyKeys.map(key => {
                        const details = policyDetails[key];
                        return (
                            <PolicySection 
                                key={key}
                                id={key}
                                title={details.title}
                                icon={details.icon}
                                hasNa={details.hasNa}
                                state={policies[key]}
                                isFocused={key === firstMissingKey}
                                onOptionChange={handleOptionChange}
                                onUrlChange={handleUrlChange}
                            />
                        )
                    })}
                </div>
                
                <div className="mt-8">
                    <button 
                        onClick={handleSave}
                        className="w-full bg-razorpay-light-blue text-white font-bold px-8 py-3 rounded-lg hover:bg-blue-700 transition-all duration-300"
                    >
                        Save and Continue
                    </button>
                </div>
            </div>

             <div className="w-full max-w-3xl bg-blue-50 p-6 rounded-lg border border-blue-200 mt-6">
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-xs font-semibold text-blue-800 bg-blue-200 px-2 py-1 rounded">RECOMMENDED</span>
                        <p className="font-semibold text-razorpay-blue mt-2">Create all missing policy pages with Razorpay in 2 mins!</p>
                    </div>
                    <button onClick={handleCreateNow} className="font-bold text-razorpay-light-blue hover:underline flex items-center gap-2 group">
                        <span>Create Now</span>
                        <span className="transform transition-transform group-hover:translate-x-1">&rarr;</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RazorpayPolicyForm;
