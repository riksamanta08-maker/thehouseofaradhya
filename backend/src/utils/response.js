const sendSuccess = (res, data, meta = null, message = null) => {
  const payload = { data };
  if (meta) payload.meta = meta;
  if (message) payload.message = message;
  return res.json(payload);
};

const sendError = (res, status, message, details = null) => {
  const payload = { error: { message } };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
};

module.exports = {
  sendSuccess,
  sendError,
};
