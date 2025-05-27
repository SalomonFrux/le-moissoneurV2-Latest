const Redis = require("ioredis");

const redis = new Redis({
  host: "172.27.95.109",
  port: 6379,
  password: "Keya1996",
  retryStrategy: (times) => Math.min(times * 100, 5000),
});

redis.on("connect", () => console.log("Redis connected!"));
redis.on("error", (err) => console.error("Redis error:", err));

redis.ping()
  .then((res) => console.log("PONG:", res))
  .catch((err) => console.error("PING failed:", err));
