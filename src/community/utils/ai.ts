// Lightweight, fully client-side "AI" suggestion engine.
// Uses heuristics + templates to feel context-aware without any external API.

const REPLY_BANK: Record<string, string[]> = {
  travel: [
    "This view is unreal 😍 adding it to my bucket list right now!",
    "Okay but HOW did you get that lighting?! 🌅",
    "Take me with you next time 🙏✈️",
  ],
  food: [
    "This looks incredible 🤤 recipe please!!",
    "Okay I'm definitely making this for dinner tonight 🍽️",
    "You're making me hungry at the worst time 😭",
  ],
  fitness: [
    "This is the motivation I needed today 💪🔥",
    "Saving this for my next workout, let's go!",
    "Consistency really does pay off, love this energy 🙌",
  ],
  tech: [
    "So real, been there way too many times 😂",
    "This deserves way more likes, so true.",
    "Bookmarking this, great point!",
  ],
  music: [
    "Can't wait to hear it, take my vote already 🎧",
    "The energy in this is insane 🔥",
    "You always deliver, no notes!",
  ],
  poll: [
    "Tough choice but I already voted! 🗳️",
    "Love a good community poll, tagging a friend to vote too!",
    "Curious to see how this turns out 👀",
  ],
  pets: [
    "Okay this is the cutest thing I've seen all day 🥹🐾",
    "Adopt-a-vibe from this pic immediately 😍",
    "Certified good boy/girl right there!",
  ],
  default: [
    "Love this, thanks for sharing! 🙌",
    "Totally agree with this 💯",
    "This made my day, appreciate you posting this ✨",
  ],
};

function detectCategory(text: string, tags?: string[]): string {
  const lower = `${text} ${(tags ?? []).join(" ")}`.toLowerCase();
  const categories = Object.keys(REPLY_BANK).filter((c) => c !== "default");
  for (const cat of categories) {
    if (lower.includes(cat)) return cat;
  }
  if (lower.includes("sunrise") || lower.includes("sunset") || lower.includes("beach"))
    return "travel";
  if (lower.includes("recipe") || lower.includes("cook") || lower.includes("meal"))
    return "food";
  if (lower.includes("workout") || lower.includes("gym") || lower.includes("run"))
    return "fitness";
  if (lower.includes("code") || lower.includes("bug") || lower.includes("app"))
    return "tech";
  if (lower.includes("?") || lower.includes("vote")) return "poll";
  return "default";
}

export function generateReplySuggestions(text: string, tags?: string[]): string[] {
  const cat = detectCategory(text ?? "", tags);
  const bank = REPLY_BANK[cat] ?? REPLY_BANK.default;
  return bank;
}

const CAPTION_BANK: Record<string, string[]> = {
  travel: [
    "Wandering somewhere new and loving every second of it ✈️🌍",
    "Collecting moments, not things. Where should I go next? 🗺️",
    "This view stopped me in my tracks 🌄 #travel",
  ],
  food: [
    "Cooked this up and honestly impressed myself 🍳 recipe in comments!",
    "Sunday comfort food hits different 🍜✨",
    "Foodie confession: I'd eat this every day if I could 🤤",
  ],
  fitness: [
    "Small steps every day turn into big results 💪 who's with me?",
    "Showed up even when I didn't feel like it. Proud of today's session 🔥",
    "Progress over perfection, always. #fitness",
  ],
  tech: [
    "Shipped something I'm really proud of today 👨‍💻🚀",
    "Debugging life one commit at a time 😅",
    "Tech tip of the day: take breaks, your best ideas come after 🧠",
  ],
  music: [
    "New sounds coming soon 🎧 can't wait to share this one with you all",
    "Studio nights hit different when the track finally clicks 🎶",
    "This one's for the real ones who've been here since day one 🙏",
  ],
  funny: [
    "Me pretending I have my life together: 🎭",
    "Send this to someone who needs a laugh today 😂",
    "POV: it's Monday again and nobody asked",
  ],
  motivation: [
    "Your only competition is who you were yesterday 🚀",
    "Bet on yourself, even when it's hard. Especially when it's hard.",
    "Small wins today build the momentum for tomorrow ✨",
  ],
};

export function generateCaptionSuggestions(topic: string): string[] {
  const key = topic.toLowerCase();
  return CAPTION_BANK[key] ?? [
    `Sharing a little update about ${topic || "my day"} 💭`,
    `Can we talk about ${topic || "this"} for a second? 👀`,
    `${topic ? topic[0].toUpperCase() + topic.slice(1) : "This"} has been on my mind lately ✨`,
  ];
}

export function generatePollSuggestions(topic: string): { question: string; options: string[] }[] {
  const key = topic.toLowerCase();
  const bankMap: Record<string, { question: string; options: string[] }[]> = {
    travel: [
      { question: "Where should I travel to next?", options: ["Mountains 🏔️", "Beach 🏖️", "City 🏙️", "Countryside 🌾"] },
    ],
    food: [
      { question: "What should I cook this weekend?", options: ["Pasta 🍝", "Tacos 🌮", "Sushi 🍣", "BBQ 🍖"] },
    ],
    fitness: [
      { question: "Best workout to start the week?", options: ["Cardio 🏃", "Strength 🏋️", "Yoga 🧘", "Rest day 😴"] },
    ],
    tech: [
      { question: "Which side project should I finish first?", options: ["Mobile app 📱", "Website 🌐", "AI tool 🤖", "Game 🎮"] },
    ],
    music: [
      { question: "What genre should the next drop be?", options: ["Lo-fi 🌙", "House 🔥", "Hip-hop 🎤", "Pop 🎵"] },
    ],
  };
  return bankMap[key] ?? [
    { question: `What's your take on ${topic || "this"}?`, options: ["Love it 😍", "It's okay 🙂", "Not for me 🙅"] },
  ];
}

export function generateStoryIdeas(topic: string): string[] {
  const key = topic.toLowerCase();
  const ideaMap: Record<string, string[]> = {
    travel: [
      "Share a 3-second clip of the view from where you are right now",
      "Post a 'then vs now' of your favorite travel spot",
      "Ask followers to vote on your next destination",
    ],
    food: [
      "Show a behind-the-scenes of tonight's dinner prep",
      "Poll: sweet or savory breakfast?",
      "Share your go-to comfort food with a quick story",
    ],
    fitness: [
      "Post your workout playlist and ask for song suggestions",
      "Share one small win from today's training",
      "Poll: morning workout or evening workout?",
    ],
  };
  return ideaMap[key] ?? [
    "Ask your followers a fun would-you-rather question",
    "Share a candid behind-the-scenes moment from today",
    "Post a quick poll to see what people think about your day",
  ];
}
