"use strict";
/**
 * Test vault functions - store and retrieve encrypted tokens
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
async function testVault() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('\nVAULT FUNCTIONS TEST\n');
    const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
    try {
        // Test storing a token
        console.log('Testing store_page_token()...');
        const testPageId = 123456789;
        const testPageName = 'Test Page';
        const testToken = 'EAABqKrL5Eu0BALtZBYiYFZCcr9ZBLZBnhCNThWyqPqPz...'; // Sample token
        const { data, error } = await supabase.rpc('store_page_token', {
            p_page_id: testPageId,
            p_page_name: testPageName,
            p_access_token: testToken,
            p_token_expiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
        });
        if (error) {
            console.log(`store_page_token failed: ${error.message}`);
        }
        else {
            console.log(`Token stored successfully`);
            console.log(`   Page ID: ${data.page_id_out}`);
            console.log(`   Secret ID: ${data.secret_id}`);
            // Now try to retrieve it
            console.log('\nTesting get_page_access_token()...');
            const { data: retrieved, error: retrieveError } = await supabase.rpc('get_page_access_token', {
                p_page_id: testPageId,
            });
            if (retrieveError) {
                console.log(`get_page_access_token failed: ${retrieveError.message}`);
            }
            else if (!retrieved) {
                console.log('No token retrieved');
            }
            else {
                console.log(`Token retrieved successfully`);
                if (retrieved === testToken) {
                    console.log(`Token matches! Encryption/decryption working!`);
                }
                else {
                    console.log(`Token mismatch: ${retrieved.substring(0, 20)}...`);
                }
            }
        }
    }
    catch (e) {
        console.error('Error:', e.message);
    }
}
testVault();
//# sourceMappingURL=test-vault-functions.js.map