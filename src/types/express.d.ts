export {};

declare global {
  namespace Express {
    interface Request {
      /** Output of the validate() middleware: parsed and coerced request data. */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}
