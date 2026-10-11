/**
 * Cloud Tasks helper for scheduling delayed work instead of blocking with setTimeout.
 *
 * Usage:
 *   await scheduleDelayedTask('update-ride-status', { rideId }, 15);
 *   await scheduleDelayedTask('cleanup-active-ride', { rideId }, 35);
 */

import { CloudTasksClient } from "@google-cloud/tasks";
import * as functions from "firebase-functions/v1";
import admin from "firebase-admin";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "";
const LOCATION = process.env.FUNCTIONS_LOCATION || "us-central1";

const QUEUE_NAME = "rundi-delayed-tasks";

let client: CloudTasksClient | null = null;

function getClient(): CloudTasksClient {
  if (!client) {
    client = new CloudTasksClient({
      fallback: 'rest',
    });
  }
  return client;
}

function getQueuePath(): string {
  return getClient().queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);
}

let queueEnsured = false;
let queueEnsurePromise: Promise<void> | null = null;

/**
 * Ensure the queue exists (idempotent). Cached after first success.
 * Called lazily by scheduleDelayedTask, not on every cold start.
 */
export async function ensureQueueExists(): Promise<void> {
  if (queueEnsured) return;
  if (queueEnsurePromise) return queueEnsurePromise;

  queueEnsurePromise = (async () => {
    try {
      const tasksClient = getClient();
      const queuePath = getQueuePath();
      await tasksClient.getQueue({ name: queuePath });
      queueEnsured = true;
    } catch (err: any) {
      if (err.code === 5 || err.message?.includes("NOT_FOUND")) {
        const tasksClient = getClient();
        await tasksClient.createQueue({
          parent: tasksClient.locationPath(PROJECT_ID, LOCATION),
          queue: {
            name: getQueuePath(),
            rateLimits: {
              maxConcurrentDispatches: 10,
              maxDispatchesPerSecond: 5,
            },
            retryConfig: {
              maxAttempts: 3,
              maxBackoff: { seconds: 30 },
              minBackoff: { seconds: 5 },
            },
          },
        });
        console.log(`✅ [CloudTasks] Queue '${QUEUE_NAME}' created`);
        queueEnsured = true;
      } else {
        console.warn(`⚠️ [CloudTasks] Could not verify queue:`, err.message);
        // Don't rethrow — scheduleDelayedTask will fail gracefully if queue is missing
      }
    } finally {
      queueEnsurePromise = null;
    }
  })();

  return queueEnsurePromise;
}

/**
 * Schedule a delayed HTTP task targeting a Firebase Function.
 *
 * @param handlerName - The export name of the HTTP function in index.ts
 * @param payload - JSON body to send to the handler
 * @param delaySeconds - Seconds to wait before executing
 */
export async function scheduleDelayedTask(
  handlerName: string,
  payload: Record<string, any>,
  delaySeconds: number,
): Promise<void> {
  await ensureQueueExists();
  if (!queueEnsured) {
    console.warn(`⚠️ [CloudTasks] Queue not available, skipping delayed task: ${handlerName}`);
    return;
  }

  const tasksClient = getClient();
  const queuePath = getQueuePath();

  const functionUrl = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/${handlerName}`;

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: functionUrl,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    },
  };

  await tasksClient.createTask({ parent: queuePath, task });
  console.log(`📋 [CloudTasks] Task enqueued: ${handlerName} in ${delaySeconds}s`);
}

/**
 * Firebase HTTP function to handle delayed ride status updates.
 * Called by Cloud Tasks after delaySeconds.
 */
export const handleDelayedRideStatus = functions.https.onRequest(
  async (req, res) => {
    try {
      const { action, rideId } = req.body;

      if (!rideId || !action) {
        res.status(400).send("Missing action or rideId");
        return;
      }

      const db = admin.database();

      if (action === "mark_completed") {
        const snapshot = await db.ref(`activeRides/${rideId}`).once("value");
        const ride = snapshot.val();

        if (!ride) {
          console.log(`⏭️ [handleDelayedRideStatus] ${rideId} no existe, skip.`);
          res.status(200).send("ok");
          return;
        }

        if (ride.status === "rating_completed") {
          await db.ref(`activeRides/${rideId}`).update({
            status: "completed",
            completedAt: ride.completedAt || admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
          console.log(`✅ [handleDelayedRideStatus] ${rideId} → completed`);
        } else {
          console.log(
            `⏭️ [handleDelayedRideStatus] ${rideId} status='${ride.status}', skip.`,
          );
        }
      } else if (action === "cleanup_active_ride") {
        const snapshot = await db.ref(`activeRides/${rideId}`).once("value");
        const ride = snapshot.val();

        if (!ride) {
          console.log(`⏭️ [handleDelayedRideStatus] ${rideId} ya eliminado.`);
          res.status(200).send("ok");
          return;
        }

        const finalStatus = ride.status;
        if (finalStatus === "completed" || finalStatus === "rating_completed") {
          await db.ref(`activeRides/${rideId}`).remove();
          console.log(`🧹 [handleDelayedRideStatus] ${rideId} eliminado de activeRides`);
        } else {
          console.log(
            `⏭️ [handleDelayedRideStatus] ${rideId} status='${finalStatus}', no eliminar.`,
          );
        }
      }

      res.status(200).send("ok");
    } catch (error: any) {
      console.error(`❌ [handleDelayedRideStatus] Error:`, error.message);
      res.status(500).send("error");
    }
  },
);
