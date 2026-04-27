// lib/store.js
// Simple in-memory store for pilot.
// In production, swap this out for Vercel KV (free tier) or a small DB.
// Keys expire after 48 hours automatically via the cleanup interval.

const TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

const sessions = new Map();

function saveSession(id, data) {
  sessions.set(id, {
    ...data,
    createdAt: Date.now(),
  });
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function deleteSession(id) {
  sessions.delete(id);
}

// Cleanup expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > TTL_MS) sessions.delete(id);
  }
}, 60 * 60 * 1000);

module.exports = { saveSession, getSession, deleteSession };
