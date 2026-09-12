import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach, inject } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test_access_secret';
process.env.JWT_REFRESH_SECRET ||= 'test_refresh_secret';
process.env.CLIENT_URL ||= 'http://localhost:5173';

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
