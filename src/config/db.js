import mongoose from "mongoose";
import { config } from "./env.js";

export async function connectDb(uri = config.mongoUri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export const disconnectDb = () => mongoose.disconnect();
