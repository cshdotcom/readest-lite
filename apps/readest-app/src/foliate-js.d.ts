// Type declarations for foliate-js (untyped JS module).
// foliate-js ships no .d.ts files. Under moduleResolution:bundler + allowJs,
// upstream Readest resolves foliate-js as a workspace package and TS infers
// loose types (effectively `any` for method returns). Lite's Docker build
// git-clones foliate-js into packages/ at build time; without these
// declarations tsc fails to resolve the dynamic imports at all.
//
// To match upstream's loose inference and avoid strict-mode mismatches
// (e.g. getCFI expecting Range but setMark returning Range|undefined),
// we declare the TTS class with a permissive shape so all method/property
// access resolves loosely, mirroring what allowJs inference produces for
// untyped JS classes.

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

  // The TTS class has ~30 methods; declaring them all precisely risks
  // strict-mode mismatches with upstream's allowJs inference. Use a
  // permissive constructor + index signature so callers can access any
  // method/property without TS errors, matching the loose inference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class TTS {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
    constructor(
      doc: Document,
      textWalker: unknown,
      nodeFilter?: unknown,
      highlight?: unknown,
      granularity?: string,
    );
  }
}

declare module 'foliate-js/text-walker.js' {
  export const textWalker: unknown;
}
