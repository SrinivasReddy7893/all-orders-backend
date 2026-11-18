import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors, json } = format;

const isProd = process.env.NODE_ENV === "production";

// 🔹 Dev format (readable)
const devFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// 🔹 Logger instance
export const logger = createLogger({
  level: isProd ? "info" : "debug",

  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    isProd ? json() : combine(colorize(), devFormat)
  ),

  transports: [
    new transports.Console(),

    ...(isProd
      ? [
          new transports.File({
            filename: "logs/error.log",
            level: "error",
          }),
          new transports.File({
            filename: "logs/combined.log",
          }),
        ]
      : []),
  ],

  exitOnError: false,
});