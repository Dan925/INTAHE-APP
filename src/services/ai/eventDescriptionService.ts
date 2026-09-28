import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { ApiError } from '../../utils/errors';

// Generous for a multi-paragraph description (the prompt itself caps
// output at ~200 words) while still bounding the worst case cost/latency
// of one call.
const MAX_OUTPUT_TOKENS = 700;

export interface GenerateEventDescriptionInput {
  eventName: string;
  // Free text, not a fixed enum — "au choix" (the organizer's own choice
  // of tone), e.g. "festif", "professionnel", "décontracté et chaleureux".
  // The UI offers presets as a convenience, but this service doesn't
  // constrain what's sent.
  tone: string;
  locale: 'fr' | 'en';
  currentDescription?: string | undefined;
  customInstructions?: string | undefined;
}

// Lazily constructed (not at module load) so a missing/placeholder key
// never breaks app boot — same "boots fine without it" contract as
// Resend/Sentry. The empty-key check happens on first real use instead.
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ApiError(
      503,
      'ai_not_configured',
      'AI text generation is not configured on this server yet.',
      null,
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function generateEventDescription(input: GenerateEventDescriptionInput): Promise<string> {
  const anthropic = getClient();

  const languageInstruction = input.locale === 'fr' ? 'Write the description in French.' : 'Write the description in English.';
  const basisInstruction = input.currentDescription
    ? `Rewrite and improve the organizer's current draft below, keeping its factual content (dates, prices, or specifics it mentions), in the requested tone.\n\nCurrent draft:\n"""${input.currentDescription}"""`
    : 'Write a new description from scratch, based only on the event name and the instructions below — invent no specific facts (no made-up prices, dates, or guest names).';

  const system = `You write short, compelling event descriptions for Intahé, an event ticketing platform. ${languageInstruction} Output ONLY the description text itself — no title, no markdown formatting, no preamble like "Here's a description:". Keep it to 2-4 short paragraphs, no more than about 200 words.`;

  const userMessage = [
    `Event name: ${input.eventName}`,
    `Desired tone/style: ${input.tone}`,
    input.customInstructions ? `Additional instructions from the organizer: ${input.customInstructions}` : null,
    basisInstruction,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    throw new ApiError(
      502,
      'ai_generation_failed',
      'AI text generation failed — try again in a moment.',
      null,
    );
  }

  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text' || !block.text.trim()) {
    throw new ApiError(502, 'ai_generation_failed', 'AI text generation returned no usable text.', null);
  }
  return block.text.trim();
}
