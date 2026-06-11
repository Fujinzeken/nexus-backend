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

// Disconnect a platform — removes the stored account/token for this user
router.delete(
  "/connections/:platform",
  authMiddleware,
  async (req: AuthRequest, res) => {
    const { platform } = req.params;

    if (platform !== "twitter" && platform !== "linkedin") {
      return res.status(400).json({ error: "Unsupported platform" });
    }

    try {
      const { error } = await supabase
        .from("social_accounts")
        .delete()
        .eq("user_id", req.user?.id)
        .eq("platform", platform);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error("Disconnect Error:", err);
      res.status(500).json({ error: "Failed to disconnect account" });
    }
  },
);

export default router;
