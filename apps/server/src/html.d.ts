// Wrangler's default module rules import .html files as text (worker.ts).
declare module '*.html' {
  const text: string;
  export default text;
}
