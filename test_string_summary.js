
import { SpintaClient } from './dist/client/SpintaClient.js';
import { fetchModelMetadata } from './dist/cli/crawler.js';

const client = new SpintaClient();

async function testStringSummary() {
    const targetPath = 'datasets/gov/rc/espbiis/receptai_2024/Receptas';
    console.log(`Using model: ${targetPath}`);
    
    try {
        const meta = await fetchModelMetadata(client, targetPath);
        const stringFields = meta.properties.filter(p => p.type === 'string' || p.type === 'text');
        
        let fieldNames = stringFields.map(p => p.name);
        // Ensure vaisto_bendr_pav is tested if not already found (it should be there)
        if (!fieldNames.includes('vaisto_bendr_pav')) {
             fieldNames.push('vaisto_bendr_pav');
        }
        
        console.log(`String fields to test: ${fieldNames.join(', ')}`);
        
        // Test vaisto_bendr_pav specifically first
        const field = 'vaisto_bendr_pav';
        console.log(`Testing summary for field: ${field}`);
        
        const response = await client.request(`/${targetPath}/:summary/${field}`);
        console.log('RESPONSE:');
        console.log(JSON.stringify(response, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) {
            console.error('Response status:', e.response.status);
        }
    }
}

testStringSummary();
