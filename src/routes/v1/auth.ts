import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../../services/auth/authService';
import * as tokenRevocationService from '../../services/auth/tokenRevocationService';
import { requireAuth } from '../../middleware/auth';
import {
  loginRateLimitByEmail,
  loginRateLimitByIp,
  passwordResetRequestRateLimitByEmail,
  passwordResetRequestRateLimitByIp,
  signupRateLimitByEmail,
  signupRateLimitByIp,
} from '../../middleware/rateLimit';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router();

// Previously bounded only by the global 100KB request body limit, not per
// field.
const FULL_NAME_MAX_LENGTH = 200;
const PHONE_MAX_LENGTH = 30;

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  full_name: z.string().trim().min(1, 'full_name is required.').max(FULL_NAME_MAX_LENGTH),
  phone: z.string().trim().min(1).max(PHONE_MAX_LENGTH).optional(),
  // Required, not optional-with-a-default: an account cannot be created
  // without it, and a client that omits it gets a 400 rather than
  // silently having acceptance assumed on its behalf.
  accept_terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms of Use.' }) }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'password is required.'),
});

const googleSignInSchema = z.object({
  id_token: z.string().min(1, 'id_token is required.'),
});

const appleSignInSchema = z.object({
  identity_token: z.string().min(1, 'identity_token is required.'),
  // Only present on the client's very first Apple sign-in for this app.
  full_name: z.string().trim().min(1).max(FULL_NAME_MAX_LENGTH).optional(),
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'token is required.'),
  new_password: z.string().min(8, 'Password must be at least 8 characters.'),
});

router.post(
  '/signup',
  signupRateLimitByIp,
  signupRateLimitByEmail,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body as z.infer<typeof signupSchema>, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  loginRateLimitByIp,
  loginRateLimitByEmail,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  }),
);

router.post(
  '/google',
  validateBody(googleSignInSchema),
  asyncHandler(async (req, res) => {
    const { id_token } = req.body as z.infer<typeof googleSignInSchema>;
    const result = await authService.signInWithGoogle(id_token, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(200).json(result);
  }),
);

router.post(
  '/apple',
  validateBody(appleSignInSchema),
  asyncHandler(async (req, res) => {
    const { identity_token, full_name } = req.body as z.infer<typeof appleSignInSchema>;
    const result = await authService.signInWithApple(identity_token, full_name, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.status(200).json(result);
  }),
);

router.post(
  '/password-reset/request',
  passwordResetRequestRateLimitByIp,
  passwordResetRequestRateLimitByEmail,
  validateBody(passwordResetRequestSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof passwordResetRequestSchema>;
    await authService.requestPasswordReset(email);
    res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent.' });
  }),
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    // requireAuth always sets these together — see middleware/auth.ts.
    await tokenRevocationService.revokeToken(req.tokenJti!, new Date(req.tokenExp! * 1000));
    res.status(204).send();
  }),
);

router.post(
  '/password-reset/confirm',
  validateBody(passwordResetConfirmSchema),
  asyncHandler(async (req, res) => {
    const { token, new_password } = req.body as z.infer<typeof passwordResetConfirmSchema>;
    await authService.confirmPasswordReset(token, new_password);
    res.status(200).json({ message: 'Password has been reset.' });
  }),
);

export default router;
