import { type Response } from 'express';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
  }
}

export function sendError(res: Response, err: unknown): void {
  console.log(err)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err });
  } else {
    res.status(500).json({ error: err });
  }
}