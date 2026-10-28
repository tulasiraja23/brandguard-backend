import mongoose from "mongoose";
import { ZodError } from "zod";

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Validates and REPLACES req.body / req.query with the parsed (trimmed, typed, unknown-keys-stripped) values.
export const validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req[source] = result.data;
  next();
};

export function checkObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value) || String(new mongoose.Types.ObjectId(value)) !== String(value)) {
    throw new HttpError(400, "Invalid id.");
  }
  return value;
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Please check the highlighted fields.",
      issues: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
  if (error?.code === 11000) return res.status(409).json({ error: "That already exists." });
  console.error(error); // full detail stays on the server
  return res.status(500).json({ error: "Something went wrong on the server." });
}
