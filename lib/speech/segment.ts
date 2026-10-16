// Drops citation links from speech: markdown links keep their label text
// and lose the URL, bare URLs are removed outright.
export function stripLinksForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "");
}

// Target chunk size for TTS segments. Smaller cuts start speaking sooner;
// larger ones mean fewer requests, which matters more given how low the
// Gemini TTS free-tier quota is (RPD/RPM caps in the single digits).
// TPM has plenty of headroom, so this is sized right up against the
// server's hard cap (MAX_TEXT_CHARS = 8000, see app/api/tts/route.ts) to
// minimize request count. splitParagraphIntoChunks guarantees no chunk
// exceeds this, so the gap to 8000 only needs to cover trim()'s effect.
export const SEGMENT_TARGET_CHARS = 7900;

export function splitIntoSegments(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.flatMap((p) => splitParagraphIntoChunks(p));
}

// Breaks a paragraph at sentence boundaries (。！？), then regroups the
// sentences into chunks up to SEGMENT_TARGET_CHARS so neither the lag before
// the first chunk nor the number of requests gets too large. A single
// sentence (or a punctuation-free paragraph, which matches as one
// "sentence") longer than the target is hard-sliced, since otherwise it
// would pass through as one oversized chunk and the server would reject it.
export function splitParagraphIntoChunks(paragraph: string): string[] {
  const sentences = paragraph.match(/[^。！？]+[。！？]*/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > SEGMENT_TARGET_CHARS) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > SEGMENT_TARGET_CHARS) {
      for (let i = 0; i < sentence.length; i += SEGMENT_TARGET_CHARS) {
        chunks.push(sentence.slice(i, i + SEGMENT_TARGET_CHARS).trim());
      }
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}
