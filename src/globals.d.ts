// A Script API do Bedrock expõe `console` globalmente (log vai pro console do BDS).
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
