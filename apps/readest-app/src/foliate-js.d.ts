// Type declarations for foliate-js (untyped JS module).
// foliate-js ships no .d.ts files; without these declarations TypeScript
// under moduleResolution:bundler cannot resolve the dynamic imports used by
// TTSController.ensureTimeline() (getSentences, textWalker) and the build
// fails with "Property 'getSentences' does not exist on type 'typeof
// import("foliate-js/tts")'". The actual runtime resolution works because
// next.config.mjs lists foliate-js in transpilePackages and pnpm links it
// as a workspace package; this file only teaches tsc the shapes.
//
// The TTS class is large and its full method surface is only consumed
// internally by foliate-js; app code only calls .start/.resume/.next/.prev/
// .prevMark/.nextMark/.setMarkEnabled. Declaring it as a permissive class
// keeps the surface minimal without breaking callers.

declare module 'foliate-js/tts.js' {
  export interface SentenceEntry {
    range: Range;
    [key: string]: unknown;
  }
  export function* getSentences(
    doc: Document,
    textWalker: unknown,
    nodeFilter?: unknown,
    granularity?: 'sentence' | 'word',
  ): Generator<SentenceEntry, void, unknown>;

  // The full TTS class has ~30 methods; app code only uses a handful.
  // Keep the declaration permissive to avoid drift with foliate-js internals.
  export class TTS {
    constructor(
      doc: Document,
      textWalker: unknown,
      nodeFilter?: unknown,
      highlight?: unknown,
      granularity?: string,
    );
    start(): string | undefined;
    resume(): string | undefined;
    prev(paused?: boolean): string | undefined;
    next(paused?: boolean): string | undefined;
    prevMark(paused?: boolean): string | undefined;
    nextMark(paused?: boolean): string | undefined;
    from(range: Range): string | undefined;
    setMarkEnabled(name: string, enabled: boolean): void;
  }
}

declare module 'foliate-js/text-walker.js' {
  export const textWalker: unknown;
}
