import { Router } from "express";
import { createPost, getPosts } from "../controllers/posts.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Secure routes
router.post("/", authMiddleware, createPost as any);
router.get("/", authMiddleware, getPosts as any);

export default router;
