/*
 * Test script for Product Purchase System Integration
 * 
 * This demonstrates how the new ProductPurchaseManager works
 * alongside your existing champion weapon system.
 */

using System;
using System.Threading.Tasks;

public class ProductSystemTest
{
    public static async Task Main(string[] args)
    {
        Console.WriteLine("=== Product Purchase System Test ===");
        Console.WriteLine();
        
        // Test 1: Check if a player has purchased Rainbow CAW
        string testPlayer = "TestPlayer";
        Console.WriteLine($"Testing player: {testPlayer}");
        
        try
        {
            // Test the conversion system
            string originalItem = "Kuchler A6 CAW";
            string convertedItem = await CTFGameType.ProductPurchaseManager.GetConvertedItemName(testPlayer, originalItem);
            
            Console.WriteLine($"Original item: {originalItem}");
            Console.WriteLine($"Converted item: {convertedItem}");
            
            if (convertedItem != originalItem)
            {
                Console.WriteLine("✓ Product conversion system working!");
                Console.WriteLine($"  {originalItem} → {convertedItem}");
            }
            else
            {
                Console.WriteLine("- No conversion needed (player hasn't purchased Rainbow CAW)");
            }
            
            // Test 2: Check all products for a player
            var playerProducts = await CTFGameType.ProductPurchaseManager.GetPlayerProducts(testPlayer);
            Console.WriteLine($"\nProducts owned by {testPlayer}:");
            
            if (playerProducts.Count > 0)
            {
                foreach (var product in playerProducts)
                {
                    Console.WriteLine($"  - {product}");
                }
            }
            else
            {
                Console.WriteLine("  (No products found)");
            }
            
            // Test 3: Force cache refresh
            Console.WriteLine("\nForcing cache refresh...");
            await CTFGameType.ProductPurchaseManager.ForceRefreshCache();
            Console.WriteLine("✓ Cache refreshed successfully");
            
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error during testing: {ex.Message}");
        }
        
        Console.WriteLine("\n=== Test Complete ===");
        Console.WriteLine("\nTo use in your game:");
        Console.WriteLine("1. Players purchase Rainbow CAW from freeinf.org");
        Console.WriteLine("2. When they use ?build or ?b commands, CAW automatically converts to Rainbow CAW");
        Console.WriteLine("3. Cache updates every 10 minutes for performance");
        Console.WriteLine("\nSupported conversion examples:");
        Console.WriteLine("  - ?build caw → Rainbow CAW (if purchased)");
        Console.WriteLine("  - ?b kuchler a6 caw → Rainbow CAW (if purchased)");
        Console.WriteLine("  - ?bw mycawbuild → Any CAW in build becomes Rainbow CAW");
    }
} 