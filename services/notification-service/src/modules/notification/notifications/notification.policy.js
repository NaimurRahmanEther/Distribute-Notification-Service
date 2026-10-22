function selectInitialChannel(preferences, active = true) {
  const channels = active ? ["IN_APP", "PUSH", "EMAIL"] : ["PUSH", "EMAIL", "IN_APP"];
  return channels.find((channel) => preferences[channel]) || null;
}

module.exports = { selectInitialChannel };
