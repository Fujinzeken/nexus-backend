import { Response } from "express";
import { supabase } from "../lib/supabase";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth.middleware";

// Validation Schema
const createPostSchema = z.object({
  content: z.string().min(1, "Content is required"),
  platform: z.enum(["twitter", "linkedin"]),
  scheduledAt: z.string().optional(), // ISO string
  mediaUrls: z.array(z.string()).optional(),
});

export const createPost = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Identify User (Verified by authMiddleware)
    if (!req.user) {
      return res
        .status(401)
        .json({ error: "Unauthorized: Missing user context" });
    }
    const userId = req.user.id;

    // 2. Validate Input
    const validatedData = createPostSchema.parse(req.body);
    const { content, platform, scheduledAt, mediaUrls } = validatedData;
    const isScheduled = !!scheduledAt;

    // 3. Find associated social account
    const { data: account, error: accError } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    if (accError || !account) {
      return res.status(400).json({
        error: `Please connect your ${platform} account before posting.`,
      });
    }

    // 4. Persist to Database
    const { data, error } = await supabase
      .from("posts")
      .insert({
        user_id: userId,
        content,
        platform,
        scheduled_at: scheduledAt || null,
        status: isScheduled ? "scheduled" : "draft",
        media_urls: mediaUrls || [],
        social_account_id: account.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase Database Error:", error);
      return res
        .status(500)
        .json({ error: "Failed to create post. Please try again." });
    }

    // 5. If scheduled, add to queue
    if (isScheduled && data) {
      const { QueueService } = await import("../services/queue.service");
      await QueueService.schedulePost(data.id, scheduledAt);
    }

    // 6. Success Response
    res.status(201).json({
      success: true,
      message: isScheduled
        ? "Post scheduled successfully"
        : "Post created as draft",
      data,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error("Internal API Error:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};
export const getPosts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", req.user.id)
      .order("scheduled_at", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Fetch Posts Error:", error);
      return res.status(500).json({ error: "Failed to fetch posts" });
    }

    res.json(data);
  } catch (err) {
    console.error("Internal API Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
