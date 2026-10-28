import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User, { ROLES } from "../models/User.js";
import Organisation from "../models/Organisation.js";
import { config } from "../config/env.js";
import { authenticate, requireRole, signToken } from "../middleware/auth.js";
import { HttpError, asyncHandler, validate } from "../utils/http.js";
import { recordAudit } from "../services/audit.js";

const router = Router();

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const password = z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters.");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email,
  password,
  organisationName: z.string().trim().min(2, "Enter an organisation name.").max(120),
});
const loginSchema = z.object({ email, password: z.string().min(1).max(72) });
const memberSchema = z.object({ name: z.string().trim().min(2).max(100), email, password, role: z.enum(ROLES) });

// Creates a NEW organisation and makes the registrant its admin.
router.post("/auth/register", validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email: mail, password: pw, organisationName } = req.body;
  if (await User.exists({ email: mail })) throw new HttpError(409, "An account with this email already exists.");
  const organisation = await Organisation.create({ name: organisationName });
  const user = await User.create({
    name, email: mail, role: "admin", organisation: organisation._id,
    passwordHash: await bcrypt.hash(pw, config.bcryptRounds),
  });
  await recordAudit({ organisation: organisation._id, user, action: "organisation.created", entityType: "Organisation", entityId: organisation._id });
  res.status(201).json({ token: signToken(user), user, organisation });
}));

router.post("/auth/login", validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select("+passwordHash");
  // Same message for "no such user" and "wrong password" so emails cannot be probed.
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw new HttpError(401, "Incorrect email or password.");
  const organisation = await Organisation.findById(user.organisation);
  await recordAudit({ organisation: user.organisation, user, action: "user.login", entityType: "User", entityId: user._id });
  res.json({ token: signToken(user), user, organisation });
}));

router.get("/auth/me", authenticate, asyncHandler(async (req, res) => {
  res.json({ user: req.user, organisation: await Organisation.findById(req.user.organisation) });
}));

// Admins add teammates to their own organisation.
router.get("/users", authenticate, requireRole("admin"), asyncHandler(async (req, res) => {
  res.json({ users: await User.find({ organisation: req.user.organisation }).sort({ createdAt: 1 }) });
}));

router.post("/users", authenticate, requireRole("admin"), validate(memberSchema), asyncHandler(async (req, res) => {
  const { name, email: mail, password: pw, role } = req.body;
  if (await User.exists({ email: mail })) throw new HttpError(409, "An account with this email already exists.");
  const member = await User.create({
    name, email: mail, role, organisation: req.user.organisation,
    passwordHash: await bcrypt.hash(pw, config.bcryptRounds),
  });
  await recordAudit({ organisation: req.user.organisation, user: req.user, action: "user.created", entityType: "User", entityId: member._id, details: { role } });
  res.status(201).json({ user: member });
}));

export default router;
