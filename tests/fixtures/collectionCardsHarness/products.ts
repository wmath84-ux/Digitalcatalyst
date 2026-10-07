const cover = (width: number, height: number, color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#fff" opacity=".3"/></svg>`)}`;
export const products = [
  { id: "short", title: "Physics", image: cover(1600, 600, "#24597a") },
  { id: "long", title: "Complete mathematics preparation: algebra, geometry and advanced problem solving", image: cover(600, 1000, "#46418b") },
  { id: "hindi", title: "भौतिक विज्ञान — गति और ऊर्जा की सम्पूर्ण तैयारी", image: cover(800, 800, "#1d645c") },
  { id: "unbroken", title: "VeryLongUnbrokenCourseTitleThatMustNeverForceTheCardOutsideItsGridColumn", image: cover(1600, 500, "#793b57") },
].map((p, index) => ({ ...p, author: index === 1 ? "Dr. Ananya Sharma and the advanced learning team" : "Digital Catalyst", instructor: "Digital Catalyst", category: index === 2 ? "PDF" : "Course", price: index === 3 ? 0 : 1299, originalPrice: index === 3 ? 0 : 2499, rating: 4.8, reviewsCount: 1240, hours: "12 hours", lessons: 48, tags: [], subject: "Science" }));
