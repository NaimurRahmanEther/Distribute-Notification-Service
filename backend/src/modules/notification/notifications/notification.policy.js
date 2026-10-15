// Phase 2 has no presence or providers yet. Persist at most one initial intent.
// Phase 4 will extend selection with activity/receipt signals; workers must
// recheck preferences before sending. SECURITY does not bypass consent yet.
function selectInitialChannel(preferences) {
  return ["IN_APP", "PUSH", "EMAIL"].find(channel => preferences[channel]) || null;
}

module.exports = { selectInitialChannel };
