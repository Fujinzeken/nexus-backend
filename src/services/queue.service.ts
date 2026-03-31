import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { PostingService } from "./posting.service";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Redis connection instance
export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const POST_QUEUE_NAME = "post-queue";

/**
 * Queue Service to manage scheduled posts
 */
export class QueueService {
  private static queue = new Queue(POST_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  /**
   * Schedule a post for background processing
   */
  static async schedulePost(postId: string, scheduledAt?: string | Date) {
    let delay = 0;

    if (scheduledAt) {
      const scheduledTime = new Date(scheduledAt).getTime();
      const now = Date.now();
      delay = Math.max(0, scheduledTime - now);
    }

    console.log(`[Queue] Scheduling post ${postId} with delay: ${delay}ms`);

    // Use postId as jobId to easily replace/remove
    return await this.queue.add(
      "dispatch-post",
      { postId },
      { delay, jobId: postId },
    );
  }

  /**
   * Cancel a scheduled post
   */
  static async cancelPost(postId: string) {
    const job = await this.queue.getJob(postId);
    if (job) {
      await job.remove();
      console.log(`[Queue] Cancelled job for post ${postId}`);
    }
  }

  /**
   * Initialize the background worker
   */
  static initWorker() {
    const worker = new Worker(
      POST_QUEUE_NAME,
      async (job: Job) => {
        const { postId } = job.data;
        console.log(`[Worker] Processing post: ${postId}`);
        return await PostingService.sendPost(postId);
      },
      {
        connection: redisConnection,
        stalledInterval: 600000,
        lockDuration: 300000,
        drainDelay: 10, // Check every 10s (Safe on local Redis)
        concurrency: 5, // Limit to 5 simultaneous posts to save CPU/RAM
      },
    );

    worker.on("completed", (job) => {
      console.log(`[Worker] Job ${job.id} completed successfully`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
    });

    console.log("[Worker] Post queue worker initialized");
    return worker;
  }
}
