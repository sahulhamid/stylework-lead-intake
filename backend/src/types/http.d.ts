import "node:http";

// Raw request bytes captured by express.json({ verify }) in app.ts,
// used to check webhook signatures.
declare module "node:http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}
