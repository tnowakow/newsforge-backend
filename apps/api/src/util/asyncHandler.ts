import type { Request, Response, NextFunction, RequestHandler } from "express";

/** Wrap an async handler so thrown errors flow to Express error middleware. */
export function asyncHandler<TReq extends Request = Request, TRes extends Response = Response>(
  fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as TReq, res as TRes, next)).catch(next);
  };
}
