import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../../services/auth/authService';
import { asyncHandler } from '../../utils/asyncHandler';
import { validateBody } from '../../utils/validate';

const router = Router();

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  full_name: z.string().trim().min(1, 'full_name is required.'),
  phone: z.string().trim().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'password is required.'),
});

const googleSignInSchema = z.object({
  id_token: z.string().min(1, 'id_token is required.'),
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
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.signup(req.body as z.infer<typeof signupSchema>);
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
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
    const result = await authService.signInWithGoogle(id_token);
    res.status(200).json(result);
  }),
);

router.post(
  '/password-reset/request',
  validateBody(passwordResetRequestSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body as z.infer<typeof passwordResetRequestSchema>;
    await authService.requestPasswordReset(email);
    res.status(200).json({ message: 'If an account exists for this email, a reset link has been sent.' });
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
