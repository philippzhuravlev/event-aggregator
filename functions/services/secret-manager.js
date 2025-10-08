const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const secretClient = new SecretManagerServiceClient();

// this is a "service", which sounds vague but basically means a specific piece
// of code that connects it to external elements like facebook, firestore and
// google secret manager. The term could also mean like an intenal service, e.g.
// authentication or handling tokens, but here we've outsourced it to google/meta
// Services should not be confused with "handlers" that do business logic

/**
 * Store a Facebook page access token in Google Secret Manager
 * @param {string} pageId - Facebook page ID
 * @param {string} accessToken - Facebook page access token
 */
async function storePageToken(pageId, accessToken) {
  const projectId = process.env.GCLOUD_PROJECT; // i.e. stored in .env
  const secretName = `facebook-token-${pageId}`; 
  // before we called our secret facebook-[pageId] but that was ambiguous.
  // We're talking bout __tokens__ here

  try {
    // create the secret (if it doesn't exist)
    await secretClient.createSecret({
      parent: `projects/${projectId}`,
      secretId: secretName,
      secret: {
        replication: { automatic: {} },
      },
    });
    console.log(`Created new secret: ${secretName}`);
  } catch (error) {
    // if we failed to create the secret, it might not be because it's
    // __actually__ an error, but because it might already exist

    // but if not:
    if (!error.message.includes('already exists')) {
      console.warn(`Failed to create secret ${secretName}:`, error.message);
    }
  }
  
  // secret version actually contains the data, kind of like firestore's 
  // snapshot object or http req/res objects. Here, it has a payload
  await secretClient.addSecretVersion({
    parent: `projects/${projectId}/secrets/${secretName}`,
    payload: {
      data: Buffer.from(accessToken),
      // buffer is just a temp data storage, esp in networks
    },
  });
  
  console.log(`Stored token for page ${pageId}`);
}

/**
 * Retrieve a Facebook page access token from Google Secret Manager
 * @param {string} pageId - Facebook page ID
 * @returns {Promise<string|null>} The access token or null if not found
 */
async function getPageToken(pageId) {
  // largely the same as the above create page token method, tho
  // a getter instead of a setter
  const projectId = process.env.GCLOUD_PROJECT;
  const secretName = `facebook-token-${pageId}`;
  
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });
    return version.payload.data.toString();
  } catch (error) {
    console.warn(`Failed to get token for page ${pageId}:`, error.message);
    return null;
  }
}

module.exports = {
  storePageToken,
  getPageToken,
};
