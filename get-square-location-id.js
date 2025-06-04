#!/usr/bin/env node

/**
 * Get Square Location ID
 * This script fetches the location ID from Square API
 */

require('dotenv').config();

async function getSquareLocationId() {
    console.log('🔍 Fetching Square Location ID...');
    console.log('=====================================');

    // Check if required credentials exist
    if (!process.env.SQUARE_ACCESS_TOKEN) {
        console.log('❌ SQUARE_ACCESS_TOKEN not found');
        return;
    }

    if (!process.env.SQUARE_APPLICATION_ID) {
        console.log('❌ SQUARE_APPLICATION_ID not found');
        return;
    }

    try {
        const { Client, Environment } = require('square');
        
        const client = new Client({
            accessToken: process.env.SQUARE_ACCESS_TOKEN,
            environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox
        });

        console.log('📡 Connecting to Square API...');
        
        // Get locations
        const response = await client.locationsApi.listLocations();
        
        if (response.result && response.result.locations) {
            console.log('\n📍 Available Locations:');
            response.result.locations.forEach((location, index) => {
                console.log(`  ${index + 1}. Name: ${location.name}`);
                console.log(`     ID: ${location.id}`);
                console.log(`     Status: ${location.status}`);
                console.log(`     Country: ${location.country || 'Not specified'}`);
                console.log(`     Address: ${location.address?.locality || 'Not specified'}`);
                console.log('');
            });

            // If there's only one location, suggest using it
            if (response.result.locations.length === 1) {
                const locationId = response.result.locations[0].id;
                console.log('💡 You have only one location. Add this to your .env file:');
                console.log(`SQUARE_LOCATION_ID=${locationId}`);
            } else {
                console.log('💡 Choose the appropriate location ID and add it to your .env file:');
                console.log('SQUARE_LOCATION_ID=<location_id_here>');
            }
        } else {
            console.log('❌ No locations found');
        }

    } catch (error) {
        console.error('❌ Error fetching locations:', error.message);
        if (error.errors) {
            error.errors.forEach(err => {
                console.error('   -', err.detail);
            });
        }
    }
}

getSquareLocationId(); 