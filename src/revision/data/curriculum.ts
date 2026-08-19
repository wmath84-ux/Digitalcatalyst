// Built-in academic curriculum for the student AI question generator.
//
// The generator's four cascading dropdowns (Class → Subject → Chapter →
// Topic) read from this static hierarchy. The selected names are sent to the
// AI as plain text, so the data only needs to describe *what to ask about* —
// no questions are stored here.

export type CurriculumTopic = { key: string; name: string };
export type CurriculumChapter = { key: string; name: string; topics: CurriculumTopic[] };
export type CurriculumSubject = { key: string; name: string; icon: string; chapters: CurriculumChapter[] };
export type CurriculumClass = { key: string; name: string; icon: string; subjects: CurriculumSubject[] };

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function ch(name: string, topics: string[]): CurriculumChapter {
  return { key: slug(name), name, topics: topics.map((t) => ({ key: slug(t), name: t })) };
}

function subj(name: string, icon: string, chapters: CurriculumChapter[]): CurriculumSubject {
  return { key: slug(name), name, icon, chapters };
}

/* ------------------------------------------------------------------ */
/* Middle school (Class 6–8)                                           */
/* ------------------------------------------------------------------ */

const MIDDLE_SUBJECTS = (): CurriculumSubject[] => [
  subj("Mathematics", "📐", [
    ch("Number System", ["Place Value & Estimation", "Integers", "Fractions & Decimals", "Rational Numbers"]),
    ch("Playing with Numbers", ["Factors & Multiples", "HCF & LCM", "Divisibility Rules"]),
    ch("Algebra Basics", ["Variables & Expressions", "Simple Equations", "Exponents & Powers"]),
    ch("Geometry", ["Lines & Angles", "Triangles & Quadrilaterals", "Circles", "Symmetry"]),
    ch("Mensuration", ["Perimeter", "Area", "Volume & Surface Area"]),
    ch("Data Handling", ["Bar Graphs & Pictographs", "Mean, Median & Mode", "Chance & Probability"]),
    ch("Ratio & Proportion", ["Ratios", "Unitary Method", "Percentage"]),
  ]),
  subj("Science", "🔬", [
    ch("Food & Nutrition", ["Components of Food", "Sources of Food", "Balanced Diet & Deficiency Diseases"]),
    ch("Materials & Matter", ["Sorting Materials", "Separation of Substances", "Changes Around Us", "States of Matter"]),
    ch("Living World", ["Getting to Know Plants", "Body Movements in Animals", "Living Organisms & Habitats", "Cell Structure"]),
    ch("Motion & Forces", ["Motion & Measurement of Distances", "Force & Pressure", "Friction"]),
    ch("Light & Sound", ["Light, Shadows & Reflections", "Sound Production & Propagation"]),
    ch("Electricity & Magnetism", ["Electric Circuits", "Conductors & Insulators", "Magnets"]),
    ch("Natural Resources", ["Air Around Us", "Water Cycle", "Garbage & Waste Management"]),
  ]),
  subj("English", "📖", [
    ch("Grammar", ["Nouns & Pronouns", "Verbs & Tenses", "Adjectives & Adverbs", "Prepositions & Conjunctions"]),
    ch("Sentence Skills", ["Subject-Verb Agreement", "Active & Passive Voice", "Direct & Indirect Speech"]),
    ch("Vocabulary", ["Synonyms & Antonyms", "Idioms & Phrases", "Word Formation"]),
    ch("Reading Comprehension", ["Unseen Passages", "Poem Comprehension"]),
    ch("Writing Skills", ["Paragraph Writing", "Letter Writing", "Notice & Message Writing"]),
  ]),
  subj("Social Science", "🌏", [
    ch("History", ["Early Humans & Civilisations", "Kingdoms & Empires", "Medieval India", "Culture & Heritage"]),
    ch("Geography", ["Earth & the Solar System", "Globe: Latitudes & Longitudes", "Landforms", "Climate & Weather"]),
    ch("Civics", ["Understanding Diversity", "Local Government", "Rural & Urban Livelihoods", "The Constitution"]),
  ]),
  subj("Computer Science", "💻", [
    ch("Computer Fundamentals", ["Parts of a Computer", "Hardware & Software", "Input & Output Devices"]),
    ch("Working with Software", ["Word Processing", "Spreadsheets Basics", "Presentations"]),
    ch("Internet Basics", ["Web Browsers & Search", "Email", "Online Safety"]),
    ch("Coding Basics", ["Algorithms & Flowcharts", "Block Coding", "Introduction to Programming"]),
  ]),
];

/* ------------------------------------------------------------------ */
/* Secondary (Class 9–10)                                              */
/* ------------------------------------------------------------------ */

const SECONDARY_SUBJECTS = (): CurriculumSubject[] => [
  subj("Mathematics", "📐", [
    ch("Real Numbers", ["Irrational Numbers", "Laws of Exponents", "Euclid's Division Lemma", "HCF & LCM"]),
    ch("Polynomials", ["Zeros of a Polynomial", "Remainder & Factor Theorem", "Algebraic Identities"]),
    ch("Linear Equations", ["Equations in Two Variables", "Graphical Solutions", "Substitution & Elimination"]),
    ch("Quadratic Equations", ["Factorisation Method", "Quadratic Formula", "Nature of Roots"]),
    ch("Geometry", ["Triangles & Congruence", "Similarity", "Circles & Tangents", "Constructions"]),
    ch("Trigonometry", ["Trigonometric Ratios", "Trigonometric Identities", "Heights & Distances"]),
    ch("Coordinate Geometry", ["Distance Formula", "Section Formula", "Area of a Triangle"]),
    ch("Statistics & Probability", ["Mean, Median & Mode of Grouped Data", "Probability Basics"]),
    ch("Mensuration", ["Surface Areas", "Volumes", "Areas Related to Circles"]),
  ]),
  subj("Science", "🔬", [
    ch("Matter & Its Nature", ["Matter in Our Surroundings", "Is Matter Around Us Pure", "Atoms & Molecules", "Structure of the Atom"]),
    ch("Chemical Reactions", ["Types of Chemical Reactions", "Acids, Bases & Salts", "Metals & Non-Metals", "Carbon & Its Compounds"]),
    ch("Life Processes", ["Nutrition & Respiration", "Transportation & Excretion", "Control & Coordination"]),
    ch("Cell & Tissues", ["The Fundamental Unit of Life", "Tissues", "Why Do We Fall Ill"]),
    ch("Reproduction & Heredity", ["How Do Organisms Reproduce", "Heredity & Evolution"]),
    ch("Motion & Laws of Motion", ["Motion", "Force & Laws of Motion", "Gravitation", "Work & Energy"]),
    ch("Light & Electricity", ["Reflection & Refraction", "Human Eye & Colourful World", "Electricity", "Magnetic Effects of Current"]),
    ch("Environment", ["Our Environment", "Natural Resource Management"]),
  ]),
  subj("English", "📖", [
    ch("Grammar", ["Tenses", "Modals", "Subject-Verb Agreement", "Determiners"]),
    ch("Transformation of Sentences", ["Active & Passive Voice", "Reported Speech", "Clauses"]),
    ch("Vocabulary", ["Synonyms & Antonyms", "One-Word Substitution", "Idioms & Phrases"]),
    ch("Reading", ["Discursive Passages", "Case-Based Passages"]),
    ch("Writing", ["Formal Letters", "Analytical Paragraphs", "Story Writing"]),
  ]),
  subj("Social Science", "🌏", [
    ch("History", ["The French Revolution", "Nationalism in India", "The Making of a Global World", "Print Culture"]),
    ch("Geography", ["Resources & Development", "Agriculture", "Minerals & Energy Resources", "Manufacturing Industries"]),
    ch("Civics", ["What is Democracy", "Federalism", "Political Parties", "Outcomes of Democracy"]),
    ch("Economics", ["Development", "Sectors of the Indian Economy", "Money & Credit", "Globalisation"]),
  ]),
  subj("Computer Applications", "💻", [
    ch("Computer Systems", ["Operating Systems", "Memory & Storage", "Networking Basics"]),
    ch("Office Tools", ["Advanced Word Processing", "Spreadsheet Formulas & Charts", "Databases Introduction"]),
    ch("Internet & Cyber Safety", ["Web Services", "Cyber Ethics", "Safe Online Practices"]),
    ch("Programming", ["Python Basics", "Conditionals & Loops", "Lists & Strings"]),
  ]),
];

/* ------------------------------------------------------------------ */
/* Senior secondary (Class 11–12)                                      */
/* ------------------------------------------------------------------ */

const SENIOR_SUBJECTS = (): CurriculumSubject[] => [
  subj("Physics", "⚛️", [
    ch("Mechanics", ["Units & Measurement", "Kinematics", "Laws of Motion", "Work, Energy & Power", "Rotational Motion", "Gravitation"]),
    ch("Properties of Matter", ["Mechanical Properties of Solids", "Fluids", "Thermal Properties"]),
    ch("Thermodynamics", ["Laws of Thermodynamics", "Kinetic Theory of Gases"]),
    ch("Oscillations & Waves", ["Simple Harmonic Motion", "Wave Motion", "Sound Waves"]),
    ch("Electrostatics & Current", ["Electric Charges & Fields", "Potential & Capacitance", "Current Electricity"]),
    ch("Magnetism & Induction", ["Moving Charges & Magnetism", "Electromagnetic Induction", "Alternating Current"]),
    ch("Optics", ["Ray Optics", "Wave Optics"]),
    ch("Modern Physics", ["Dual Nature of Matter", "Atoms & Nuclei", "Semiconductors"]),
  ]),
  subj("Chemistry", "🧪", [
    ch("Physical Chemistry", ["Mole Concept", "Atomic Structure", "Thermodynamics", "Equilibrium", "Electrochemistry", "Chemical Kinetics"]),
    ch("Inorganic Chemistry", ["Periodic Table & Periodicity", "Chemical Bonding", "Coordination Compounds", "d- and f-Block Elements"]),
    ch("Organic Chemistry", ["General Organic Chemistry", "Hydrocarbons", "Haloalkanes & Haloarenes", "Alcohols, Phenols & Ethers", "Aldehydes, Ketones & Acids", "Amines & Biomolecules"]),
    ch("Solutions & States", ["Solutions & Colligative Properties", "Solid State", "Surface Chemistry"]),
  ]),
  subj("Mathematics", "📐", [
    ch("Algebra", ["Sets & Relations", "Complex Numbers", "Sequences & Series", "Permutations & Combinations", "Binomial Theorem", "Matrices & Determinants"]),
    ch("Calculus", ["Limits & Continuity", "Differentiation", "Applications of Derivatives", "Integration", "Differential Equations"]),
    ch("Coordinate Geometry", ["Straight Lines", "Conic Sections", "Three-Dimensional Geometry"]),
    ch("Trigonometry", ["Trigonometric Functions", "Inverse Trigonometric Functions"]),
    ch("Vectors", ["Vector Algebra", "Scalar & Vector Products"]),
    ch("Probability & Statistics", ["Conditional Probability", "Bayes' Theorem", "Probability Distributions", "Statistics"]),
  ]),
  subj("Biology", "🧬", [
    ch("Diversity of Life", ["The Living World", "Biological Classification", "Plant Kingdom", "Animal Kingdom"]),
    ch("Cell Biology", ["Cell: The Unit of Life", "Biomolecules", "Cell Cycle & Division"]),
    ch("Plant Physiology", ["Photosynthesis", "Respiration in Plants", "Plant Growth & Development"]),
    ch("Human Physiology", ["Digestion & Absorption", "Breathing & Exchange of Gases", "Body Fluids & Circulation", "Neural Control & Coordination"]),
    ch("Reproduction", ["Sexual Reproduction in Plants", "Human Reproduction", "Reproductive Health"]),
    ch("Genetics & Evolution", ["Principles of Inheritance", "Molecular Basis of Inheritance", "Evolution"]),
    ch("Biotechnology & Ecology", ["Biotechnology Principles", "Ecosystems", "Biodiversity & Conservation"]),
  ]),
  subj("English", "📖", [
    ch("Grammar & Usage", ["Advanced Tenses", "Transformation of Sentences", "Error Detection"]),
    ch("Reading", ["Unseen Passages", "Note Making & Summarising"]),
    ch("Writing", ["Notice & Advertisement", "Article & Report Writing", "Formal & Business Letters"]),
    ch("Literature Skills", ["Prose Comprehension", "Poetry Devices"]),
  ]),
  subj("Computer Science", "💻", [
    ch("Programming with Python", ["Python Revision", "Functions", "File Handling", "Exception Handling"]),
    ch("Data Structures", ["Stacks", "Queues", "Searching & Sorting"]),
    ch("Databases", ["Relational Model", "SQL Queries", "Python-SQL Connectivity"]),
    ch("Computer Networks", ["Network Devices & Topologies", "Protocols", "Network Security"]),
  ]),
];

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

export const CURRICULUM: CurriculumClass[] = [
  { key: "class-6", name: "Class 6", icon: "🎒", subjects: MIDDLE_SUBJECTS() },
  { key: "class-7", name: "Class 7", icon: "🎒", subjects: MIDDLE_SUBJECTS() },
  { key: "class-8", name: "Class 8", icon: "🎒", subjects: MIDDLE_SUBJECTS() },
  { key: "class-9", name: "Class 9", icon: "📚", subjects: SECONDARY_SUBJECTS() },
  { key: "class-10", name: "Class 10", icon: "📚", subjects: SECONDARY_SUBJECTS() },
  { key: "class-11", name: "Class 11", icon: "🎓", subjects: SENIOR_SUBJECTS() },
  { key: "class-12", name: "Class 12", icon: "🎓", subjects: SENIOR_SUBJECTS() },
];
