import { MongoMemoryServer } from 'mongodb-memory-server';

// One in-memory MongoDB for the whole run; the URI reaches workers via provide().
export default async function setup({ provide }) {
  // WiredTiger can take 10s+ to open on a busy disk; the default timeout is 10s.
  const mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  provide('mongoUri', mongo.getUri('smartsplit_test'));
  return async () => {
    await mongo.stop();
  };
}
