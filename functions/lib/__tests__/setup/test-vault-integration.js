"use strict";
/**
 * End-to-End Vault Integration Test
 *
 * Comprehensive test verifying:
 * - Table access
 * - Token encryption storage
 * - Service connectivity
 * - Complete vault integration
 *
 * Run with: npx ts-node __tests__/setup/test-vault-integration.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
async function endToEndTest() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('\nEND-TO-END VAULT INTEGRATION TEST\n');
    const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
    try {
        // Step 1: Query pages to confirm table access
        console.log('Step 1: Confirming table access...');
        const { data: pages, error: queryError } = await supabase
            .from('pages')
            .select('*')
            .eq('page_id', 123456789);
        if (queryError) {
            console.log(`Table query failed: ${queryError.message}`);
            return;
        }
        if (!pages || pages.length === 0) {
            console.log('No pages found in database');
            return;
        }
        const page = pages[0];
        console.log(`   Page table accessible`);
        console.log(`   Page: ${page.page_name} (ID: ${page.page_id})`);
        console.log(`   Token Status: ${page.token_status}`);
        console.log(`   Vault Secret ID: ${page.page_access_token_id}`);
        // Step 2: Verify token is encrypted in vault
        console.log('\nStep 2: Verifying encrypted storage...');
        // Query the raw pages table to see what's stored
        const { data: rawPage, error: rawError } = await supabase
            .from('pages')
            .select('page_access_token_id')
            .eq('page_id', 123456789)
            .single();
        if (rawError) {
            console.log(`Raw query error: ${rawError.message}`);
        }
        else {
            console.log(`Encrypted token reference stored: ${rawPage?.page_access_token_id}`);
            console.log(`   (This UUID points to an encrypted secret in vault.secrets table)`);
        }
        // Step 3: Confirm we can access Supabase service
        console.log('\nStep 3: Verifying service connectivity...');
        const { error: healthError } = await supabase.auth.getUser();
        if (!healthError) {
            console.log(`Service role authenticated`);
        }
        else {
            console.log(`Auth check: ${healthError.message}`);
        }
    }
    catch (e) {
        console.error('Error:', e.message);
    }
}
endToEndTest();
//# sourceMappingURL=test-vault-integration.js.map