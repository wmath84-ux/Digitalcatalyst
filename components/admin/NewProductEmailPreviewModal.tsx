import React, { useState, useEffect } from 'react';
import { ProductWithRating, User } from '../../App';
import { GoogleGenAI, Modality } from '@google/genai';

interface NewProductEmailPreviewModalProps {
    product: ProductWithRating;
    relatedProducts: ProductWithRating[];
    users: User[];
    onClose: () => void;
}

const NewProductEmailPreviewModal: React.FC<NewProductEmailPreviewModalProps> = ({ product, relatedProducts, users, onClose }) => {
    const [marketingImageUrl, setMarketingImageUrl] = useState<string | null>(null);
    const [isLoadingImage, setIsLoadingImage] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [isSent, setIsSent] = useState(false);

    useEffect(() => {
        const generateMarketingImage = async () => {
            setIsLoadingImage(true);
            try {
                if (!process.env.API_KEY) {
                    throw new Error("API_KEY is not configured.");
                }
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const prompt = `Create a vibrant, eye-catching marketing banner for a new product announcement email. The product is called "${product.title}". It is described as: "${product.description}". The style should be modern, clean, and exciting, suitable for a digital product e-commerce store. Use a professional and dynamic color palette. Aspect ratio should be 2:1.`;
                
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: [{ text: prompt }] },
                    config: {
                        responseModalities: [Modality.IMAGE],
                    },
                });

                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64ImageBytes = part.inlineData.data;
                        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
                        setMarketingImageUrl(imageUrl);
                        break;
                    }
                }
            } catch (err) {
                console.error("Error generating marketing image:", err);
                // Fallback to product image if AI fails
                setMarketingImageUrl(product.images[0] || `https://picsum.photos/seed/${product.imageSeed}/1200/600`);
            } finally {
                setIsLoadingImage(false);
            }
        };

        generateMarketingImage();
    }, [product]);

    const handleSend = () => {
        setIsSending(true);
        // Simulate sending email
        setTimeout(() => {
            setIsSending(false);
            setIsSent(true);
            setTimeout(() => {
                onClose();
            }, 2000); // Close modal after 2 seconds
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex justify-center items-center p-4 font-sans animate-fade-in" onClick={onClose}>
            <div className="bg-gray-100 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in-up" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b bg-white rounded-t-lg flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Email Preview: New Product Announcement</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-2xl" aria-label="Close modal">&times;</button>
                </header>

                <main className="flex-1 p-6 overflow-y-auto">
                    <div className="bg-white rounded-md shadow-md overflow-hidden border">
                        {/* Email Metadata */}
                        <div className="p-4 bg-gray-50 border-b text-xs text-gray-500">
                            <p><strong>To:</strong> All Users ({users.length} recipients)</p>
                            <p><strong>Subject:</strong> 🚀 New Arrival: {product.title}!</p>
                        </div>
                        
                        {/* Email Body */}
                        <div className="p-6">
                            {/* Header Image */}
                            <div className="h-64 bg-gray-200 flex items-center justify-center rounded-md mb-6 overflow-hidden">
                                {isLoadingImage ? (
                                    <div className="flex items-center space-x-2 text-gray-500">
                                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                        <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
                                        <span className="text-sm">Generating AI Marketing Image...</span>
                                    </div>
                                ) : marketingImageUrl ? (
                                    <img src={marketingImageUrl} alt="AI Generated Marketing Banner" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-sm text-gray-500">Image Unavailable</div>
                                )}
                            </div>
                            
                            {/* Main Product Feature */}
                            <div className="text-center">
                                <h3 className="text-3xl font-extrabold text-primary">{product.title}</h3>
                                <p className="mt-4 max-w-2xl mx-auto text-gray-600">{product.description}</p>
                            </div>

                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-gray-50 p-6 rounded-lg">
                                <div className="aspect-video bg-gray-200 rounded-md overflow-hidden">
                                    <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover"/>
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-gray-800">{product.title}</h4>
                                    <div className="my-2">
                                        {product.salePrice ? (
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-2xl font-bold text-primary">{product.salePrice}</span>
                                                <span className="text-lg font-medium text-gray-400 line-through">{product.price}</span>
                                            </div>
                                        ) : (
                                            <span className="text-2xl font-bold text-primary">{product.price}</span>
                                        )}
                                    </div>
                                    <button className="w-full mt-4 bg-primary text-white font-bold py-3 rounded-lg hover:opacity-90">
                                        Shop Now
                                    </button>
                                </div>
                            </div>
                            
                            {/* Related Products */}
                            {relatedProducts.length > 0 && (
                                <div className="mt-10 pt-6 border-t">
                                    <h4 className="text-xl font-semibold text-gray-800 text-center mb-6">You Might Also Like</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {relatedProducts.map(p => (
                                            <div key={p.id} className="border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow">
                                                <div className="aspect-video bg-gray-100"><img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" /></div>
                                                <div className="p-3"><h4 className="font-semibold text-sm truncate text-gray-800">{p.title}</h4><p className="text-xs text-gray-500">{p.salePrice || p.price}</p></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
                
                <footer className="p-4 bg-gray-200 border-t flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isSending || isSent} className="px-5 py-2 bg-white text-gray-800 rounded-lg hover:bg-gray-50 border font-semibold disabled:opacity-50">Cancel</button>
                    <button onClick={handleSend} disabled={isSending || isSent} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:bg-gray-400 w-48 justify-center">
                        {isSending ? (
                             <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : isSent ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                Sent!
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>
                                Send to All Users
                            </>
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default NewProductEmailPreviewModal;