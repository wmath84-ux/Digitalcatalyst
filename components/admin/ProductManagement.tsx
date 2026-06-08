import React, { useEffect, useRef, useState } from 'react';
import { Coupon, CourseModule, Product, ProductFile, ProductFileType, ProductWithRating, QuizQuestion, User } from '../../App';
import NewProductEmailPreviewModal from './NewProductEmailPreviewModal';

type ProductViewState = 'list' | 'add' | 'edit';

type ProductAdminInitialState = Omit<Product, 'id'> & {
    faqs: unknown[];
    modules: CourseModule[];
};

type ProductFormData = {
    title: string;
    description: string;
    longDescription: string;
    price: string;
    salePrice: string;
    coinPrice: string;
    imageSeed: string;
    category: string;
    department: 'Men' | 'Women' | 'Unisex';
    inStock: boolean;
    isVisible: boolean;
    manualRating: string;
    sku: string;
    dimensions: string;
    fileFormat: string;
    aspectRatio: string;
    isFree: boolean;
    couponCode: string;
    paymentLink: string;
    featuresText: string;
    tagsText: string;
};

const initialProductState: ProductAdminInitialState = {
    imageSeed: '',
    images: [],
    title: '',
    description: '',
    longDescription: '',
    features: [],
    price: '₹0',
    salePrice: undefined,
    coinPrice: 0,
    category: '',
    department: 'Unisex',
    inStock: true,
    isVisible: true,
    manualRating: null,
    sku: '',
    tags: [],
    dimensions: '',
    fileFormat: '',
    courseContent: [],
    aspectRatio: 'aspect-[4/3]',
    priceHistory: [],
    isFree: false,
    couponCode: '',
    paymentLink: '',
    wishlistCount: 0,
    viewCount: 0,
    faqs: [],
    modules: [],
};

const emptyArrays = {
    images: [] as string[],
    features: [] as string[],
    tags: [] as string[],
    courseContent: [] as CourseModule[],
    priceHistory: [],
};

const createEmptyProductForm = (product?: ProductWithRating | null): ProductFormData => {
    const source = product || initialProductState;

    return {
        title: source.title || '',
        description: source.description || '',
        longDescription: source.longDescription || '',
        price: source.price ? source.price.replace('₹', '') : '',
        salePrice: source.salePrice ? source.salePrice.replace('₹', '') : '',
        coinPrice: source.coinPrice ? String(source.coinPrice) : '',
        imageSeed: source.imageSeed || '',
        category: source.category || '',
        department: source.department || 'Unisex',
        inStock: source.inStock ?? true,
        isVisible: source.isVisible ?? true,
        manualRating: source.manualRating !== null && source.manualRating !== undefined ? source.manualRating.toString() : '',
        sku: source.sku || '',
        dimensions: source.dimensions || '',
        fileFormat: source.fileFormat || '',
        aspectRatio: source.aspectRatio || 'aspect-[4/3]',
        isFree: source.isFree || false,
        couponCode: source.couponCode || '',
        paymentLink: source.paymentLink || '',
        featuresText: (source.features || []).join('\n'),
        tagsText: (source.tags || []).join(', '),
    };
};

const normaliseQuizQuestions = (questions?: QuizQuestion[]): QuizQuestion[] => (questions || []).map(question => ({
    prompt: question.prompt || '',
    options: question.options || [],
    correctAnswer: question.correctAnswer ?? 0,
}));

const normaliseFiles = (files?: ProductFile[]): ProductFile[] => (files || []).map(file => ({
    ...file,
    content: file.content || '',
    quiz: file.quiz ? { questions: normaliseQuizQuestions(file.quiz.questions || []) } : file.type === 'quiz' ? { questions: [] } : undefined,
}));

const normaliseModules = (modules?: CourseModule[]): CourseModule[] => (modules || []).map(module => ({
    ...module,
    title: module.title || 'Untitled Module',
    files: normaliseFiles(module.files || []),
    modules: normaliseModules(module.modules || []),
}));

const countModuleContent = (modules?: CourseModule[]): number => (modules || []).reduce(
    (count, module) => count + (module.files || []).length + countModuleContent(module.modules || []),
    0
);

const recursiveFileUpdate = (
    modules: CourseModule[],
    moduleId: string,
    updateCallback: (files: ProductFile[]) => ProductFile[]
): CourseModule[] => (modules || []).map(module => {
    if (module.id === moduleId) {
        return { ...module, files: updateCallback(module.files || []) };
    }

    return { ...module, modules: recursiveFileUpdate(module.modules || [], moduleId, updateCallback) };
});

const recursiveModuleUpdate = (
    modules: CourseModule[],
    moduleId: string,
    updateCallback: (module: CourseModule) => CourseModule
): CourseModule[] => (modules || []).map(module => {
    if (module.id === moduleId) return updateCallback(module);
    return { ...module, modules: recursiveModuleUpdate(module.modules || [], moduleId, updateCallback) };
});

const glassCard = 'rounded-[2rem] border border-white/50 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl';
const fieldClass = 'w-full rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/70 focus:ring-4 focus:ring-cyan-400/10';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.22em] text-slate-600';

const editorCommands: Array<[string, string, string?]> = [
    ['bold', 'B'],
    ['italic', 'I'],
    ['formatBlock', 'H1', '<h1>'],
    ['formatBlock', 'H2', '<h2>'],
    ['insertUnorderedList', '• List'],
    ['justifyLeft', 'Left'],
    ['justifyCenter', 'Center'],
    ['justifyRight', 'Right'],
];

const AdminDocsEditor: React.FC<{ value: string; onChange: (value: string) => void; }> = ({ value, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
    }, [value]);

    const runCommand = (command: string, commandValue?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, commandValue);
        onChange(editorRef.current?.innerHTML || '');
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-white/50 bg-white/70">
            <div className="flex flex-wrap gap-2 border-b border-white/50 bg-white/70 p-3 backdrop-blur-xl">
                {(editorCommands || []).map(([command, label, value]) => (
                    <button
                        key={`${command}-${label}`}
                        type="button"
                        onClick={() => runCommand(command, value)}
                        className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm"
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => onChange(editorRef.current?.innerHTML || '')}
                className="prose prose-invert min-h-72 max-w-none bg-white/70 p-5 text-slate-900 outline-none"
            />
        </div>
    );
};

const ContentComposer: React.FC<{ onAdd: (file: Omit<ProductFile, 'id'>) => void; onClose: () => void; }> = ({ onAdd, onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadConfig, setUploadConfig] = useState<{ type: ProductFileType; accept: string } | null>(null);
    const [formState, setFormState] = useState<{ type: ProductFileType; url: string; name: string; content: string } | null>(null);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([{ prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    const [isUploading, setIsUploading] = useState(false);
    const quizListRef = useRef<HTMLDivElement>(null);
    const previousQuizQuestionCountRef = useRef(quizQuestions.length);

    const contentTypes: Array<{ type: ProductFileType; title: string; description: string; icon: string; accept?: string }> = [
        { type: 'video', title: 'Video Upload', description: 'Upload MP4/WebM lesson files.', icon: '🎬', accept: 'video/*' },
        { type: 'youtube', title: 'YouTube Video', description: 'Embed a hosted YouTube lesson.', icon: '▶️' },
        { type: 'pdf', title: 'PDF', description: 'Attach worksheets, notes, or guides.', icon: '📄', accept: 'application/pdf' },
        { type: 'doc', title: 'Smart Docs', description: 'Build rich HTML lesson notes inline.', icon: '🧠' },
        { type: 'quiz', title: 'Quiz', description: 'Create interactive assessment questions.', icon: '✅' },
        { type: 'link', title: 'External Link', description: 'Reference any hosted resource.', icon: '🔗' },
        { type: 'sheet', title: 'Spreadsheet', description: 'Upload CSV/XLS study material.', icon: '📊', accept: '.csv,.xls,.xlsx' },
        { type: 'ebook', title: 'E-book', description: 'Upload EPUB or PDF book content.', icon: '📚', accept: '.epub,.pdf' },
        { type: 'audio', title: 'Audio', description: 'Upload audio classes or podcasts.', icon: '🎧', accept: 'audio/*' },
    ];

    const triggerFileUpload = (type: ProductFileType, accept: string) => {
        setUploadConfig({ type, accept });
        fileInputRef.current?.click();
    };

    const showForm = (type: ProductFileType) => {
        const selected = contentTypes.find(item => item.type === type);
        setFormState({
            type,
            url: '',
            name: selected?.title || 'Learning Resource',
            content: type === 'doc' ? '<h1>Smart Docs Workspace</h1><p>Start building your lesson here.</p>' : '',
        });
        if (type === 'quiz') setQuizQuestions([{ prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    };

    const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !uploadConfig) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = readerEvent => {
            if (readerEvent.target?.result) {
                onAdd({ name: file.name, type: uploadConfig.type, url: readerEvent.target.result as string, content: '', quiz: { questions: [] } });
                setIsUploading(false);
                onClose();
            }
        };
        reader.readAsDataURL(file);
        event.target.value = '';
        setUploadConfig(null);
    };

    const updateQuizQuestion = (questionIndex: number, updater: (question: QuizQuestion) => QuizQuestion) => {
        setQuizQuestions(prev => (prev || []).map((question, index) => index === questionIndex ? updater(question) : question));
    };

    useEffect(() => {
        if (formState?.type !== 'quiz') {
            previousQuizQuestionCountRef.current = quizQuestions.length;
            return;
        }

        const questionWasAdded = quizQuestions.length > previousQuizQuestionCountRef.current;
        previousQuizQuestionCountRef.current = quizQuestions.length;

        if (questionWasAdded) {
            window.requestAnimationFrame(() => {
                const lastQuestion = quizListRef.current?.lastElementChild;
                lastQuestion?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        }
    }, [formState?.type, quizQuestions.length]);

    const addQuizQuestion = () => {
        setQuizQuestions(prev => [...(prev || []), { prompt: '', options: ['', '', '', ''], correctAnswer: 0 }]);
    };

    const handleFormSubmit = () => {
        if (!formState) return;
        const trimmedName = formState.name.trim() || 'Untitled Resource';

        if (formState.type === 'quiz') {
            onAdd({
                name: trimmedName,
                type: 'quiz',
                url: '',
                content: '',
                quiz: { questions: quizQuestions || [] },
            });
        } else {
            onAdd({
                name: trimmedName,
                type: formState.type,
                url: formState.type === 'doc' ? '' : formState.url,
                content: formState.type === 'doc' ? formState.content : '',
                quiz: { questions: [] },
            });
        }
        onClose();
    };

    return (
        <div className="mt-5 rounded-[1.75rem] border border-cyan-400/20 bg-cyan-400/5 p-5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">Content Studio</p>
                    <h4 className="text-xl font-black text-slate-900">Add learning content</h4>
                </div>
                <button type="button" onClick={onClose} className="rounded-full border border-white/50 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white/80 hover:shadow-sm">Close</button>
            </div>

            {!formState ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(contentTypes || []).map(item => (
                        <button
                            key={item.type}
                            type="button"
                            onClick={() => item.accept ? triggerFileUpload(item.type, item.accept) : showForm(item.type)}
                            className="rounded-2xl border border-white/50 bg-white/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-white/80 hover:shadow-sm"
                        >
                            <span className="text-2xl">{item.icon}</span>
                            <span className="mt-3 block font-black text-slate-900">{item.title}</span>
                            <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex max-h-[78vh] flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/70">
                    <div className="shrink-0 space-y-5 border-b border-white/50 bg-white/70 p-4 backdrop-blur-xl sm:p-5">
                        <div>
                            <label className={labelClass}>Resource Name</label>
                            <input value={formState.name} onChange={event => setFormState(prev => prev ? { ...prev, name: event.target.value } : prev)} className={fieldClass} />
                        </div>
                        {formState.type === 'quiz' && <p className="rounded-2xl border border-cyan-300/20 bg-cyan-600/10 px-4 py-3 text-sm font-bold text-cyan-700">{quizQuestions.length} question{quizQuestions.length === 1 ? '' : 's'} added. Scroll inside this quiz builder to review every question before saving.</p>}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                        {formState.type === 'doc' ? (
                            <AdminDocsEditor value={formState.content} onChange={content => setFormState(prev => prev ? { ...prev, content } : prev)} />
                        ) : formState.type === 'quiz' ? (
                            <div className="space-y-4">
                                <div ref={quizListRef} className="space-y-4">
                                    {(quizQuestions || []).map((question, questionIndex) => (
                                        <div key={questionIndex} className="rounded-2xl border border-white/50 bg-white/70 p-4">
                                            <label className={labelClass}>Question {questionIndex + 1}</label>
                                            <input value={question.prompt} onChange={event => updateQuizQuestion(questionIndex, q => ({ ...q, prompt: event.target.value }))} className={fieldClass} placeholder="What should learners answer?" />
                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                                {(question.options || []).map((option, optionIndex) => (
                                                    <label key={optionIndex} className="block">
                                                        <span className="mb-2 block text-xs font-bold text-slate-600">Option {optionIndex + 1}</span>
                                                        <div className="flex gap-2">
                                                            <input value={option} onChange={event => updateQuizQuestion(questionIndex, q => ({ ...q, options: (q.options || []).map((current, idx) => idx === optionIndex ? event.target.value : current) }))} className={fieldClass} />
                                                            <button type="button" onClick={() => updateQuizQuestion(questionIndex, q => ({ ...q, correctAnswer: optionIndex }))} className={`rounded-2xl px-4 text-xs font-black ${question.correctAnswer === optionIndex ? 'bg-emerald-400 text-slate-900' : 'border border-white/50 text-slate-600'}`}>Correct</button>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={addQuizQuestion} className="w-full rounded-2xl border border-dashed border-cyan-300/40 py-3 font-black text-cyan-700 hover:bg-cyan-400/10">+ Add Question</button>
                            </div>
                        ) : (
                            <div>
                                <label className={labelClass}>{formState.type === 'youtube' ? 'YouTube URL' : 'Resource URL'}</label>
                                <input value={formState.url} onChange={event => setFormState(prev => prev ? { ...prev, url: event.target.value } : prev)} className={fieldClass} placeholder="https://example.com/resource" />
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 border-t border-white/50 bg-white/70 p-4 backdrop-blur-xl sm:p-5">
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setFormState(null)} className="rounded-2xl border border-white/50 px-5 py-3 font-bold text-slate-600 hover:bg-white/80 hover:shadow-sm">Back</button>
                            <button type="button" onClick={handleFormSubmit} className="rounded-2xl bg-cyan-600 px-6 py-3 font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 hover:bg-cyan-200">Add Content</button>
                        </div>
                    </div>
                </div>
            )}

            <input ref={fileInputRef} type="file" accept={uploadConfig?.accept} onChange={handleFileSelected} className="hidden" />
            {isUploading && <p className="mt-4 text-sm font-bold text-cyan-700">Uploading content...</p>}
        </div>
    );
};

const ModuleEditor: React.FC<{
    module: CourseModule;
    allModules: CourseModule[];
    level: number;
    onUpdate: (modules: CourseModule[]) => void;
    onAddChild: (parentId: string) => void;
}> = ({ module, allModules, level, onUpdate, onAddChild }) => {
    const [isAddingContent, setIsAddingContent] = useState(false);
    const files = module.files || [];
    const childModules = module.modules || [];

    const updateModule = (updater: (module: CourseModule) => CourseModule) => {
        onUpdate(recursiveModuleUpdate(allModules || [], module.id, updater));
    };

    const handleAddContent = (fileData: Omit<ProductFile, 'id'>) => {
        const newFile: ProductFile = { ...fileData, id: `file-${Date.now()}`, quiz: fileData.quiz || { questions: [] } };
        onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles => [...(currentFiles || []), newFile]));
        setIsAddingContent(false);
    };

    return (
        <div className={`rounded-[1.75rem] border p-5 ${level === 0 ? 'border-white/50 bg-white/70' : 'border-white/50 bg-white/70'}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                    <label className={labelClass}>Module Title</label>
                    <input value={module.title} onChange={event => updateModule(current => ({ ...current, title: event.target.value }))} className={fieldClass} placeholder="Module title" />
                </div>
                <div className="flex gap-2 pt-6">
                    <button type="button" onClick={() => setIsAddingContent(true)} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 hover:bg-cyan-100">+ Content</button>
                    <button type="button" onClick={() => onAddChild(module.id)} className="rounded-2xl border border-white/50 px-4 py-3 text-sm font-black text-slate-600 hover:bg-white/80 hover:shadow-sm">+ Submodule</button>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {files.length > 0 ? (files || []).map(file => (
                    <div key={file.id} className="flex flex-col gap-2 rounded-2xl border border-white/50 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-black text-slate-900">{file.name}</p>
                            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{file.type}{file.quiz?.questions?.length ? ` • ${file.quiz.questions.length} questions` : ''}</p>
                        </div>
                        <button type="button" onClick={() => onUpdate(recursiveFileUpdate(allModules || [], module.id, currentFiles => (currentFiles || []).filter(item => item.id !== file.id)))} className="self-start rounded-xl border border-red-400/30 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-500/10 sm:self-auto">Remove</button>
                    </div>
                )) : <p className="rounded-2xl border border-dashed border-white/50 p-4 text-sm text-slate-600">No content yet. Add videos, PDFs, Smart Docs, quizzes, and resource links here.</p>}
            </div>

            {isAddingContent && <ContentComposer onAdd={handleAddContent} onClose={() => setIsAddingContent(false)} />}

            {childModules.length > 0 && (
                <div className="mt-5 space-y-4 border-l border-white/50 pl-4">
                    {(childModules || []).map(child => (
                        <ModuleEditor key={child.id} module={child} allModules={allModules} level={level + 1} onUpdate={onUpdate} onAddChild={onAddChild} />
                    ))}
                </div>
            )}
        </div>
    );
};

const ProductForm: React.FC<{
    mode: 'add' | 'edit';
    product?: ProductWithRating | null;
    coupons: Coupon[];
    onSave: (product: Omit<Product, 'id'>) => void;
    onCancel: () => void;
}> = ({ mode, product, coupons, onSave, onCancel }) => {
    const [formData, setFormData] = useState<ProductFormData>(() => createEmptyProductForm(product));
    const [modules, setModules] = useState<CourseModule[]>(() => normaliseModules(product?.courseContent || initialProductState.courseContent || []));
    const [images, setImages] = useState<string[]>(() => product?.images || initialProductState.images || []);
    const [imageMode, setImageMode] = useState<'upload' | 'ai'>('upload');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [discountPercent, setDiscountPercent] = useState(0);
    const productImageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const regular = parseFloat(formData.price) || 0;
        const sale = parseFloat(formData.salePrice) || 0;
        setDiscountPercent(regular > 0 && sale > 0 && sale < regular ? Math.round(((regular - sale) / regular) * 100) : 0);
    }, [formData.price, formData.salePrice]);

    useEffect(() => {
        if (formData.isFree && (!formData.price || formData.price === '0')) {
            setFormData(prev => ({ ...prev, price: '3', salePrice: '' }));
        }
    }, [formData.isFree]);

    const handleProductImagesUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = event.currentTarget.files ? Array.from(event.currentTarget.files) as File[] : [];
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => setImages(prev => [...(prev || []), reader.result as string]);
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    };

    const handleGenerateAiImage = async () => {
        const prompt = encodeURIComponent(`${formData.title || 'Education course'} ${formData.description || 'premium learning product'}`);
        setIsGeneratingImage(true);
        try {
            const aiImageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=768&nologo=true`;
            setImages(prev => [aiImageUrl, ...(prev || []).filter(Boolean)]);
            setImageMode('upload');
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const addRootModule = () => {
        setModules(prev => [...(prev || []), { id: `mod-${Date.now()}`, title: 'New Module', files: [], modules: [] }]);
    };

    const addChildModule = (parentId: string) => {
        const child: CourseModule = { id: `mod-${Date.now()}`, title: 'New Submodule', files: [], modules: [] };
        setModules(prev => recursiveModuleUpdate(prev || [], parentId, module => ({ ...module, modules: [...(module.modules || []), child] })));
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!formData.paymentLink.trim()) {
            alert('Payment Link Required');
            return;
        }

        const features = ((formData.featuresText || '').split('\n') || []).map(item => item.trim()).filter(Boolean);
        const tags = ((formData.tagsText || '').split(',') || []).map(item => item.trim()).filter(Boolean);
        const formattedPrice = formData.price ? `₹${formData.price}` : '₹0';
        const formattedSalePrice = formData.salePrice ? `₹${formData.salePrice}` : undefined;

        onSave({
            imageSeed: formData.imageSeed || formData.title || `product-${Date.now()}`,
            images: images || [],
            title: formData.title,
            description: formData.description,
            longDescription: formData.longDescription,
            features,
            tags,
            price: formattedPrice,
            salePrice: formattedSalePrice,
            coinPrice: Number(formData.coinPrice || 0),
            category: formData.category,
            department: formData.department,
            inStock: formData.inStock,
            isVisible: formData.isVisible,
            manualRating: formData.manualRating ? parseFloat(formData.manualRating) : null,
            sku: formData.sku,
            dimensions: formData.dimensions,
            fileFormat: formData.fileFormat,
            aspectRatio: formData.aspectRatio,
            isFree: formData.isFree,
            couponCode: formData.couponCode,
            paymentLink: formData.paymentLink,
            courseContent: normaliseModules(modules || []),
            priceHistory: product?.priceHistory || [],
            wishlistCount: product?.wishlistCount,
            viewCount: product?.viewCount,
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 text-slate-900">
            <form onSubmit={handleSubmit}>
                <header className="sticky top-0 z-30 border-b border-white/50 bg-white/70 px-4 py-4 backdrop-blur-2xl sm:px-6 lg:px-8">
                    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                            <button type="button" onClick={onCancel} className="rounded-2xl border border-white/50 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-white/80 hover:shadow-sm">← Back to List</button>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">{mode === 'add' ? 'Create Product' : 'Edit Product'}</p>
                                <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{mode === 'add' ? 'New digital product' : formData.title || 'Product editor'}</h1>
                            </div>
                        </div>
                        <button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-7 py-3 font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-sm">{mode === 'add' ? 'Save Product' : 'Update Product'}</button>
                    </div>
                </header>

                <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                        <section className="space-y-8 lg:col-span-2">
                            <div className={glassCard}>
                                <div className="mb-6">
                                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Main Settings</p>
                                    <h2 className="mt-2 text-2xl font-black text-slate-900">Product identity</h2>
                                </div>
                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Product Title</label>
                                        <input required value={formData.title} onChange={event => setFormData(prev => ({ ...prev, title: event.target.value }))} className={fieldClass} placeholder="Masterclass, template pack, guide..." />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Short Description</label>
                                        <textarea required rows={3} value={formData.description} onChange={event => setFormData(prev => ({ ...prev, description: event.target.value }))} className={fieldClass} placeholder="A concise storefront summary." />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Long Description</label>
                                        <textarea rows={7} value={formData.longDescription} onChange={event => setFormData(prev => ({ ...prev, longDescription: event.target.value }))} className={fieldClass} placeholder="Deep product narrative, outcomes, curriculum promise..." />
                                    </div>
                                    <div>
                                        <label className={labelClass}>SKU</label>
                                        <input value={formData.sku} onChange={event => setFormData(prev => ({ ...prev, sku: event.target.value }))} className={fieldClass} placeholder="DC-COURSE-001" />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Manual Rating</label>
                                        <input type="number" min="0" max="5" step="0.1" value={formData.manualRating} onChange={event => setFormData(prev => ({ ...prev, manualRating: event.target.value }))} className={fieldClass} placeholder="4.8" />
                                    </div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Curriculum Builder</p>
                                        <h2 className="mt-2 text-2xl font-black text-slate-900">Course content / files</h2>
                                        <p className="mt-2 text-sm text-slate-600">Organize Video, PDF, Smart Docs, Quiz, audio, sheets, e-books, and links in spacious modules.</p>
                                    </div>
                                    <button type="button" onClick={addRootModule} className="rounded-2xl bg-white px-5 py-3 font-black text-slate-900 hover:bg-cyan-100">+ Add Module</button>
                                </div>
                                <div className="space-y-5">
                                    {(modules || []).length > 0 ? (modules || []).map(module => (
                                        <ModuleEditor key={module.id} module={module} allModules={modules || []} level={0} onUpdate={setModules} onAddChild={addChildModule} />
                                    )) : (
                                        <button type="button" onClick={addRootModule} className="w-full rounded-[1.75rem] border border-dashed border-cyan-300/30 bg-cyan-400/5 p-10 text-center transition hover:bg-cyan-400/10">
                                            <span className="block text-4xl">🧱</span>
                                            <span className="mt-3 block text-lg font-black text-slate-900">Start with your first module</span>
                                            <span className="mt-1 block text-sm text-slate-600">Every new module is initialized with empty files and submodules to prevent undefined map crashes.</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>

                        <aside className="space-y-8 lg:col-span-1">
                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Publish Status</h2>
                                <div className="mt-5 space-y-4">
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/70 p-4">
                                        <span><span className="block font-black text-slate-900">Visible</span><span className="text-sm text-slate-600">Show on storefront</span></span>
                                        <input type="checkbox" checked={formData.isVisible} onChange={event => setFormData(prev => ({ ...prev, isVisible: event.target.checked }))} className="h-5 w-5 accent-cyan-300" />
                                    </label>
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/70 p-4">
                                        <span><span className="block font-black text-slate-900">In Stock</span><span className="text-sm text-slate-600">Purchasable now</span></span>
                                        <input type="checkbox" checked={formData.inStock} onChange={event => setFormData(prev => ({ ...prev, inStock: event.target.checked }))} className="h-5 w-5 accent-emerald-300" />
                                    </label>
                                    <label className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/70 p-4">
                                        <span><span className="block font-black text-slate-900">Free via coupon</span><span className="text-sm text-slate-600">Enable free access flow</span></span>
                                        <input type="checkbox" checked={formData.isFree} onChange={event => setFormData(prev => ({ ...prev, isFree: event.target.checked }))} className="h-5 w-5 accent-blue-300" />
                                    </label>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Pricing</h2>
                                {discountPercent > 0 && <p className="mt-3 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-700">{discountPercent}% discount active</p>}
                                <div className="mt-5 space-y-4">
                                    <div><label className={labelClass}>Regular Price</label><input required type="number" value={formData.price} onChange={event => setFormData(prev => ({ ...prev, price: event.target.value }))} className={fieldClass} placeholder="999" /></div>
                                    <div><label className={labelClass}>Sale Price</label><input type="number" value={formData.salePrice} onChange={event => setFormData(prev => ({ ...prev, salePrice: event.target.value }))} className={fieldClass} placeholder="499" /></div>
                                    <div><label className={labelClass}>EduCoin Price (Leave 0 to disable coin purchase)</label><input type="number" min="0" value={formData.coinPrice} onChange={event => setFormData(prev => ({ ...prev, coinPrice: event.target.value }))} className={fieldClass} placeholder="1200" /></div>
                                    <div><label className={labelClass}>Coupon Code</label><select value={formData.couponCode} onChange={event => setFormData(prev => ({ ...prev, couponCode: event.target.value }))} className={fieldClass}><option value="">No coupon</option>{(coupons || []).map(coupon => <option key={coupon.id} value={coupon.code}>{coupon.code}</option>)}</select></div>
                                    <div><label className={labelClass}>Razorpay Payment Page Link</label><input required value={formData.paymentLink} onChange={event => setFormData(prev => ({ ...prev, paymentLink: event.target.value }))} className={fieldClass} placeholder="https://pages.razorpay.com/..." /></div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Categories & Metadata</h2>
                                <div className="mt-5 space-y-4">
                                    <div><label className={labelClass}>Category</label><input value={formData.category} onChange={event => setFormData(prev => ({ ...prev, category: event.target.value }))} className={fieldClass} placeholder="Design, Finance, Coding..." /></div>
                                    <div><label className={labelClass}>Department</label><select value={formData.department} onChange={event => setFormData(prev => ({ ...prev, department: event.target.value as ProductFormData['department'] }))} className={fieldClass}><option>Unisex</option><option>Men</option><option>Women</option></select></div>
                                    <div><label className={labelClass}>Dimensions</label><input value={formData.dimensions} onChange={event => setFormData(prev => ({ ...prev, dimensions: event.target.value }))} className={fieldClass} placeholder="1024x768, A4, 16:9" /></div>
                                    <div><label className={labelClass}>File Format</label><input value={formData.fileFormat} onChange={event => setFormData(prev => ({ ...prev, fileFormat: event.target.value }))} className={fieldClass} placeholder="PDF + MP4 + Docs" /></div>
                                    <div><label className={labelClass}>Features (one per line)</label><textarea rows={4} value={formData.featuresText} onChange={event => setFormData(prev => ({ ...prev, featuresText: event.target.value }))} className={fieldClass} /></div>
                                    <div><label className={labelClass}>Tags (comma separated)</label><input value={formData.tagsText} onChange={event => setFormData(prev => ({ ...prev, tagsText: event.target.value }))} className={fieldClass} placeholder="premium, beginner, template" /></div>
                                </div>
                            </div>

                            <div className={glassCard}>
                                <h2 className="text-xl font-black text-slate-900">Image Upload</h2>
                                <div className="mt-5 grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setImageMode('upload')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'upload' ? 'bg-cyan-600 text-slate-900' : 'border border-white/50 text-slate-600'}`}>Upload</button>
                                    <button type="button" onClick={() => setImageMode('ai')} className={`rounded-2xl px-3 py-3 text-sm font-black ${imageMode === 'ai' ? 'bg-purple-300 text-slate-900' : 'border border-white/50 text-slate-600'}`}>AI Image</button>
                                </div>
                                <div className="mt-4">
                                    {imageMode === 'upload' ? (
                                        <button type="button" onClick={() => productImageInputRef.current?.click()} className="w-full rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-400/5 p-8 text-center font-black text-cyan-700 hover:bg-cyan-400/10">Upload product images</button>
                                    ) : (
                                        <button type="button" onClick={handleGenerateAiImage} disabled={isGeneratingImage} className="w-full rounded-3xl border border-dashed border-purple-300/40 bg-purple-400/5 p-8 text-center font-black text-purple-700 hover:bg-purple-400/10 disabled:opacity-60">{isGeneratingImage ? 'Generating...' : 'Generate from title + description'}</button>
                                    )}
                                    <input ref={productImageInputRef} type="file" accept="image/*" multiple onChange={handleProductImagesUpload} className="hidden" />
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {((images || []).filter(Boolean) || []).map((image, index) => (
                                        <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-2xl border border-white/50 bg-white/70">
                                            <img src={image} alt={`Product ${index + 1}`} className="h-full w-full object-cover" />
                                            <button type="button" onClick={() => setImages(prev => (prev || []).filter((_, currentIndex) => currentIndex !== index))} className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-sm font-black text-white opacity-90">×</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4"><label className={labelClass}>Image Seed</label><input value={formData.imageSeed} onChange={event => setFormData(prev => ({ ...prev, imageSeed: event.target.value }))} className={fieldClass} placeholder="Fallback image seed" /></div>
                            </div>
                        </aside>
                    </div>
                </main>
            </form>
        </div>
    );
};

const ProductManagement: React.FC<{
    products: ProductWithRating[];
    users: User[];
    coupons: Coupon[];
    onAddProduct: (product: Omit<Product, 'id'>) => void;
    onUpdateProduct: (product: Product) => void;
    onDeleteProduct: (id: number) => void;
}> = ({ products, users, coupons, onAddProduct, onUpdateProduct, onDeleteProduct }) => {
    const [viewState, setViewState] = useState<ProductViewState>('list');
    const [editingProduct, setEditingProduct] = useState<ProductWithRating | null>(null);
    const [newProductForEmail, setNewProductForEmail] = useState<ProductWithRating | null>(null);
    const safeProducts = products || [];

    const openAddView = () => {
        setEditingProduct(null);
        setViewState('add');
    };

    const openEditView = (product: ProductWithRating) => {
        setEditingProduct({
            ...product,
            images: product.images || [],
            features: product.features || [],
            tags: product.tags || [],
            courseContent: normaliseModules(product.courseContent || []),
            priceHistory: product.priceHistory || [],
        });
        setViewState('edit');
    };

    const handleSave = (productData: Omit<Product, 'id'>) => {
        const safeProductData: Omit<Product, 'id'> = {
            ...productData,
            ...emptyArrays,
            ...productData,
            images: productData.images || [],
            features: productData.features || [],
            tags: productData.tags || [],
            courseContent: normaliseModules(productData.courseContent || []),
            priceHistory: productData.priceHistory || [],
        };

        if (editingProduct && viewState === 'edit') {
            onUpdateProduct({ ...safeProductData, id: editingProduct.id });
        } else {
            onAddProduct(safeProductData);
            setNewProductForEmail({ ...safeProductData, id: Date.now(), rating: 0, reviewCount: 0, calculatedRating: 0 });
        }

        setEditingProduct(null);
        setViewState('list');
    };

    if (viewState !== 'list') {
        return (
            <>
                <ProductForm mode={viewState} product={editingProduct} coupons={coupons || []} onSave={handleSave} onCancel={() => { setEditingProduct(null); setViewState('list'); }} />
                {newProductForEmail && <NewProductEmailPreviewModal product={newProductForEmail} relatedProducts={[]} users={users || []} onClose={() => setNewProductForEmail(null)} />}
            </>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 p-4 text-slate-900 animate-fade-in-up sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Admin Inventory</p>
                        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Product Management</h1>
                        <p className="mt-2 max-w-2xl text-slate-600">Manage your digital catalogue from a premium full-page workflow. Add and edit products in dedicated nested screens, not cramped modals.</p>
                    </div>
                    <button onClick={openAddView} className="rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-7 py-4 font-black text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 transition hover:-translate-y-0.5">+ Add Product</button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/70 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Total Products</p><p className="mt-2 text-3xl font-black text-slate-900">{safeProducts.length}</p></div>
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/70 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Visible</p><p className="mt-2 text-3xl font-black text-emerald-300">{safeProducts.filter(product => product.isVisible !== false).length}</p></div>
                    <div className="rounded-[1.5rem] border border-white/50 bg-white/70 p-5 backdrop-blur-xl"><p className="text-sm font-bold text-slate-600">Out of Stock</p><p className="mt-2 text-3xl font-black text-rose-300">{safeProducts.filter(product => product.inStock === false).length}</p></div>
                </div>

                <div className="mt-8 overflow-hidden rounded-[2rem] border border-white/50 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] shadow-black/5 backdrop-blur-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-white/50 bg-white/70 text-xs uppercase tracking-[0.24em] text-slate-600">
                                <tr>
                                    <th className="p-5 font-black">Product</th>
                                    <th className="p-5 font-black">Status</th>
                                    <th className="p-5 font-black">Price</th>
                                    <th className="p-5 font-black">Content</th>
                                    <th className="p-5 text-right font-black">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {safeProducts.length > 0 ? (safeProducts || []).map(product => {
                                    const thumbnail = product.images?.[0] || `https://picsum.photos/seed/${product.imageSeed || product.id}/100/100`;
                                    const contentCount = countModuleContent(product.courseContent || []);
                                    return (
                                        <tr key={product.id} className="group transition hover:bg-white/80 hover:shadow-sm">
                                            <td className="p-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-white/50 bg-white/70">
                                                        <img src={thumbnail} alt="" className="h-full w-full object-cover" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-black text-slate-900 group-hover:text-cyan-700">{product.title}</p>
                                                        <p className="mt-1 text-xs font-mono text-slate-600">{product.sku || 'NO-SKU'} • {product.category || 'Uncategorized'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="flex flex-col gap-2">
                                                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${product.inStock !== false ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-700' : 'border-red-300/30 bg-red-400/10 text-red-700'}`}>{product.inStock !== false ? 'In Stock' : 'Out of Stock'}</span>
                                                    {product.isFree && <span className="w-fit rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-700">Free Flow</span>}
                                                </div>
                                            </td>
                                            <td className="p-5 font-bold text-slate-600">
                                                {product.salePrice ? <div><p className="text-rose-700">{product.salePrice}</p><p className="text-xs text-slate-600 line-through">{product.price}</p></div> : product.price}
                                            </td>
                                            <td className="p-5"><span className="rounded-full border border-white/50 bg-white/70 px-3 py-1 text-xs font-black text-slate-600">{contentCount} items</span></td>
                                            <td className="p-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => openEditView(product)} className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-400/10">Edit</button>
                                                    <button onClick={() => onDeleteProduct(product.id)} className="rounded-2xl border border-red-300/30 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-400/10">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-slate-600">
                                            <p className="text-4xl">📦</p>
                                            <p className="mt-3 text-lg font-black text-slate-900">No products yet</p>
                                            <p className="mt-1">Create your first product using the full-page editor.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {newProductForEmail && <NewProductEmailPreviewModal product={newProductForEmail} relatedProducts={[]} users={users || []} onClose={() => setNewProductForEmail(null)} />}
        </div>
    );
};

export default ProductManagement;
