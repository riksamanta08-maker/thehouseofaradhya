const { sendError } = require('../utils/response');

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = err.message || 'Unexpected error';

  if (status >= 500) {
    console.error('[API Error]', err);
  }

  return sendError(res, status, message);
}

module.exports = { errorHandler };
