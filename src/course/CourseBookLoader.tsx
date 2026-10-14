import "./course-book-loader.css";

/** Nawsome's page-turning book (MIT / Uiverse). Readiness belongs to the parent. */
export default function CourseBookLoader() {
  return (
    <div className="course-book-loader" data-course-book-loader aria-hidden="true">
      <div className="course-book-loader__cover">
        <ul>
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index}>
              <svg viewBox="0 0 90 120" fill="currentColor" focusable="false">
                <path d="M0 5C0 2.2 2.2 0 5 0h70c8.3 0 15 6.7 15 15v105H15c-8.3 0-15-6.7-15-15V5Z" />
              </svg>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
