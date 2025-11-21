

import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
// FIX: Corrected import path for SupportTicket to resolve circular dependency and import error.
import { SupportTicket } from '../../App';

interface EmailPreviewModalProps {
    ticket: SupportTicket;
    replyText: string;
    attachment: File | null;
    onClose: () => void;
    onConfirmSend: () => void;
}

const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({ ticket, replyText, attachment, onClose, onConfirmSend }) => {
    const [isLoadingImage, setIsLoadingImage] = useState(true);
    const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const generateHeaderImage = async () => {
            setIsLoadingImage(true);
            try {
                if (!process.env.API_KEY) {
                    throw new Error("API_KEY is not configured.");
                }
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const prompt = `Generate a professional and visually appealing abstract background image for a customer support email header. The topic is "${ticket.subject}". The image should evoke a sense of helpfulness and clarity. Use a calming blue and white color palette.`;
                
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
                        setHeaderImageUrl(imageUrl);
                        break;
                    }
                }

            } catch (err) {
                console.error("Error generating header image:", err);
                setHeaderImageUrl(null); // Fallback to no image on error
            } finally {
                setIsLoadingImage(false);
            }
        };

        generateHeaderImage();
    }, [ticket.subject]);
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex justify-center items-center p-4 font-sans animate-fade-in">
            <div className="bg-gray-100 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in-up">
                <div className="p-4 border-b bg-white rounded-t-lg flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">Email Preview</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-2xl">&times;</button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="bg-white rounded-md shadow-md overflow-hidden border">
                         {/* Header Image */}
                        <div className="h-48 bg-gray-200 flex items-center justify-center">
                             {isLoadingImage ? (
                                <div className="flex items-center space-x-2 text-gray-500">
                                    <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                                    <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                                    <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
                                    <span className="text-sm">Generating AI header image...</span>
                                </div>
                            ) : headerImageUrl ? (
                                <img src={headerImageUrl} alt="AI Generated Header" className="w-full h-full object-cover" />
                            ) : (
                                <div className="text-sm text-gray-500">Header Image Unavailable</div>
                            )}
                        </div>

                        <div className="p-6">
                            {/* Email Metadata */}
                            <div className="border-b pb-4 text-sm text-gray-600 space-y-1">
                                <p><strong>From:</strong> Digital Catalyst Support &lt;support@digitalcatalyst.com&gt;</p>
                                <p><strong>To:</strong> {ticket.customerName} &lt;{ticket.customerEmail}&gt;</p>
                                <p><strong>Subject:</strong> Re: {ticket.subject}</p>
                            </div>
                            
                            {/* Email Body */}
                            <div className="prose prose-sm max-w-none mt-4 text-gray-800">
                                <p>Hi {ticket.customerName},</p>
                                <div dangerouslySetInnerHTML={{ __html: replyText.replace(/\n/g, '<br />') }} />
                            </div>

                            {/* Attachments */}
                            {attachment && (
                                <div className="mt-6 pt-4 border-t">
                                    <h4 className="font-semibold text-gray-700 text-sm mb-2">Attachment:</h4>
                                    <div className="bg-gray-100 p-2 rounded-md text-sm text-gray-800 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                                           <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 006 0V7a1 1 0 112 0v4a5 5 0 01-10 0V7a5 5 0 0110 0v4a1 1 0 11-2 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                        </svg>
                                        <span>{attachment.name}</span>
                                        <span className="text-gray-500">({(attachment.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                     <p className="text-xs text-gray-500 text-center mt-4">
                        This is a preview. In a live application, this email would be sent directly from the server.
                    </p>
                </div>

                <div className="p-4 bg-gray-50 border-t flex justify-end space-x-3">
                    <button onClick={onClose} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold">Cancel</button>
                    <button onClick={onConfirmSend} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        Confirm & Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmailPreviewModal;
