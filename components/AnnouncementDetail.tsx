import React from 'react';
import { Announcement, WebsiteSettings } from '../App';

interface AnnouncementDetailProps {
  settings: WebsiteSettings;
  announcement: Announcement;
  onBack: () => void;
}

const AnnouncementDetail: React.FC<AnnouncementDetailProps> = ({ settings, announcement, onBack }) => {
  return (
    <div className="bg-background min-h-screen font-sans animate-fade-in">
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary truncate">Announcement</h1>
          <button
            onClick={onBack}
            className="bg-primary text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition-colors duration-300"
          >
            &larr; Back
          </button>
        </div>
      </header>
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-lg shadow-lg animate-fade-in-up">
          <div className="flex flex-col sm:flex-row justify-between items-start mb-6 border-b pb-4 gap-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-primary">{announcement.title}</h2>
            <span className="text-sm text-text-muted flex-shrink-0 sm:pt-2">{new Date(announcement.date).toLocaleDateString()}</span>
          </div>
          <div className="space-y-4 text-lg text-text-muted">
            {/* Split content by newlines to render paragraphs */}
            {announcement.content.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AnnouncementDetail;
