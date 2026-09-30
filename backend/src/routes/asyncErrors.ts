import type { NextFunction, Request, Response } from "express";

type LayerLike = {
  handle: (...args: unknown[]) => unknown;
  handle_request: (req: Request, res: Response, next: NextFunction) => void;
};

let installed = false;

/**
 * Express 4 does not look at the promise an `async` handler returns, so a handler that
 * rejects is an unhandled rejection, and Node exits on those. This makes a rejected handler
 * call `next(error)` like a thrown one, so it reaches the error middleware (a 500 that names
 * no internals) and the process keeps running. Same idea as the express-async-errors package,
 * kept here to avoid a dependency. Safe to call more than once.
 */
export function installAsyncErrorHandling(): void {
  if (installed) return;
  installed = true;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Layer = require("express/lib/router/layer") as {
    prototype: LayerLike;
  };
  Layer.prototype.handle_request = function handleRequest(
    this: LayerLike,
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const handler = this.handle;
    // A handler with four parameters is an error handler, not a request handler.
    if (handler.length > 3) {
      next();
      return;
    }
    try {
      const returned = handler(req, res, next);
      if (
        returned !== null &&
        typeof returned === "object" &&
        typeof (returned as Promise<unknown>).catch === "function"
      ) {
        (returned as Promise<unknown>).catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}
