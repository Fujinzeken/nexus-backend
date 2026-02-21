import { Router } from "express";
import { AuthTwitterController } from "../controllers/auth.twitter.controller";
import { AuthLinkedinController } from "../controllers/auth.linkedin.controller";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { supabase } from "../lib/supabase";

const router = Router();

// Twitter Auth Routes
router.get("/twitter/login", authMiddleware, AuthTwitterController.login);
router.get("/twitter/callback", AuthTwitterController.callback);

// LinkedIn Auth Routes
router.get("/linkedin/login", authMiddleware, AuthLinkedinController.login);
router.get("/linkedin/callback", AuthLinkedinController.callback);

// Get connection status for all platforms
router.get("/connections", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { data, error } = await supabase
      .from("social_accounts")
      .select(
        "platform, platform_username, profile_picture_url, expires_at, updated_at",
      )
      .eq("user_id", req.user?.id);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Connections Fetch Error:", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

export default router;
