import logger from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, err);

  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(err.errors ? { errors: err.errors } : {}),
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

export default errorHandler;
