import "./course-loading-dots.css";

/** Visual indicator only; the parent owns the real readiness state. */
export default function CourseLoadingDots() {
  return (
    <div className="course-loading-dots" data-course-loading-dots aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <span className="course-loading-dot" key={index} />
      ))}
    </div>
  );
}
