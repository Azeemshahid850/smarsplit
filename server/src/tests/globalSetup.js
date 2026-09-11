import { MongoMemoryServer } from 'mongodb-memory-server';

// One in-memory MongoDB for the whole run; the URI reaches workers via provide().
export default async function setup({ provide }) {
  const mongo = await MongoMemoryServer.create();
  provide('mongoUri', mongo.getUri('smartsplit_test'));
  return async () => {
    await mongo.stop();
  };
}
