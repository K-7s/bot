/**
 * Small sliding-window rate limiter. Used to cap how many actions
 * (reactions, presence edits, voice reconnects...) a bot can perform
 * per time window, so the tool never hammers Discord's API.
 */
class RateLimiter {
  constructor() {
    this.buckets = new Map(); // key -> array of timestamps
  }

  /** @returns {boolean} true if the action is allowed right now */
  allow(key, max, windowMs) {
    const now = Date.now();
    const arr = (this.buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      this.buckets.set(key, arr);
      return false;
    }
    arr.push(now);
    this.buckets.set(key, arr);
    return true;
  }

  reset(key) {
    this.buckets.delete(key);
  }
}

module.exports = { RateLimiter };
