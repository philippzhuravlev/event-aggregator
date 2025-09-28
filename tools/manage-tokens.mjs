// Token management CLI script
// Usage: node tools/manage-tokens.mjs [command] [options]

import { readFile } from 'node:fs/promises';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import TokenManager from './token-manager.mjs';

// Load environment variables
config();

// Initialize Firebase
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;
let credential;

if (SERVICE_ACCOUNT_PATH) {
  const json = await readFile(SERVICE_ACCOUNT_PATH, 'utf8');
  credential = cert(JSON.parse(json));
} else {
  credential = applicationDefault();
}

initializeApp({ credential });

const tokenManager = new TokenManager();

// Command line interface
const command = process.argv[2];
const pageId = process.argv[3];
const token = process.argv[4];

async function main() {
  switch (command) {
    case 'list':
      await listTokens();
      break;
    case 'add':
      if (!pageId || !token) {
        console.error('Usage: node manage-tokens.mjs add <pageId> <token>');
        process.exit(1);
      }
      await addToken(pageId, token);
      break;
    case 'test':
      if (!pageId) {
        console.error('Usage: node manage-tokens.mjs test <pageId>');
        process.exit(1);
      }
      await testToken(pageId);
      break;
    case 'debug':
      if (!pageId) {
        console.error('Usage: node manage-tokens.mjs debug <pageId>');
        process.exit(1);
      }
      await debugToken(pageId);
      break;
    case 'enrich':
      if (!pageId) {
        console.error('Usage: node manage-tokens.mjs enrich <pageId>');
        process.exit(1);
      }
      await enrichToken(pageId);
      break;
    case 'status':
      await showStatus();
      break;
    default:
      showHelp();
  }
}

async function listTokens() {
  console.log('📋 Stored Tokens:');
  const tokens = await tokenManager.getAllTokens();
  
  if (tokens.length === 0) {
    console.log('  No tokens stored in Firestore');
    return;
  }
  
  tokens.forEach(token => {
    const expiresDate = new Date(token.expiresAt).toLocaleDateString();
    const statusEmoji = {
      'valid': '✅',
      'expired': '❌',
      'needs_refresh': '⚠️',
      'invalid': '🚫'
    }[token.status] || '❓';
    
    console.log(`  ${statusEmoji} ${token.pageName} (${token.pageId})`);
    console.log(`     Status: ${token.status} | Expires: ${expiresDate}`);
    
    // Show enhanced metadata if available
    if (token.facebookMeta) {
      const meta = token.facebookMeta;
      console.log(`     📊 Enhanced metadata:`);
      console.log(`        App: ${meta.appName} (${meta.appId})`);
      if (meta.issuedTimestamp) {
        console.log(`        Issued: ${new Date(meta.issuedTimestamp * 1000).toLocaleDateString()}`);
      }
      if (meta.dataAccessExpiresTimestamp) {
        console.log(`        Data Access Expires: ${new Date(meta.dataAccessExpiresTimestamp * 1000).toLocaleDateString()}`);
      }
      console.log(`        Scopes: ${meta.scopes?.join(', ') || 'None'}`);
    }
  });
}

async function addToken(pageId, token) {
  console.log(`➕ Adding token for page ${pageId}...`);
  
  try {
    // Test token first
    const testUrl = `https://graph.facebook.com/v19.0/${pageId}?access_token=${token}`;
    const response = await fetch(testUrl);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Token test failed:', error);
      return;
    }
    
    const pageData = await response.json();
    await tokenManager.storeToken(pageId, token, pageData.name);
    console.log(`✅ Token added for ${pageData.name} (${pageId})`);
    
  } catch (error) {
    console.error('❌ Failed to add token:', error.message);
  }
}

async function testToken(pageId) {
  console.log(`🧪 Testing token for page ${pageId}...`);
  
  try {
    const result = await tokenManager.testToken(pageId);
    
    if (result.valid) {
      console.log(`✅ Token is valid for ${result.pageData.name}`);
    } else {
      console.log(`❌ Token is invalid: ${result.error}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function debugToken(pageId) {
  console.log(`🔍 Getting Facebook debug info for page ${pageId}...`);
  
  try {
    const debugInfo = await tokenManager.getTokenDebugInfo(pageId);
    
    if (debugInfo) {
      console.log('📊 Facebook Debug Information:');
      console.log(`  App ID: ${debugInfo.app_id} (${debugInfo.application || 'Unknown'})`);
      console.log(`  User ID: ${debugInfo.user_id}`);
      console.log(`  Valid: ${debugInfo.is_valid ? '✅' : '❌'}`);
      console.log(`  Issued: ${new Date(debugInfo.issued_at * 1000).toLocaleString()}`);
      console.log(`  Expires: ${new Date(debugInfo.expires_at * 1000).toLocaleString()}`);
      if (debugInfo.data_access_expires_at) {
        console.log(`  Data Access Expires: ${new Date(debugInfo.data_access_expires_at * 1000).toLocaleString()}`);
      }
      console.log(`  Scopes: ${debugInfo.scopes?.join(', ') || 'None'}`);
      if (debugInfo.granular_scopes) {
        console.log('  Granular Scopes:');
        Object.entries(debugInfo.granular_scopes).forEach(([key, value]) => {
          console.log(`    ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
        });
      }
    } else {
      console.log('❌ Unable to retrieve debug information');
    }
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

async function enrichToken(pageId) {
  console.log(`✨ Enriching token metadata for page ${pageId}...`);
  
  try {
    const debugInfo = await tokenManager.getTokenDebugInfo(pageId);
    
    if (!debugInfo) {
      console.log('❌ Unable to retrieve debug information for enrichment');
      return;
    }

    const enrichData = {
      appId: debugInfo.app_id,
      appName: debugInfo.application,
      issued: debugInfo.issued_at,
      expires: debugInfo.expires_at,
      dataAccessExpires: debugInfo.data_access_expires_at,
      appScopedUserId: debugInfo.user_id,
      scopes: debugInfo.scopes,
      granularScopes: debugInfo.granular_scopes,
      origin: 'Web'
    };

    const success = await tokenManager.enrichTokenWithDebugInfo(pageId, enrichData);
    
    if (success) {
      console.log('✅ Token metadata enhanced successfully');
      console.log('📊 Enhanced with:');
      console.log(`  ├─ App ID: ${enrichData.appId}`);
      console.log(`  ├─ Issued: ${new Date(enrichData.issued * 1000).toLocaleString()}`);
      console.log(`  ├─ Expires: ${new Date(enrichData.expires * 1000).toLocaleString()}`);
      console.log(`  ├─ Data Access: ${enrichData.dataAccessExpires ? new Date(enrichData.dataAccessExpires * 1000).toLocaleString() : 'N/A'}`);
      console.log(`  └─ Scopes: ${enrichData.scopes?.join(', ') || 'None'}`);
    } else {
      console.log('❌ Failed to enrich token metadata');
    }
  } catch (error) {
    console.error('❌ Enrichment failed:', error.message);
  }
}

async function showStatus() {
  console.log('📊 Token Management Status:\n');
  
  // Firestore tokens
  const tokens = await tokenManager.getAllTokens();
  console.log(`Firestore Tokens: ${tokens.length} stored`);
  
  if (tokens.length > 0) {
    const validTokens = tokens.filter(t => t.status === 'valid').length;
    const expiredTokens = tokens.filter(t => t.status === 'expired').length;
    const needsRefresh = tokens.filter(t => t.status === 'needs_refresh').length;
    const invalidTokens = tokens.filter(t => t.status === 'invalid').length;
    
    console.log(`  ✅ Valid: ${validTokens}`);
    console.log(`  ❌ Expired: ${expiredTokens}`);
    console.log(`  ⚠️  Needs Refresh: ${needsRefresh}`);
    console.log(`  🚫 Invalid: ${invalidTokens}`);
    
    // Show enhanced metadata stats
    const enrichedTokens = tokens.filter(t => t.facebookMeta).length;
    console.log(`  📊 Enhanced with metadata: ${enrichedTokens}/${tokens.length}`);
  } else {
    console.log('  No tokens stored in Firestore');
  }
  
  console.log('\nRecommendations:');
  if (tokens.length === 0) {
    console.log('  💡 Add your first token: node tools/manage-tokens.mjs add <pageId> <token>');
  } else if (tokens.some(t => t.status === 'expired' || t.status === 'needs_refresh')) {
    console.log('  ⚠️  Some tokens need attention - regenerate expired tokens');
  } else if (tokens.every(t => t.status === 'valid')) {
    console.log('  ✅ All tokens are healthy');
  }
  
  if (tokens.length > 0 && tokens.filter(t => t.facebookMeta).length < tokens.length) {
    console.log('  📊 Consider enriching tokens: node tools/manage-tokens.mjs enrich <pageId>');
  }
}

function showHelp() {
  console.log('🔧 Token Management CLI');
  console.log('\nCommands:');
  console.log('  list                     - List all stored tokens');
  console.log('  add <pageId> <token>     - Add a new token for a page');
  console.log('  test <pageId>            - Test a token validity');
  console.log('  debug <pageId>           - Get Facebook debug info for token');
  console.log('  enrich <pageId>          - Enrich token with Facebook debug metadata');
  console.log('  status                   - Show overall token status');
  console.log('\nExamples:');
  console.log('  node tools/manage-tokens.mjs list');
  console.log('  node tools/manage-tokens.mjs add 777401265463466 EAAb32yb...');
  console.log('  node tools/manage-tokens.mjs test 777401265463466');
  console.log('  node tools/manage-tokens.mjs debug 777401265463466');
  console.log('  node tools/manage-tokens.mjs enrich 777401265463466');
  console.log('  node tools/manage-tokens.mjs status');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});