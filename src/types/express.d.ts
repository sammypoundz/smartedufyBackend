// src/types/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        schoolId: string;
        isActive?: boolean;
        name?: string;
      };
    }
  }
}

export {};