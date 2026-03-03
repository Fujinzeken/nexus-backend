import { Router } from "express";
import {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
} from "../controllers/posts.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Secure routes
router.post("/", authMiddleware, createPost as any);
router.get("/", authMiddleware, getPosts as any);
router.get("/:id", authMiddleware, getPostById as any);
router.patch("/:id", authMiddleware, updatePost as any);
router.delete("/:id", authMiddleware, deletePost as any);

export default router;
