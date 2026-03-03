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

export const getPostById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json(data);
  } catch (err) {
    console.error("Get Post Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const updatePost = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const validatedData = createPostSchema.partial().parse(req.body);
    const { content, platform, scheduledAt, mediaUrls } = validatedData;

    // 1. Verify ownership
    const { data: existingPost, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .single();

    if (fetchError || !existingPost) {
      return res.status(404).json({ error: "Post not found" });
    }

    // 2. Update Database
    const isScheduled = !!scheduledAt;
    const { data, error } = await supabase
      .from("posts")
      .update({
        content: content ?? existingPost.content,
        platform: platform ?? existingPost.platform,
        scheduled_at:
          scheduledAt ??
          (scheduledAt === null ? null : existingPost.scheduled_at),
        status: isScheduled
          ? "scheduled"
          : scheduledAt === null
            ? "draft"
            : existingPost.status,
        media_urls: mediaUrls ?? existingPost.media_urls,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Update Post Error:", error);
      return res.status(500).json({ error: "Failed to update post" });
    }

    // 3. Sync with Queue
    const { QueueService } = await import("../services/queue.service");
    if (isScheduled) {
      // Re-schedule (this overwrites the existing job by ID)
      await QueueService.schedulePost(id, scheduledAt!);
    } else if (scheduledAt === null) {
      // Specifically cancelled scheduling
      await QueueService.cancelPost(id);
    }

    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    console.error("Update API Error:", err);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

export const deletePost = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;

    // Check ownership and delete
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) {
      console.error("Delete Post Error:", error);
      return res.status(500).json({ error: "Failed to delete post" });
    }

    // Remove from queue
    const { QueueService } = await import("../services/queue.service");
    await QueueService.cancelPost(id);

    res.json({ success: true, message: "Post deleted" });
  } catch (err) {
    console.error("Delete API Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
