
import React, { useState, useRef, useEffect } from 'react';
import { Product, ProductWithRating, ProductFile, CourseModule, ProductFileType, Coupon, User } from '../../App';
import NewProductEmailPreviewModal from './NewProductEmailPreviewModal';

// ... (Keep recursive functions recursiveUpdate, recursiveFileUpdate exactly as before)
const recursiveUpdate = (
    modules: CourseModule[], 
    parentId: string | null, 
    updateCallback: (modules: CourseModule[]) => CourseModule[]
): CourseModule[] => {
    if (!modules) return []; 
    if (parentId === null) return updateCallback(modules);
    return modules.map(module => {
        if (module.id === parentId) {
            const currentModules = Array.isArray(module.modules) ? module.modules : [];
            return { ...module, modules: updateCallback(currentModules) };
        }
        if (module.modules && module.modules.length > 0) {
            return { ...module, modules: recursiveUpdate(module.modules, parentId, updateCallback) };
        }
        return module;
    });
};

const recursiveFileUpdate = (
    modules: CourseModule[], 
    moduleId: string, 
    updateCallback: (files: ProductFile[]) => ProductFile[]
): CourseModule[] => {
    if (!modules) return [];
    return modules.map(module => {
        if (module.id === moduleId) {
            const currentFiles = Array.isArray(module.files) ? module.files : [];
            return { ...module, files: updateCallback(currentFiles) };
        }
        if (module.modules && module.modules.length > 0) {
            return { ...module, modules: recursiveFileUpdate(module.modules, moduleId, updateCallback) };
        }
        return module;
    });
};

// ... (Keep AddContentModal, ModuleEditor, ProductForm components exactly as before)
const AddContentModal: React.FC<{ onAdd: (file: Omit<ProductFile, 'id'>) => void; onClose: () => void; }> = ({ onAdd, onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadConfig, setUploadConfig] = useState<{type: ProductFileType, accept: string} | null>(null);
    const [view, setView] = useState<'selection' | 'form'>('selection');
    const [formState, setFormState] = useState<{type: ProductFileType, url: string, name: string} | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && uploadConfig) {
            const file = e.target.files[0];
            setIsUploading(true);
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    onAdd({ name: file.name, type: uploadConfig.type, url: event.target.result as string });
                    setIsUploading(false); onClose();
                }
            };
            reader.readAsDataURL(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = ""; setUploadConfig(null);
    };
    const triggerFileUpload = (type: ProductFileType, accept: string) => { setUploadConfig({ type, accept }); fileInputRef.current?.click(); };
    const showLinkForm = (type: ProductFileType) => { setFormState({ type, url: '', name: type === 'youtube' ? 'YouTube Video' : ''}); setView('form'); };
    const handleFormSubmit = (e: React.FormEvent) => { e.preventDefault(); if (formState?.url && formState?.name) { onAdd({ name: formState.name, type: formState.type, url: formState.url }); onClose(); }};
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
                 <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
                 {isUploading ? <p className="text-center py-10">Uploading...</p> : view === 'selection' ? (
                    <div className="grid gap-4">
                        <h3 className="text-xl font-bold text-center mb-4">Add Content</h3>
                        <button onClick={() => triggerFileUpload('pdf', '.pdf')} className="p-3 border rounded hover:bg-gray-50">Upload PDF</button>
                        <button onClick={() => triggerFileUpload('video', 'video/mp4')} className="p-3 border rounded hover:bg-gray-50">Upload Video</button>
                        <button onClick={() => showLinkForm('youtube')} className="p-3 border rounded hover:bg-gray-50">YouTube Link</button>
                    </div>
                 ) : (
                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <h3 className="text-xl font-bold text-center mb-4">Add Link</h3>
                        <input placeholder="URL" value={formState?.url} onChange={e => setFormState(prev => prev ? ({...prev, url: e.target.value}) : null)} className="w-full p-2 border rounded" required />
                        <input placeholder="Name" value={formState?.name} onChange={e => setFormState(prev => prev ? ({...prev, name: e.target.value}) : null)} className="w-full p-2 border rounded" required />
                        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded">Add</button>
                    </form>
                 )}
                 <input type="file" ref={fileInputRef} className="hidden" accept={uploadConfig?.accept} onChange={handleFileSelected} />
            </div>
        </div>
    );
};

const ModuleEditor: React.FC<{ module: CourseModule; onUpdate: (updatedModules: CourseModule[]) => void; allModules: CourseModule[]; level: number; }> = ({ module, onUpdate, allModules, level }) => {
    const [isAddingContent, setIsAddingContent] = useState(false);
    const handleUpdateTitle = (newTitle: string) => {
        const updateRecursive = (modules: CourseModule[]): CourseModule[] => modules.map(m => m.id === module.id ? { ...m, title: newTitle } : { ...m, modules: m.modules ? updateRecursive(m.modules) : [] });
        onUpdate(updateRecursive(allModules));
    };
    const handleAddContent = (fileData: Omit<ProductFile, 'id'>) => {
        const newFile: ProductFile = { ...fileData, id: `file-${Date.now()}` };
        onUpdate(recursiveFileUpdate(allModules, module.id, (files) => [...files, newFile]));
        setIsAddingContent(false);
    };
    return (
        <div className={`p-4 rounded-lg border mt-4 ${level === 0 ? 'bg-slate-50 border-slate-200' : 'bg-white border-gray-200'}`}>
            <input value={module.title} onChange={(e) => handleUpdateTitle(e.target.value)} className="font-bold text-lg bg-transparent border-none w-full mb-2" placeholder="Module Title" />
            <div className="space-y-2 pl-4">
                {module.files.map(f => <div key={f.id} className="text-sm p-2 bg-white border rounded flex justify-between">{f.name} <span className="text-xs text-gray-500">{f.type}</span></div>)}
                <button type="button" onClick={() => setIsAddingContent(true)} className="text-sm text-blue-600 font-medium">+ Add Content</button>
            </div>
            {isAddingContent && <AddContentModal onAdd={handleAddContent} onClose={() => setIsAddingContent(false)} />}
        </div>
    );
};

const ProductForm: React.FC<{ product?: ProductWithRating | null; coupons: Coupon[]; onSave: (product: Omit<Product, 'id'>) => void; onCancel: () => void; }> = ({ product, coupons, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        title: product?.title || '',
        description: product?.description || '',
        longDescription: product?.longDescription || '',
        price: product?.price ? product.price.replace('₹', '') : '', 
        salePrice: product?.salePrice ? product.salePrice.replace('₹', '') : '', 
        imageSeed: product?.imageSeed || '',
        category: product?.category || '',
        department: product?.department || 'Unisex',
        inStock: product?.inStock === undefined ? true : product.inStock,
        manualRating: (product?.manualRating !== null && product?.manualRating !== undefined) ? product.manualRating.toString() : '',
        sku: product?.sku || '',
        dimensions: product?.dimensions || '',
        fileFormat: product?.fileFormat || '',
        aspectRatio: product?.aspectRatio || 'aspect-[4/3]',
        isFree: product?.isFree || false,
        couponCode: product?.couponCode || '',
        paymentLink: product?.paymentLink || '',
    });
    const [modules, setModules] = useState<CourseModule[]>(product?.courseContent || []);
    const [images, setImages] = useState<string[]>(product?.images || []);
    
    const [discountPercent, setDiscountPercent] = useState(0);

    useEffect(() => {
        const regular = parseFloat(formData.price) || 0;
        const sale = parseFloat(formData.salePrice) || 0;
        if (regular > 0 && sale > 0 && sale < regular) {
            setDiscountPercent(Math.round(((regular - sale) / regular) * 100));
        } else {
            setDiscountPercent(0);
        }
    }, [formData.price, formData.salePrice]);

    useEffect(() => {
        if (formData.isFree) {
            if (!formData.price || formData.price === '0') {
                setFormData(prev => ({ ...prev, price: '3', salePrice: '' }));
            }
        }
    }, [formData.isFree]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.paymentLink) { alert("Payment Link Required"); return; }
        
        const formattedPrice = formData.price ? `₹${formData.price}` : '₹0';
        const formattedSalePrice = formData.salePrice ? `₹${formData.salePrice}` : undefined;

        onSave({ 
            ...formData, 
            price: formattedPrice,
            salePrice: formattedSalePrice,
            features: [], 
            tags: [], 
            images, 
            imageSeed: formData.imageSeed || formData.title, 
            manualRating: formData.manualRating ? parseFloat(formData.manualRating) : null, 
            courseContent: modules 
        });
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scale-in-up custom-scrollbar">
                <div className="p-8">
                    <h2 className="text-3xl font-bold text-slate-800 mb-8 border-b pb-4">{product ? 'Edit Product' : 'Add New Product'}</h2>
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">Product Title</label><input name="title" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 focus:bg-white transition" required /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">Short Description</label><textarea name="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50" rows={3} required /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">Long Description</label><textarea name="longDescription" value={formData.longDescription} onChange={e => setFormData({...formData, longDescription: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50" rows={4} /></div>
                            </div>
                            <div className="space-y-4">
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">SKU</label><input name="sku" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">Category</label><input name="category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50" /></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">Images (URLs, one per line)</label><textarea value={images.join('\n')} onChange={e => setImages(e.target.value.split('\n'))} className="w-full p-3 border rounded-lg bg-slate-50" rows={3} placeholder="http://..." /></div>
                            </div>
                        </div>

                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                            <h3 className="font-bold text-lg text-blue-800 mb-4">Pricing & Status</h3>
                            
                            <div className="flex items-center mb-6 p-3 bg-white rounded-lg border border-blue-100 shadow-sm">
                                <label className="flex items-center space-x-3 cursor-pointer w-full">
                                    <input type="checkbox" checked={formData.isFree} onChange={e => setFormData({...formData, isFree: e.target.checked})} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" />
                                    <span className="font-bold text-slate-700">Mark as Free Product</span>
                                    {formData.isFree && <span className="text-sm text-blue-600 ml-auto font-medium">Nominal Fee Enabled</span>}
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {formData.isFree ? (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Nominal Fee (₹)</label>
                                        <input type="number" name="price" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-3 border rounded-lg bg-white" required placeholder="3" />
                                        <p className="text-xs text-gray-500 mt-1">This fee handles gateway charges for 'free' products.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Initial Price (MRP) (₹)</label>
                                            <input type="number" name="price" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-3 border rounded-lg bg-white" required placeholder="499" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1">Final Price (Sale) (₹)</label>
                                            <input type="number" name="salePrice" value={formData.salePrice} onChange={e => setFormData({...formData, salePrice: e.target.value})} className="w-full p-3 border rounded-lg bg-white" placeholder="299" />
                                        </div>
                                    </>
                                )}
                                
                                <div className="flex items-center justify-center pt-6">
                                    {!formData.isFree && discountPercent > 0 ? (
                                        <span className="text-lg font-bold text-green-600 bg-green-100 px-4 py-2 rounded-full border border-green-200 animate-pulse">
                                            {discountPercent}% Drop Price
                                        </span>
                                    ) : (
                                        <span className="text-sm text-gray-400">{formData.isFree ? 'Free Product' : 'No discount calculated'}</span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t border-blue-200 pt-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Custom Rating (0.0 - 5.0)</label>
                                    <input type="number" step="0.1" min="0" max="5" name="manualRating" value={formData.manualRating} onChange={e => setFormData({...formData, manualRating: e.target.value})} className="w-full p-3 border rounded-lg bg-white" placeholder="4.8" />
                                    <p className="text-xs text-gray-500 mt-1">Overrides calculated rating.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Stock Status</label>
                                    <select name="inStock" value={formData.inStock ? 'true' : 'false'} onChange={e => setFormData({...formData, inStock: e.target.value === 'true'})} className="w-full p-3 border rounded-lg bg-white cursor-pointer">
                                        <option value="true">In Stock</option>
                                        <option value="false">Out of Stock</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div><label className="block text-sm font-bold text-slate-700 mb-1">Razorpay Payment Page Link (Required)</label><input name="paymentLink" value={formData.paymentLink} onChange={e => setFormData({...formData, paymentLink: e.target.value})} className="w-full p-3 border rounded-lg bg-slate-50 border-green-200 focus:ring-green-500" required placeholder="https://pages.razorpay.com/..." /></div>
                        </div>
                        
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-lg text-slate-700 mb-4">Course Content / Files</h3>
                            {modules.map(m => <ModuleEditor key={m.id} module={m} onUpdate={setModules} allModules={modules} level={0} />)}
                            <button type="button" onClick={() => setModules([...modules, { id: `mod-${Date.now()}`, title: 'New Module', files: [], modules: [] }])} className="mt-4 w-full py-2 bg-white border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-100">+ Add Module</button>
                        </div>

                        <div className="flex justify-end gap-4 pt-6 border-t sticky bottom-0 bg-white p-4">
                            <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 border">Cancel</button>
                            <button type="submit" className="px-8 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg transform hover:-translate-y-0.5 transition-all">Save Product</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const ProductManagement: React.FC<{
    products: ProductWithRating[];
    users: User[];
    coupons: Coupon[];
    onAddProduct: (product: Omit<Product, 'id'>) => void;
    onUpdateProduct: (product: Product) => void;
    onDeleteProduct: (id: number) => void;
}> = ({ products, users, coupons, onAddProduct, onUpdateProduct, onDeleteProduct }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductWithRating | null>(null);
    const [newProductForEmail, setNewProductForEmail] = useState<ProductWithRating | null>(null);

    const handleSave = (productData: Omit<Product, 'id'>) => {
        if (editingProduct) {
            onUpdateProduct({ ...productData, id: editingProduct.id });
        } else {
            onAddProduct(productData);
            setNewProductForEmail({ ...productData, id: Date.now(), rating: 0, reviewCount: 0, calculatedRating: 0 });
        }
        setIsFormOpen(false); setEditingProduct(null);
    };

    return (
        <div className="animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">Product Management</h1>
                    <p className="text-slate-500 mt-1">Manage your digital inventory, prices, and availability.</p>
                </div>
                <button onClick={() => { setEditingProduct(null); setIsFormOpen(true); }} className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Product
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Product Name</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Price</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider">Rating</th>
                                <th className="p-3 sm:p-5 font-bold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {products.map((product) => (
                                <tr key={product.id} className="hover:bg-slate-50/80 transition-all duration-200 hover:shadow-inner group">
                                    <td className="p-3 sm:p-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                                                <img src={product.images[0] || `https://picsum.photos/seed/${product.imageSeed}/100/100`} alt="" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate max-w-[150px] sm:max-w-xs">{product.title}</p>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5">{product.sku || 'NO-SKU'}</p>
                                                {product.isFree && <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 rounded border border-blue-200">FREE</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3 sm:p-5">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${product.inStock ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${product.inStock ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            {product.inStock ? 'In Stock' : 'Out of Stock'}
                                        </span>
                                    </td>
                                    <td className="p-3 sm:p-5 font-semibold text-slate-700">
                                        {product.salePrice ? (
                                            <div className="flex flex-col">
                                                <span className="text-red-600">{product.salePrice}</span>
                                                <span className="text-xs text-slate-400 line-through font-normal">{product.price}</span>
                                            </div>
                                        ) : product.price}
                                    </td>
                                    <td className="p-3 sm:p-5">
                                        <div className="flex items-center gap-1 text-slate-600 text-sm">
                                            <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                            <span className="font-bold">{product.rating.toFixed(1)}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 sm:p-5 text-right space-x-2">
                                        <button onClick={() => { setEditingProduct(product); setIsFormOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </button>
                                        <button onClick={() => onDeleteProduct(product.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isFormOpen && <ProductForm product={editingProduct} coupons={coupons} onSave={handleSave} onCancel={() => setIsFormOpen(false)} />}
            {newProductForEmail && <NewProductEmailPreviewModal product={newProductForEmail} relatedProducts={[]} users={users} onClose={() => setNewProductForEmail(null)} />}
        </div>
    );
};

export default ProductManagement;
