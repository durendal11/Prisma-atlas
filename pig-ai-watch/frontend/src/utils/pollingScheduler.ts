type PollingTask = () => void | Promise<void>;

interface IntervalBucket {
  timerId: number;
  tasks: Map<string, PollingTask>;
}

const buckets = new Map<number, IntervalBucket>();

function ensureBucket(intervalMs: number): IntervalBucket {
  let bucket = buckets.get(intervalMs);
  if (bucket) {
    return bucket;
  }

  const tasks = new Map<string, PollingTask>();
  const timerId = window.setInterval(() => {
    for (const task of tasks.values()) {
      Promise.resolve(task()).catch((error) => {
        console.error('Polling task failed:', error);
      });
    }
  }, intervalMs);

  bucket = { timerId, tasks };
  buckets.set(intervalMs, bucket);
  return bucket;
}

export function subscribePollingTask(
  key: string,
  task: PollingTask,
  intervalMs: number,
): () => void {
  const bucket = ensureBucket(intervalMs);
  bucket.tasks.set(key, task);

  return () => {
    const current = buckets.get(intervalMs);
    if (!current) {
      return;
    }

    current.tasks.delete(key);
    if (current.tasks.size === 0) {
      clearInterval(current.timerId);
      buckets.delete(intervalMs);
    }
  };
}
