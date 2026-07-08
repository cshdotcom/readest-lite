// Type declarations for foliate-js (untyped JS module).
// foliate-js ships no .d.ts files. Under moduleResolution:bundler + allowJs,
// upstream Readest resolves foliate-js as a workspace package and TS infers
// loose types (effectively `any` for method returns). Lite's Docker build
// git-clones foliate-js into packages/ at build time; without these
// declarations tsc fails to resolve the dynamic imports at all.
//
// To match upstream's loose inference and avoid strict-mode mismatches
// (e.g. getCFI expecting Range but setMark returning Range|undefined),
// we declare TTS as a permissive type with all methods returning `any`,
// mirroring what allowJs inference produces for untyped JS classes.

declare module 'foliate-js/tts.js' {
  export interface SentenceEntry {
    blockIndex: number;
    markName: string;
    range: Range;
  }
  export function* getSentences(
    doc: Document,
    textWalker: unknown,
    nodeFilter?: unknown,
    granularity?: 'sentence' | 'word',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Generator<SentenceEntry, void, any>;

  // The TTS class has ~30 methods. Declaring them all precisely risks
  // strict-mode mismatches with upstream's allowJs inference. Declare each
  // method app code calls with a permissive return type so callers can chain
  // without TS errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type TTS = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const TTS: any;
}

declare module 'foliate-js/text-walker.js' {
  export const textWalker: unknown;
}
