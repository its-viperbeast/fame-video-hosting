export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: "admin";
      };
      uploadId?: string;
      uploadController?: AbortController;
      uploadSignal?: AbortSignal;
    }
  }
}
