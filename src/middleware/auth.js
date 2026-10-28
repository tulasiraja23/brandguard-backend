import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import User from "../models/User.js";
import { HttpError, asyncHandler } from "../utils/http.js";

// Verifies the JWT, then loads the user from the database on EVERY request,
// so removed users and changed roles take effect immediately.
export const authenticate = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) throw new HttpError(401, "Authentication required.");
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    throw new HttpError(401, "Your session has expired or is invalid. Please sign in again.");
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, "Account not found.");
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, "You do not have permission to do that."));

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id) }, config.jwtSecret, { algorithm: "HS256", expiresIn: config.jwtExpiresIn });
