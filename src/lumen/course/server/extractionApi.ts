import type { Availability, ContentChunk, NormalizedTranscript, ResourceType, TranscriptSegment } from "../types";

/* ═════════════════════════════════════════════════════════════
   ███ SERVER BOUNDARY ███
   Everything in this file represents work that runs on the
   SERVER, behind authentication and provider credentials:

     · YouTube/ASR transcript pipeline
     · PDF/EPUB ingestion
     · Google Docs / Sheets / Slides API imports
     · Vision analysis of images

   The browser NEVER reads a cross-origin iframe. It calls these
   endpoints, which enforce access control and return only
   normalized, chunked, already-permitted content.

   In this build the endpoints are simulated with the corpora
   below (latency + failure modes included) so the full client
   architecture — caching, dedup, abort, availability states,
   retrieval, provenance — is real and exercisable. Swapping in
   HTTP calls means replacing the bodies of the exported
   functions only.
   ═════════════════════════════════════════════════════════════ */

export interface AccessClaims {
  userId: string;
  courseIds: string[];
}

export interface ExtractionRequest {
  courseId: string;
  moduleId: string;
  resourceId: string;
  resourceType: ResourceType;
  claims: AccessClaims;
  signal?: AbortSignal;
}

export interface ExtractionResponse {
  availability: Availability;
  note?: string;
  chunks: ContentChunk[];
  transcript?: NormalizedTranscript;
  contentHash: string;
}

/** Stable, cheap content hash (FNV-1a) — used for cache versioning. */
export function hashContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `h${(h >>> 0).toString(36)}`;
}

/* ── corpora (what the server would return post-extraction) ── */

const YT_SEGMENTS: TranscriptSegment[] = [
  { startTime: 0, endTime: 95, text: "Welcome back. Today we finish electromagnetic induction — the idea that a changing magnetic field creates an electric current. Everything in this chapter follows from that one sentence." },
  { startTime: 95, endTime: 240, text: "First, magnetic flux. Flux phi equals B times A times cosine theta. B is the field strength, A is the area of the loop, and theta is the angle between the field and the normal to that surface." },
  { startTime: 240, endTime: 430, text: "Notice that flux can change three different ways: change the field, change the area, or rotate the loop to change the angle. Exam questions almost always pick one of those three." },
  { startTime: 430, endTime: 640, text: "Now Faraday's law. The induced EMF equals minus N times the rate of change of flux — minus N d-phi by d-t. N is the number of turns in the coil." },
  { startTime: 640, endTime: 880, text: "The rate of change matters, not the flux itself. A huge steady field induces nothing at all. A weak field changing quickly induces a lot. This is the single most common misconception in the chapter." },
  { startTime: 880, endTime: 1090, text: "Let's do the numbers. A coil of two hundred turns, flux changing from two milliwebers to six milliwebers in one tenth of a second. Delta phi is four milliwebers, delta t is nought point one seconds." },
  { startTime: 1090, endTime: 1240, text: "So EMF equals two hundred times four times ten to the minus three, divided by nought point one — that gives eight volts. And that minus sign in front is not decoration: it is Lenz's law written into Faraday's law." },
  { startTime: 1240, endTime: 1450, text: "Lenz's law says the induced current always opposes the change that produced it. Push a magnet toward a coil and the coil pushes back. That opposition is what conserves energy." },
  { startTime: 1450, endTime: 1660, text: "If the induced current helped the change instead of opposing it, you would get free energy — the current would grow without limit. So Lenz's law is really conservation of energy in disguise." },
  { startTime: 1660, endTime: 1880, text: "For direction, use the right hand rule with the flux change. Ask first: is the flux increasing or decreasing? The induced current fights that direction of change." },
  { startTime: 1880, endTime: 2090, text: "Quick warning about the exam. Students lose marks by writing the EMF without the minus sign, or by using the flux value instead of the change in flux. Both are avoidable." },
  { startTime: 2090, endTime: 2280, text: "Next session we apply this to AC generators and transformers, which are just Faraday's law running continuously. Read chapter four section three before then." },
];

const MP4_SEGMENTS: TranscriptSegment[] = [
  { startTime: 0, endTime: 60, text: "In this demonstration we drop a strong neodymium magnet through a copper pipe and compare it with an identical non-magnetic slug." },
  { startTime: 60, endTime: 150, text: "The plain slug falls straight through in about a third of a second. Watch the magnet — it takes nearly four seconds to emerge." },
  { startTime: 150, endTime: 260, text: "As the magnet falls, the flux through each ring of the copper pipe changes, inducing circular eddy currents in the copper." },
  { startTime: 260, endTime: 350, text: "By Lenz's law those eddy currents oppose the motion that created them, so they act like a magnetic brake. The copper never becomes magnetic; it just resists the change." },
  { startTime: 350, endTime: 415, text: "This is exactly how regenerative braking and induction cooktops work — the same law, at different scales." },
];

const AUDIO_SEGMENTS: TranscriptSegment[] = [
  { startTime: 0, endTime: 70, text: "Chapter four recap. Three formulas carry this entire chapter: flux equals B A cos theta, EMF equals minus N d-phi d-t, and for a rod moving in a field, EMF equals B L v." },
  { startTime: 70, endTime: 160, text: "Remember that induction responds to change. No change in flux means no induced EMF, no matter how strong the field is." },
  { startTime: 160, endTime: 250, text: "Lenz's law gives you direction, Faraday's law gives you magnitude. Most exam questions need both, in that order." },
  { startTime: 250, endTime: 348, text: "Finally, watch your units. Webers per second are volts. If your answer comes out in webers you have skipped the time derivative." },
];

const PDF_PAGES: [number, string, string][] = [
  [14, "4.1 Magnetic flux", "Magnetic flux Φ through a surface is defined as Φ = B·A·cos θ, measured in webers (Wb). One weber equals one tesla square metre. Flux is a scalar quantity even though B is a vector."],
  [15, "4.2 Faraday's law of induction", "The magnitude of the induced EMF in a circuit equals the rate of change of magnetic flux linkage: ε = −N (dΦ/dt). The negative sign encodes Lenz's law and must be retained in formal answers."],
  [16, "4.2.1 Interpreting the negative sign", "The negative sign indicates that the induced EMF drives a current whose own magnetic field opposes the change in flux. It is a statement of energy conservation, not an arbitrary convention."],
  [17, "Worked example 4.3", "A coil of N = 200 turns experiences a flux change from 2.0 mWb to 6.0 mWb in 0.10 s. ΔΦ = 4.0 × 10⁻³ Wb. ε = −N ΔΦ/Δt = −200 × 4.0 × 10⁻³ / 0.10 = −8.0 V. The magnitude of the induced EMF is 8.0 V."],
  [18, "4.3 Lenz's law", "Lenz's law states that the direction of an induced current is always such that it opposes the change producing it. Applied to a magnet approaching a coil, the near face of the coil develops the same polarity as the approaching pole."],
  [19, "4.4 Motional EMF", "For a conductor of length L moving with velocity v perpendicular to a uniform field B, the induced EMF is ε = B L v. This is a special case of Faraday's law where the area of the circuit changes."],
  [20, "4.5 Eddy currents", "Circulating currents induced in bulk conductors are called eddy currents. They dissipate energy as heat and produce a retarding force, exploited in magnetic braking and induction heating."],
];

const DOC_SECTIONS: [string, string][] = [
  ["Teaching sequence", "Introduce flux before EMF. Students who meet ε = −N dΦ/dt before they are fluent with Φ = BA cos θ consistently misapply the formula under exam pressure."],
  ["The misconception to pre-empt", "Almost every cohort assumes a strong field induces a large EMF. Address it directly: a strong but constant field induces nothing. Only the rate of change matters."],
  ["Board example", "Use N = 200, ΔΦ = 4.0 mWb, Δt = 0.10 s, giving ε = 8.0 V. Keep the same numbers as the textbook worked example 4.3 so students can cross-reference."],
  ["Marking guidance", "Award method marks for correct substitution even when the negative sign is dropped, but note that formal derivations require it. Units of Wb s⁻¹ must be converted to volts explicitly."],
];

const SHEET_ROWS: string[][] = [
  ["Trial", "Turns N", "ΔΦ (mWb)", "Δt (s)", "Measured EMF (V)", "Predicted EMF (V)"],
  ["1", "50", "4.0", "0.10", "1.9", "2.0"],
  ["2", "100", "4.0", "0.10", "3.9", "4.0"],
  ["3", "200", "4.0", "0.10", "7.8", "8.0"],
  ["4", "200", "2.0", "0.10", "3.9", "4.0"],
  ["5", "200", "4.0", "0.20", "3.8", "4.0"],
];

const SLIDES: [number, string, string, string][] = [
  [1, "Electromagnetic Induction", "Chapter 4 revision · Faraday and Lenz", "Opening slide — set the one-sentence framing: changing flux creates EMF."],
  [2, "Magnetic flux", "Φ = B·A·cos θ · measured in webers · three ways to change it: field, area, angle", "Ask the class which of the three a rotating loop uses."],
  [3, "Faraday's law", "ε = −N dΦ/dt · rate of change, not magnitude · N = number of turns", "Emphasise: a constant field induces nothing."],
  [4, "Direction of induced current", "Lenz's law: the induced current opposes the change that created it · right-hand rule with the flux change", "This is the slide students find hardest — spend the extra two minutes here."],
  [5, "Worked example", "N = 200 · ΔΦ = 4.0 mWb · Δt = 0.10 s → ε = 8.0 V", "Same numbers as textbook example 4.3."],
  [6, "Exam traps", "Dropping the minus sign · using Φ instead of ΔΦ · forgetting to convert mWb", "Close on this; it maps directly to the mark scheme."],
];

const EBOOK_SECTIONS: [string, string, string][] = [
  ["Chapter 4", "4.1 Fields that change", "A magnetic field that never changes is, from the point of view of induction, inert. The physics of this chapter lives entirely in the derivative: it is the change of flux with time that drives charge around a circuit."],
  ["Chapter 4", "4.2 Faraday's contribution", "Faraday's insight in 1831 was quantitative rather than qualitative. Others had noticed that moving magnets disturbed nearby circuits; Faraday established that the induced EMF is proportional to the rate at which flux linkage changes."],
  ["Chapter 4", "4.3 Lenz and conservation", "Lenz's law can be derived rather than memorised. If an induced current reinforced the change that produced it, the system would accelerate without an energy source. Opposition is the only outcome consistent with conservation of energy."],
];

const MINDMAP_NODES: [string, string, string][] = [
  ["root", "", "Electromagnetic Induction"],
  ["n1", "root", "Magnetic flux (Φ = BA cos θ)"],
  ["n2", "root", "Faraday's law (ε = −N dΦ/dt)"],
  ["n3", "root", "Lenz's law (opposition)"],
  ["n4", "root", "Applications"],
  ["n1a", "n1", "Three ways flux changes: field, area, angle"],
  ["n2a", "n2", "Rate of change, not magnitude"],
  ["n2b", "n2", "Flux linkage NΦ"],
  ["n3a", "n3", "Conservation of energy"],
  ["n3b", "n3", "Direction via right-hand rule"],
  ["n4a", "n4", "Eddy-current braking"],
  ["n4b", "n4", "Generators & transformers"],
];

/* ── endpoint simulation helpers ──────────────────────────── */

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function mkChunk(
  req: ExtractionRequest,
  i: number,
  text: string,
  loc: ContentChunk["loc"],
  heading?: string
): ContentChunk {
  return {
    chunkId: `${req.resourceId}#${i}`,
    resourceId: req.resourceId,
    resourceType: req.resourceType,
    courseId: req.courseId,
    moduleId: req.moduleId,
    heading,
    text,
    loc,
    language: "en",
    contentHash: hashContent(text),
  };
}

function transcriptChunks(req: ExtractionRequest, segs: TranscriptSegment[]): ContentChunk[] {
  // Merge adjacent segments into ~2-segment retrieval windows.
  const out: ContentChunk[] = [];
  for (let i = 0; i < segs.length; i += 2) {
    const group = segs.slice(i, i + 2);
    out.push(
      mkChunk(req, i, group.map((s) => s.text).join(" "), {
        timestampStart: group[0].startTime,
        timestampEnd: group[group.length - 1].endTime,
      })
    );
  }
  return out;
}

/* ── THE ENDPOINT ─────────────────────────────────────────── */

export async function fetchResourceContent(req: ExtractionRequest): Promise<ExtractionResponse> {
  /* AUTHORIZATION — enforced before any content is produced. */
  if (!req.claims.courseIds.includes(req.courseId)) {
    return { availability: "unavailable", note: "You don't have access to this course.", chunks: [], contentHash: "none" };
  }

  await delay(160 + Math.random() * 220, req.signal);

  const t = req.resourceType;
  const mkTranscript = (segs: TranscriptSegment[], source: NormalizedTranscript["source"], videoId?: string): NormalizedTranscript => ({
    videoId,
    resourceId: req.resourceId,
    language: "en",
    source,
    status: "ready",
    segments: segs,
    generatedAt: Date.now(),
    contentHash: hashContent(segs.map((s) => s.text).join("|")),
  });

  switch (t) {
    case "youtube": {
      const chunks = transcriptChunks(req, YT_SEGMENTS);
      return {
        availability: "ready",
        note: "Transcript supplied by the course owner (not scraped from the player).",
        chunks,
        transcript: mkTranscript(YT_SEGMENTS, "course_owner", "EMI-lecture-04"),
        contentHash: hashContent(YT_SEGMENTS.map((s) => s.text).join("|")),
      };
    }
    case "video": {
      return {
        availability: "ready",
        note: "Captions read from the bundled WebVTT track.",
        chunks: transcriptChunks(req, MP4_SEGMENTS),
        transcript: mkTranscript(MP4_SEGMENTS, "webvtt"),
        contentHash: hashContent(MP4_SEGMENTS.map((s) => s.text).join("|")),
      };
    }
    case "audio": {
      return {
        availability: "ready",
        note: "Course-generated transcript.",
        chunks: transcriptChunks(req, AUDIO_SEGMENTS),
        transcript: mkTranscript(AUDIO_SEGMENTS, "course_owner"),
        contentHash: hashContent(AUDIO_SEGMENTS.map((s) => s.text).join("|")),
      };
    }
    case "pdf": {
      const chunks = PDF_PAGES.map(([page, heading, text], i) => mkChunk(req, i, text, { page }, heading));
      return { availability: "ready", note: "Extracted during server-side ingestion.", chunks, contentHash: hashContent(chunks.map((c) => c.text).join("|")) };
    }
    case "doc": {
      const chunks = DOC_SECTIONS.map(([heading, text], i) => mkChunk(req, i, text, { section: heading }, heading));
      return { availability: "ready", note: "Imported through the course owner's Google Docs authorization.", chunks, contentHash: hashContent(chunks.map((c) => c.text).join("|")) };
    }
    case "sheet": {
      const header = SHEET_ROWS[0];
      const chunks = SHEET_ROWS.slice(1).map((row, i) =>
        mkChunk(
          req,
          i,
          header.map((h, j) => `${h}: ${row[j]}`).join(" · "),
          { sheet: "Readings", range: `A${i + 2}:F${i + 2}` },
          "Induction experiment readings"
        )
      );
      chunks.unshift(
        mkChunk(req, 99, `Sheet "Readings" columns: ${header.join(", ")}. ${SHEET_ROWS.length - 1} data rows comparing measured against predicted EMF.`, { sheet: "Readings", range: "A1:F6" }, "Sheet structure")
      );
      return { availability: "ready", note: "Imported through the course owner's Google Sheets authorization.", chunks, contentHash: hashContent(JSON.stringify(SHEET_ROWS)) };
    }
    case "slides": {
      const chunks = SLIDES.map(([slide, title, body, notes], i) =>
        mkChunk(req, i, `${title}. ${body}${notes ? ` (Speaker notes: ${notes})` : ""}`, { slide }, title)
      );
      return { availability: "ready", note: "Slide text and shared speaker notes imported via the Slides API.", chunks, contentHash: hashContent(JSON.stringify(SLIDES)) };
    }
    case "ebook": {
      const chunks = EBOOK_SECTIONS.map(([chapter, section, text], i) => mkChunk(req, i, text, { chapter, section }, section));
      return { availability: "ready", note: "EPUB parsed into chapter/section chunks.", chunks, contentHash: hashContent(JSON.stringify(EBOOK_SECTIONS)) };
    }
    case "mindmap": {
      const byId = new Map(MINDMAP_NODES.map(([id, , label]) => [id, label]));
      const chunks = MINDMAP_NODES.filter(([id]) => id !== "root").map(([id, parent, label], i) =>
        mkChunk(req, i, `${label} — branch of "${byId.get(parent) ?? "root"}"`, { node: id }, "Concept map node")
      );
      return {
        availability: "partial",
        note: "Structured node tree from the course owner's export. Visual layout and styling are not included.",
        chunks,
        contentHash: hashContent(JSON.stringify(MINDMAP_NODES)),
      };
    }
    case "image": {
      // Vision analysis — a real server call; cached by resource hash upstream.
      await delay(320, req.signal);
      return {
        availability: "ready",
        note: "Generated by vision analysis of the figure.",
        chunks: [
          mkChunk(
            req,
            0,
            "Figure shows a coil connected to a galvanometer with a bar magnet positioned along the coil axis. Arrows mark the direction of motion of the magnet and the resulting deflection of the needle, illustrating that motion — not proximity — produces the reading.",
            {},
            "Figure 4.7 — induction coil setup"
          ),
        ],
        contentHash: hashContent("res-img-setup:figure47"),
      };
    }
    case "google_form": {
      // Honest refusal: no API authorization exists for this course.
      return {
        availability: "permission_required",
        note: "Reading this form's questions needs Google Forms authorization that this course doesn't have. A screenshot of the question works instead.",
        chunks: [],
        contentHash: "none",
      };
    }
    case "embed": {
      // Sandboxed third-party iframe — no legitimate extraction path.
      return {
        availability: "unsupported",
        note: "This is a sandboxed third-party embed, so its internal content can't be read. A screenshot of the part you mean works instead.",
        chunks: [],
        contentHash: "none",
      };
    }
    default:
      return { availability: "unavailable", note: "No extraction path for this resource type.", chunks: [], contentHash: "none" };
  }
}
