import type { Product } from "../data/products";

export interface ProductPresentation {
  title: string;
  subjectLabel: string;
  typeLabel: string;
  noun: string;
  pluralNoun: string;
  isCourse: boolean;
  aboutHeading: string;
  libraryAction: string;
}

const cleanText = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeClassNumber = (value: unknown): string | null => {
  const match = cleanText(value).match(/\b(?:class|grade)\s*[-–—]?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
  return match ? String(Number(match[1])) : null;
};

const isGenericSubject = (subject: string): boolean =>
  !subject || /^(?:digital learning|learning|general|course|courses|notes?|pdf|e-?book|live|video|other)$/i.test(subject);

const normalizeSubject = (subject: string): string => {
  const value = cleanText(subject);
  if (isGenericSubject(value)) return "";
  if (/^(?:math|maths)$/i.test(value)) return "Mathematics";
  return value;
};

const stripLeadingSubject = (topic: string, subject: string): string => {
  if (!subject) return topic;
  const variants = /^mathematics$/i.test(subject) ? [subject, "maths", "math"] : [subject];
  const escaped = variants.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stripped = topic.replace(new RegExp(`^(?:${escaped})(?=$|\\s|[-–—:|,])(?:\\s*[-–—:|,]\\s*|\\s+|$)`, "i"), "").trim();
  return stripped || (variants.some((variant) => variant.toLowerCase() === topic.toLowerCase()) ? "" : topic);
};

/**
 * Present titles that were stored as phrases such as "Notes, For Class -10th
 * Real Number" in a consistent, metadata-led structure, without changing the
 * source product record or guessing a different chapter name.
 */
const cleanProductTitle = (product: Product): { title: string; parsedClass: string | null } => {
  const source = cleanText(product.title) || "Untitled product";
  const match = source.match(
    /^(?:(?:study\s+)?notes?|pdf|course|e-?book|live(?:\s+class)?)\s*[,;:\-–—]?\s*(?:for\s+)?class\s*[-–—]?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-–—:|,]\s*)?(.+)$/i,
  ) || source.match(
    /^(?:for\s+)?class\s*[-–—]?\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-–—:|,]\s*)?(.+)$/i,
  );

  if (!match || !match[2]?.trim()) return { title: source, parsedClass: null };
  const classNumber = String(Number(match[1]));
  const metadataClass = normalizeClassNumber(product.classLevel);
  // If the title and level metadata disagree, preserve the title's own class
  // and leave the level visible as a separate field rather than silently
  // substituting one source of truth for another.
  const subject = normalizeSubject(product.subject);
  const topic = stripLeadingSubject(cleanText(match[2]).replace(/^[-–—:|,\s]+/, ""), subject);
  const titleBase = [`Class ${classNumber}`, subject].filter(Boolean).join(" ");
  const title = topic
    ? `${titleBase} — ${topic.charAt(0).toLocaleUpperCase()}${topic.slice(1)}`
    : titleBase;

  return { title, parsedClass: metadataClass && metadataClass !== classNumber ? null : classNumber };
};

export function getProductPresentation(product: Product): ProductPresentation {
  const normalizedTitle = cleanText(product.title);
  const titleResult = cleanProductTitle(product);
  const hasNotesInTitle = /\bnotes?\b/i.test(normalizedTitle);
  const typeLabel = product.category === "PDF" && hasNotesInTitle
    ? "PDF notes"
    : product.category;
  const isCourse = product.category === "Course";
  const noun = typeLabel === "Course"
    ? "course"
    : typeLabel === "Live"
      ? "learning resource"
      : /notes/i.test(typeLabel)
        ? "notes"
        : typeLabel === "PDF"
          ? "PDF resource"
          : typeLabel === "E-book"
            ? "e-book"
            : "learning resource";
  const pluralNoun = noun === "notes" ? "notes" : `${noun}s`;
  const aboutHeading = noun === "notes"
    ? "About these notes"
    : noun === "course"
      ? "About this course"
      : noun === "e-book"
        ? "About this e-book"
        : noun === "PDF resource"
          ? "About this PDF"
          : "About this resource";

  return {
    title: titleResult.title,
    subjectLabel: normalizeSubject(product.subject),
    typeLabel,
    noun,
    pluralNoun,
    isCourse,
    aboutHeading,
    libraryAction: isCourse ? "Open course in library" : "Open in library",
  };
}

export function getProductClassLabel(product: Product, parsedClass?: string | null): string {
  const source = cleanText(product.classLevel);
  if (!source) return "";
  // CatalogContext uses this exact value when a product has no level or
  // dimensions. Treat it as missing metadata unless the product copy itself
  // explicitly confirms lifetime access, rather than presenting the mapper's
  // default as a product-specific promise.
  if (/^lifetime access$/i.test(source)) {
    const productCopy = [product.description, ...(product.features || [])].map(cleanText).join(" ");
    if (!/\blifetime access\b/i.test(productCopy)) return "";
  }
  const match = source.match(/^(?:class|grade)\s*[-–—]?\s*(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (match) return `Class ${Number(match[1])}`;
  if (parsedClass && normalizeClassNumber(source) && normalizeClassNumber(source) !== parsedClass) return source;
  return source;
}

export function getProductSubjectLabel(product: Product): string {
  return normalizeSubject(product.subject);
}

export function getProductInstructorLabel(product: Product): string {
  const instructor = cleanText(product.instructor);
  // CatalogContext fills a missing instructor/provider with the platform name.
  // Keep the brand in the storefront identity instead of implying it teaches
  // every listed product.
  return /^digital catalyst$/i.test(instructor) ? "" : instructor;
}
