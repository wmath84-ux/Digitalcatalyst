export type SeedQuestion = {
  topicSlug: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type SeedTopic = {
  slug: string;
  name: string;
  subjectSlug: string;
};

export type SeedSubject = {
  slug: string;
  name: string;
  icon: string;
  color: string;
};

export const SEED_SUBJECTS: SeedSubject[] = [
  { slug: "mathematics", name: "Mathematics", icon: "📐", color: "indigo" },
  { slug: "science", name: "Science", icon: "🔬", color: "emerald" },
  { slug: "english", name: "English", icon: "📖", color: "amber" },
  { slug: "computer-science", name: "Computer Science", icon: "💻", color: "sky" },
  { slug: "general-knowledge", name: "General Knowledge", icon: "🌍", color: "rose" },
];

export const SEED_TOPICS: SeedTopic[] = [
  { slug: "algebra", name: "Algebra", subjectSlug: "mathematics" },
  { slug: "geometry", name: "Geometry", subjectSlug: "mathematics" },
  { slug: "arithmetic", name: "Arithmetic", subjectSlug: "mathematics" },

  { slug: "physics", name: "Physics", subjectSlug: "science" },
  { slug: "chemistry", name: "Chemistry", subjectSlug: "science" },
  { slug: "biology", name: "Biology", subjectSlug: "science" },

  { slug: "grammar", name: "Grammar", subjectSlug: "english" },
  { slug: "vocabulary", name: "Vocabulary", subjectSlug: "english" },
  { slug: "comprehension", name: "Comprehension", subjectSlug: "english" },

  { slug: "programming-basics", name: "Programming Basics", subjectSlug: "computer-science" },
  { slug: "data-structures", name: "Data Structures", subjectSlug: "computer-science" },
  { slug: "web-development", name: "Web Development", subjectSlug: "computer-science" },

  { slug: "history", name: "History", subjectSlug: "general-knowledge" },
  { slug: "geography", name: "Geography", subjectSlug: "general-knowledge" },
  { slug: "current-affairs", name: "Current Affairs", subjectSlug: "general-knowledge" },
];

export const SEED_QUESTIONS: SeedQuestion[] = [
  // Algebra
  { topicSlug: "algebra", difficulty: "easy", prompt: "Solve for x: x + 7 = 12", options: ["3", "4", "5", "6"], correctIndex: 2, explanation: "Subtract 7 from both sides: x = 12 - 7 = 5." },
  { topicSlug: "algebra", difficulty: "easy", prompt: "What is the value of 3x when x = 4?", options: ["7", "12", "9", "10"], correctIndex: 1, explanation: "3 × 4 = 12." },
  { topicSlug: "algebra", difficulty: "medium", prompt: "Solve for x: 2x - 5 = 11", options: ["6", "7", "8", "9"], correctIndex: 2, explanation: "2x = 16, so x = 8." },
  { topicSlug: "algebra", difficulty: "medium", prompt: "Simplify: 3(x + 2) - 4", options: ["3x + 2", "3x - 2", "3x + 6", "x + 2"], correctIndex: 0, explanation: "3x + 6 - 4 = 3x + 2." },
  { topicSlug: "algebra", difficulty: "hard", prompt: "If x² - 5x + 6 = 0, what are the roots?", options: ["1, 6", "2, 3", "-2, -3", "2, -3"], correctIndex: 1, explanation: "Factoring gives (x-2)(x-3)=0, so x = 2 or x = 3." },
  { topicSlug: "algebra", difficulty: "hard", prompt: "What is the slope of the line 4x - 2y = 8?", options: ["2", "-2", "4", "0.5"], correctIndex: 0, explanation: "Rewriting as y = 2x - 4, slope = 2." },

  // Geometry
  { topicSlug: "geometry", difficulty: "easy", prompt: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], correctIndex: 1, explanation: "A hexagon has 6 sides." },
  { topicSlug: "geometry", difficulty: "easy", prompt: "What is the sum of interior angles of a triangle?", options: ["90°", "180°", "270°", "360°"], correctIndex: 1, explanation: "The interior angles of any triangle always sum to 180°." },
  { topicSlug: "geometry", difficulty: "medium", prompt: "What is the area of a circle with radius 7 (use π ≈ 22/7)?", options: ["154", "144", "132", "168"], correctIndex: 0, explanation: "Area = πr² = 22/7 × 7 × 7 = 154." },
  { topicSlug: "geometry", difficulty: "medium", prompt: "A rectangle has length 12 and width 5. What is its perimeter?", options: ["17", "34", "60", "24"], correctIndex: 1, explanation: "Perimeter = 2(l + w) = 2(17) = 34." },
  { topicSlug: "geometry", difficulty: "hard", prompt: "What is the length of the hypotenuse of a right triangle with legs 9 and 12?", options: ["13", "14", "15", "16"], correctIndex: 2, explanation: "√(9² + 12²) = √(81+144) = √225 = 15." },
  { topicSlug: "geometry", difficulty: "hard", prompt: "What is the volume of a cube with side length 4?", options: ["16", "48", "64", "12"], correctIndex: 2, explanation: "Volume = side³ = 4³ = 64." },

  // Arithmetic
  { topicSlug: "arithmetic", difficulty: "easy", prompt: "What is 15% of 200?", options: ["20", "25", "30", "35"], correctIndex: 2, explanation: "15% of 200 = 0.15 × 200 = 30." },
  { topicSlug: "arithmetic", difficulty: "easy", prompt: "What is 144 ÷ 12?", options: ["10", "11", "12", "13"], correctIndex: 2, explanation: "144 ÷ 12 = 12." },
  { topicSlug: "arithmetic", difficulty: "medium", prompt: "What is the least common multiple (LCM) of 4 and 6?", options: ["8", "12", "16", "24"], correctIndex: 1, explanation: "The smallest number divisible by both 4 and 6 is 12." },
  { topicSlug: "arithmetic", difficulty: "medium", prompt: "A shirt costs $40 after a 20% discount. What was the original price?", options: ["$48", "$50", "$52", "$60"], correctIndex: 1, explanation: "40 = 0.8 × price, so price = 50." },
  { topicSlug: "arithmetic", difficulty: "hard", prompt: "What is the compound interest on $1000 at 10% for 2 years (annual compounding)?", options: ["$100", "$200", "$210", "$220"], correctIndex: 2, explanation: "1000 × 1.1² = 1210, interest = 210." },
  { topicSlug: "arithmetic", difficulty: "hard", prompt: "What is the greatest common divisor (GCD) of 48 and 18?", options: ["3", "6", "9", "12"], correctIndex: 1, explanation: "48 = 2^4×3, 18 = 2×3², common factors give GCD = 6." },

  // Physics
  { topicSlug: "physics", difficulty: "easy", prompt: "What is the SI unit of force?", options: ["Joule", "Newton", "Watt", "Pascal"], correctIndex: 1, explanation: "Force is measured in Newtons (N)." },
  { topicSlug: "physics", difficulty: "easy", prompt: "What force pulls objects toward Earth?", options: ["Magnetism", "Friction", "Gravity", "Tension"], correctIndex: 2, explanation: "Gravity is the force that attracts objects toward Earth's center." },
  { topicSlug: "physics", difficulty: "medium", prompt: "What is the speed of light in a vacuum (approx.)?", options: ["3 × 10^5 km/s", "3 × 10^8 m/s", "3 × 10^6 m/s", "3 × 10^4 m/s"], correctIndex: 1, explanation: "Light travels at approximately 3 × 10^8 meters per second." },
  { topicSlug: "physics", difficulty: "medium", prompt: "Which law states that every action has an equal and opposite reaction?", options: ["Newton's First Law", "Newton's Second Law", "Newton's Third Law", "Law of Gravitation"], correctIndex: 2, explanation: "Newton's Third Law describes action-reaction force pairs." },
  { topicSlug: "physics", difficulty: "hard", prompt: "What is the formula for kinetic energy?", options: ["mgh", "½mv²", "mv", "F × d"], correctIndex: 1, explanation: "Kinetic energy = ½ × mass × velocity²." },
  { topicSlug: "physics", difficulty: "hard", prompt: "What type of lens is used to correct nearsightedness (myopia)?", options: ["Convex", "Concave", "Bifocal", "Cylindrical"], correctIndex: 1, explanation: "Concave (diverging) lenses correct myopia." },

  // Chemistry
  { topicSlug: "chemistry", difficulty: "easy", prompt: "What is the chemical symbol for gold?", options: ["Ag", "Au", "Gd", "Go"], correctIndex: 1, explanation: "Au comes from the Latin word 'aurum' for gold." },
  { topicSlug: "chemistry", difficulty: "easy", prompt: "What is the most abundant gas in Earth's atmosphere?", options: ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"], correctIndex: 2, explanation: "Nitrogen makes up about 78% of the atmosphere." },
  { topicSlug: "chemistry", difficulty: "medium", prompt: "What is the pH of a neutral solution?", options: ["0", "7", "14", "1"], correctIndex: 1, explanation: "A pH of 7 is neutral, neither acidic nor basic." },
  { topicSlug: "chemistry", difficulty: "medium", prompt: "What is the chemical formula for table salt?", options: ["NaCl", "KCl", "CaCl2", "NaOH"], correctIndex: 0, explanation: "Table salt is sodium chloride, NaCl." },
  { topicSlug: "chemistry", difficulty: "hard", prompt: "Which subatomic particle has no electric charge?", options: ["Proton", "Electron", "Neutron", "Ion"], correctIndex: 2, explanation: "Neutrons are electrically neutral." },
  { topicSlug: "chemistry", difficulty: "hard", prompt: "What type of bond involves the sharing of electron pairs?", options: ["Ionic bond", "Covalent bond", "Metallic bond", "Hydrogen bond"], correctIndex: 1, explanation: "Covalent bonds form when atoms share electron pairs." },

  // Biology
  { topicSlug: "biology", difficulty: "easy", prompt: "What is the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi body"], correctIndex: 2, explanation: "Mitochondria generate most of the cell's ATP energy." },
  { topicSlug: "biology", difficulty: "easy", prompt: "How many chambers does the human heart have?", options: ["2", "3", "4", "5"], correctIndex: 2, explanation: "The human heart has 4 chambers: two atria and two ventricles." },
  { topicSlug: "biology", difficulty: "medium", prompt: "What process do plants use to make food using sunlight?", options: ["Respiration", "Photosynthesis", "Fermentation", "Transpiration"], correctIndex: 1, explanation: "Photosynthesis converts sunlight, water, and CO₂ into glucose and oxygen." },
  { topicSlug: "biology", difficulty: "medium", prompt: "Which blood type is known as the universal donor?", options: ["A", "B", "AB", "O negative"], correctIndex: 3, explanation: "O negative blood lacks A, B, and Rh antigens, making it broadly compatible." },
  { topicSlug: "biology", difficulty: "hard", prompt: "What molecule carries genetic information in most organisms?", options: ["RNA", "DNA", "ATP", "Protein"], correctIndex: 1, explanation: "DNA (deoxyribonucleic acid) stores hereditary information." },
  { topicSlug: "biology", difficulty: "hard", prompt: "What is the term for an organism's complete set of genes?", options: ["Phenotype", "Genotype", "Genome", "Karyotype"], correctIndex: 2, explanation: "The genome is the entire set of genetic material of an organism." },

  // Grammar
  { topicSlug: "grammar", difficulty: "easy", prompt: "Choose the correct sentence.", options: ["She go to school.", "She goes to school.", "She going to school.", "She gone to school."], correctIndex: 1, explanation: "Third-person singular present tense requires 'goes'." },
  { topicSlug: "grammar", difficulty: "easy", prompt: "Which word is a noun in: 'The dog barked loudly'?", options: ["The", "dog", "barked", "loudly"], correctIndex: 1, explanation: "'Dog' is the noun (a naming word) in the sentence." },
  { topicSlug: "grammar", difficulty: "medium", prompt: "Identify the correct past tense of 'go'.", options: ["goed", "gone", "went", "going"], correctIndex: 2, explanation: "'Went' is the simple past tense of 'go'." },
  { topicSlug: "grammar", difficulty: "medium", prompt: "Choose the correctly punctuated sentence.", options: ["Its a sunny day.", "It's a sunny day.", "Its' a sunny day.", "Its a sunny, day."], correctIndex: 1, explanation: "\"It's\" is a contraction of 'it is'." },
  { topicSlug: "grammar", difficulty: "hard", prompt: "Which sentence uses the subjunctive mood correctly?", options: ["If I was rich, I would travel.", "If I were rich, I would travel.", "If I am rich, I would travel.", "If I be rich, I would travel."], correctIndex: 1, explanation: "The subjunctive mood uses 'were' for hypothetical situations." },
  { topicSlug: "grammar", difficulty: "hard", prompt: "Which of these is a compound-complex sentence?", options: ["I ran fast.", "I ran fast, and I won.", "Although I was tired, I ran fast, and I won.", "I ran fast because I was late."], correctIndex: 2, explanation: "It has two independent clauses and a dependent clause, making it compound-complex." },

  // Vocabulary
  { topicSlug: "vocabulary", difficulty: "easy", prompt: "What is a synonym for 'happy'?", options: ["Sad", "Joyful", "Angry", "Tired"], correctIndex: 1, explanation: "'Joyful' means feeling or expressing great happiness." },
  { topicSlug: "vocabulary", difficulty: "easy", prompt: "What is the antonym of 'ancient'?", options: ["Old", "Modern", "Historic", "Aged"], correctIndex: 1, explanation: "'Modern' is the opposite of 'ancient'." },
  { topicSlug: "vocabulary", difficulty: "medium", prompt: "What does 'benevolent' mean?", options: ["Cruel", "Kind and generous", "Angry", "Confused"], correctIndex: 1, explanation: "'Benevolent' describes someone kind and generous." },
  { topicSlug: "vocabulary", difficulty: "medium", prompt: "What is a synonym for 'meticulous'?", options: ["Careless", "Careful", "Lazy", "Quick"], correctIndex: 1, explanation: "'Meticulous' means showing great attention to detail, similar to careful." },
  { topicSlug: "vocabulary", difficulty: "hard", prompt: "What does 'ephemeral' mean?", options: ["Everlasting", "Short-lived", "Enormous", "Elegant"], correctIndex: 1, explanation: "'Ephemeral' means lasting for a very short time." },
  { topicSlug: "vocabulary", difficulty: "hard", prompt: "What is the meaning of 'ubiquitous'?", options: ["Rare", "Present everywhere", "Unknown", "Ancient"], correctIndex: 1, explanation: "'Ubiquitous' means found everywhere." },

  // Comprehension
  { topicSlug: "comprehension", difficulty: "easy", prompt: "A passage that explains how to bake a cake is an example of which writing style?", options: ["Narrative", "Persuasive", "Procedural", "Descriptive"], correctIndex: 2, explanation: "Procedural writing gives step-by-step instructions." },
  { topicSlug: "comprehension", difficulty: "easy", prompt: "What is the main purpose of a topic sentence?", options: ["To end a paragraph", "To introduce the main idea", "To list references", "To ask a question"], correctIndex: 1, explanation: "A topic sentence introduces the main idea of a paragraph." },
  { topicSlug: "comprehension", difficulty: "medium", prompt: "In a persuasive essay, what is the writer's main goal?", options: ["To entertain", "To inform neutrally", "To convince the reader", "To describe a scene"], correctIndex: 2, explanation: "Persuasive writing aims to convince readers of a viewpoint." },
  { topicSlug: "comprehension", difficulty: "medium", prompt: "What literary device compares two things using 'like' or 'as'?", options: ["Metaphor", "Simile", "Hyperbole", "Personification"], correctIndex: 1, explanation: "A simile uses 'like' or 'as' to compare two things." },
  { topicSlug: "comprehension", difficulty: "hard", prompt: "What is the term for the underlying message or lesson of a story?", options: ["Plot", "Setting", "Theme", "Climax"], correctIndex: 2, explanation: "Theme is the central idea or lesson conveyed by a story." },
  { topicSlug: "comprehension", difficulty: "hard", prompt: "Which point of view uses 'he', 'she', and 'they' to narrate?", options: ["First person", "Second person", "Third person", "Omniscient reader"], correctIndex: 2, explanation: "Third-person narration refers to characters using he/she/they." },

  // Programming Basics
  { topicSlug: "programming-basics", difficulty: "easy", prompt: "Which symbol is used for single-line comments in JavaScript?", options: ["//", "/*", "#", "--"], correctIndex: 0, explanation: "JavaScript uses // for single-line comments." },
  { topicSlug: "programming-basics", difficulty: "easy", prompt: "What data type represents true/false values?", options: ["Integer", "String", "Boolean", "Float"], correctIndex: 2, explanation: "Boolean values represent true or false." },
  { topicSlug: "programming-basics", difficulty: "medium", prompt: "What does 'variable scope' refer to?", options: ["Variable's data type", "Where a variable can be accessed", "Variable's memory size", "Variable's initial value"], correctIndex: 1, explanation: "Scope defines where in the code a variable is accessible." },
  { topicSlug: "programming-basics", difficulty: "medium", prompt: "Which loop structure guarantees at least one execution?", options: ["for loop", "while loop", "do-while loop", "for-each loop"], correctIndex: 2, explanation: "A do-while loop runs its body once before checking the condition." },
  { topicSlug: "programming-basics", difficulty: "hard", prompt: "What is the time complexity of binary search on a sorted array?", options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"], correctIndex: 2, explanation: "Binary search halves the search space each step, giving O(log n)." },
  { topicSlug: "programming-basics", difficulty: "hard", prompt: "What is recursion?", options: ["A loop that never ends", "A function calling itself", "A variable with no value", "A type of array"], correctIndex: 1, explanation: "Recursion occurs when a function calls itself to solve smaller subproblems." },

  // Data Structures
  { topicSlug: "data-structures", difficulty: "easy", prompt: "Which data structure follows First-In-First-Out (FIFO)?", options: ["Stack", "Queue", "Tree", "Graph"], correctIndex: 1, explanation: "A queue processes elements in the order they were added (FIFO)." },
  { topicSlug: "data-structures", difficulty: "easy", prompt: "Which data structure follows Last-In-First-Out (LIFO)?", options: ["Queue", "Stack", "Linked List", "Array"], correctIndex: 1, explanation: "A stack removes the most recently added element first (LIFO)." },
  { topicSlug: "data-structures", difficulty: "medium", prompt: "What is the time complexity of accessing an element in an array by index?", options: ["O(1)", "O(n)", "O(log n)", "O(n²)"], correctIndex: 0, explanation: "Array indexing is constant time, O(1)." },
  { topicSlug: "data-structures", difficulty: "medium", prompt: "Which data structure is best suited for representing hierarchical relationships?", options: ["Array", "Queue", "Tree", "Stack"], correctIndex: 2, explanation: "Trees naturally represent hierarchical parent-child relationships." },
  { topicSlug: "data-structures", difficulty: "hard", prompt: "What is a hash collision?", options: ["A hash function error", "Two keys mapping to the same index", "A full hash table", "An invalid key type"], correctIndex: 1, explanation: "A collision happens when two different keys hash to the same index." },
  { topicSlug: "data-structures", difficulty: "hard", prompt: "Which traversal visits a binary tree in Left-Root-Right order?", options: ["Preorder", "Inorder", "Postorder", "Level order"], correctIndex: 1, explanation: "Inorder traversal visits left subtree, root, then right subtree." },

  // Web Development
  { topicSlug: "web-development", difficulty: "easy", prompt: "What does HTML stand for?", options: ["HyperText Markup Language", "HighText Machine Language", "HyperTransfer Markup Language", "HomeTool Markup Language"], correctIndex: 0, explanation: "HTML stands for HyperText Markup Language." },
  { topicSlug: "web-development", difficulty: "easy", prompt: "Which language is primarily used for styling web pages?", options: ["HTML", "CSS", "JSON", "SQL"], correctIndex: 1, explanation: "CSS (Cascading Style Sheets) is used to style web pages." },
  { topicSlug: "web-development", difficulty: "medium", prompt: "What does API stand for?", options: ["Application Programming Interface", "Advanced Program Integration", "Applied Programming Instruction", "Automated Page Index"], correctIndex: 0, explanation: "API stands for Application Programming Interface." },
  { topicSlug: "web-development", difficulty: "medium", prompt: "Which HTTP method is typically used to retrieve data?", options: ["POST", "GET", "DELETE", "PUT"], correctIndex: 1, explanation: "GET requests are used to retrieve data from a server." },
  { topicSlug: "web-development", difficulty: "hard", prompt: "What does 'responsive design' primarily ensure?", options: ["Fast server response", "Layouts adapt to different screen sizes", "Secure data transfer", "SEO optimization"], correctIndex: 1, explanation: "Responsive design ensures layouts work well across various screen sizes." },
  { topicSlug: "web-development", difficulty: "hard", prompt: "What is the purpose of a CDN (Content Delivery Network)?", options: ["Encrypt user data", "Deliver content faster via distributed servers", "Compile code", "Store databases"], correctIndex: 1, explanation: "A CDN distributes content across servers globally to reduce latency." },

  // History
  { topicSlug: "history", difficulty: "easy", prompt: "In which year did World War II end?", options: ["1943", "1945", "1947", "1950"], correctIndex: 1, explanation: "World War II ended in 1945." },
  { topicSlug: "history", difficulty: "easy", prompt: "Who was the first President of the United States?", options: ["Thomas Jefferson", "Abraham Lincoln", "George Washington", "John Adams"], correctIndex: 2, explanation: "George Washington served as the first U.S. President." },
  { topicSlug: "history", difficulty: "medium", prompt: "Which ancient civilization built the pyramids of Giza?", options: ["Romans", "Greeks", "Egyptians", "Mayans"], correctIndex: 2, explanation: "The Egyptians built the pyramids of Giza." },
  { topicSlug: "history", difficulty: "medium", prompt: "The Renaissance began in which country?", options: ["France", "Italy", "Spain", "England"], correctIndex: 1, explanation: "The Renaissance began in Italy in the 14th century." },
  { topicSlug: "history", difficulty: "hard", prompt: "Who was the first emperor of unified China?", options: ["Confucius", "Qin Shi Huang", "Sun Tzu", "Genghis Khan"], correctIndex: 1, explanation: "Qin Shi Huang unified China and became its first emperor in 221 BCE." },
  { topicSlug: "history", difficulty: "hard", prompt: "The Treaty of Versailles ended which war?", options: ["World War II", "World War I", "The Cold War", "Napoleonic Wars"], correctIndex: 1, explanation: "The Treaty of Versailles formally ended World War I in 1919." },

  // Geography
  { topicSlug: "geography", difficulty: "easy", prompt: "What is the largest continent by area?", options: ["Africa", "Asia", "Europe", "North America"], correctIndex: 1, explanation: "Asia is the largest continent by both area and population." },
  { topicSlug: "geography", difficulty: "easy", prompt: "Which river is the longest in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1, explanation: "The Nile is traditionally considered the longest river in the world." },
  { topicSlug: "geography", difficulty: "medium", prompt: "Which desert is the largest hot desert in the world?", options: ["Gobi", "Kalahari", "Sahara", "Mojave"], correctIndex: 2, explanation: "The Sahara is the largest hot desert on Earth." },
  { topicSlug: "geography", difficulty: "medium", prompt: "Mount Everest is located in which mountain range?", options: ["Andes", "Alps", "Himalayas", "Rockies"], correctIndex: 2, explanation: "Mount Everest is part of the Himalayan mountain range." },
  { topicSlug: "geography", difficulty: "hard", prompt: "Which country has the most time zones?", options: ["USA", "Russia", "China", "France"], correctIndex: 3, explanation: "France has 12 time zones due to its overseas territories." },
  { topicSlug: "geography", difficulty: "hard", prompt: "What is the smallest country in the world by area?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correctIndex: 1, explanation: "Vatican City is the smallest country by area, about 0.44 km²." },

  // Current Affairs
  { topicSlug: "current-affairs", difficulty: "easy", prompt: "What does 'GDP' stand for in economics?", options: ["General Domestic Policy", "Gross Domestic Product", "Global Development Plan", "Government Debt Percentage"], correctIndex: 1, explanation: "GDP stands for Gross Domestic Product, a measure of economic output." },
  { topicSlug: "current-affairs", difficulty: "easy", prompt: "Which organization is responsible for global public health coordination?", options: ["UNESCO", "WHO", "IMF", "WTO"], correctIndex: 1, explanation: "The World Health Organization (WHO) coordinates global public health." },
  { topicSlug: "current-affairs", difficulty: "medium", prompt: "What does 'AI' commonly stand for in modern technology discussions?", options: ["Automated Interface", "Artificial Intelligence", "Applied Informatics", "Advanced Integration"], correctIndex: 1, explanation: "AI stands for Artificial Intelligence." },
  { topicSlug: "current-affairs", difficulty: "medium", prompt: "Which renewable energy source harnesses power from the sun?", options: ["Wind", "Solar", "Geothermal", "Tidal"], correctIndex: 1, explanation: "Solar energy is harnessed from sunlight." },
  { topicSlug: "current-affairs", difficulty: "hard", prompt: "What term describes a sustained rise in the general price level of goods?", options: ["Deflation", "Recession", "Inflation", "Stagnation"], correctIndex: 2, explanation: "Inflation refers to a general and sustained rise in prices." },
  { topicSlug: "current-affairs", difficulty: "hard", prompt: "What is the primary goal of the Paris Agreement?", options: ["Trade regulation", "Limiting global warming", "Nuclear disarmament", "Internet governance"], correctIndex: 1, explanation: "The Paris Agreement aims to limit global warming well below 2°C." },
];
