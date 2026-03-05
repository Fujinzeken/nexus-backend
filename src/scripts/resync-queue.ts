import * as dotenv from "dotenv";
import { supabase } from "../lib/supabase";
import { QueueService } from "../services/queue.service";

dotenv.config();

/**
 * Script to resync Supabase 'scheduled' posts with the Redis Queue.
 * Useful when swapping Redis instances.
 */
async function resync() {
  console.log("--- Starting Queue Resync ---");

  try {
    // 1. Fetch all posts that are currently flagged as scheduled
    const { data: scheduledPosts, error } = await supabase
      .from("posts")
      .select("id, scheduled_at, status")
      .eq("status", "scheduled");

    if (error) {
      throw new Error(`Failed to fetch scheduled posts: ${error.message}`);
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      console.log("No scheduled posts found in database. Nothing to sync.");
      process.exit(0);
    }

    console.log(`Found ${scheduledPosts.length} scheduled posts to resync.`);

    // 2. Add each post back to the queue
    for (const post of scheduledPosts) {
      if (!post.scheduled_at) {
        console.warn(
          `Post ${post.id} is marked as scheduled but has no date. Skipping.`,
        );
        continue;
      }

      console.log(`Scheduling post ${post.id} for ${post.scheduled_at}...`);
      await QueueService.schedulePost(post.id, post.scheduled_at);
    }

    console.log("--- Resync Completed Successfully ---");
    process.exit(0);
  } catch (err: any) {
    console.error("--- Resync Failed ---");
    console.error(err.message);
    process.exit(1);
  }
}

resync();
