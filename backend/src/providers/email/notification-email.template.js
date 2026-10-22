function escapeHtml(value) {
  const characters = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => characters[character]);
}

function createEmail(notification) {
  const title = escapeHtml(notification.title);
  const message = escapeHtml(notification.message).replace(/\r?\n/g, "<br>");

  return {
    subject: notification.title.replace(/[\r\n]+/g, " "),
    text: `${notification.title}\n\n${notification.message}`,
    html: `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.6">
  <h2>${title}</h2>
  <p>${message}</p>
</body></html>`,
  };
}

module.exports = { createEmail };
