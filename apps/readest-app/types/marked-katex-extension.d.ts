declare module 'marked-katex-extension' {
  import type { MarkedExtension } from 'marked';
  const markedKatex: (options?: {
    throwOnError?: boolean;
    output?: 'mathml' | 'html' | 'htmlAndMathml';
    [key: string]: unknown;
  }) => MarkedExtension;
  export default markedKatex;
}
