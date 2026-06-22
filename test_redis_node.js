const { createClient } = require('redis');

async function main() {
  console.log('Connecting to local mock Redis server...');
  const client = createClient({
    url: 'redis://127.0.0.1:6379'
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();
  console.log('Connected successfully!');

  // Test set/get
  await client.set('node_key', 'hello_from_node');
  const val = await client.get('node_key');
  console.log('Get node_key:', val);

  // Test pub/sub
  const subscriber = client.duplicate();
  await subscriber.connect();
  console.log('Subscriber connected!');

  await subscriber.subscribe('node_channel', (message) => {
    console.log('Received message on node_channel:', message);
  });

  // Publish from publisher
  console.log('Publishing message...');
  await client.publish('node_channel', 'hello_pubsub');

  // Wait for message delivery
  await new Promise(resolve => setTimeout(resolve, 1000));

  await subscriber.disconnect();
  await client.disconnect();
  console.log('Tests finished!');
}

main().catch(console.error);
