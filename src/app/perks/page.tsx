'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { Product } from '@/types';
import PhraseInputModal from '@/components/PhraseInputModal';
import PhraseEditModal from '@/components/PhraseEditModal';
import { createClient } from '@supabase/supabase-js';

const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface PurchaseStatus {
  owned: boolean;
  canVerify: boolean;
  availableDonation?: {
    id: string;
    amount: number;
    created_at: string;
    kofi_transaction_id: string;
  };
  requiredAmount?: number;
  purchase?: any;
}

export default function PerksPage() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [userProducts, setUserProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingUserProduct, setEditingUserProduct] = useState<any>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [customPhrases, setCustomPhrases] = useState<{[key: string]: string}>({});
  const [purchaseStatuses, setPurchaseStatuses] = useState<{[key: string]: PurchaseStatus}>({});
  const [verifyingProducts, setVerifyingProducts] = useState<{[key: string]: boolean}>({});

  // Debug auth state
  useEffect(() => {
    console.log('PerksPage - Auth state:', { user: user?.email || 'null', loading });
  }, [user, loading]);

  // Fetch user profile when user changes
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setUserProfile(null);
        return;
      }

      try {
        const { data: profile, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setUserProfile(profile);
      } catch (error: any) {
        console.error('Error fetching user profile:', error);
      }
    };

    fetchUserProfile();
  }, [user]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoadingProducts(true);
        const { data, error } = await supabaseClient
          .from('products')
          .select('*')
          .eq('active', true);

        if (error) {
          throw error;
        }

        setProducts(data || []);
      } catch (error: any) {
        toast.error('Error loading products: ' + error.message);
      } finally {
        setLoadingProducts(false);
      }
    };

    const fetchUserProducts = async () => {
      if (!user) {
        setUserProducts([]);
        return;
      }

      try {
        const { data, error } = await supabaseClient
          .from('user_products')
          .select('*, products(*)')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (error) {
          throw error;
        }

        setUserProducts(data || []);
      } catch (error: any) {
        console.error('Error loading user products:', error);
      }
    };

    fetchProducts();
    fetchUserProducts();
  }, [user]);

  // Removed automatic purchase checking - now manual only via button clicks

  const checkPurchaseStatuses = async () => {
    if (!userProfile?.email) return;
    
    try {
      // Single API call to check all products at once
      const response = await fetch(`/api/verify-kofi-purchases?email=${encodeURIComponent(userProfile.email)}`);
      if (response.ok) {
        const data = await response.json();
        setPurchaseStatuses(data.productStatuses || {});
        console.log(`✅ Checked ${Object.keys(data.productStatuses || {}).length} products in single API call`);
      }
    } catch (error) {
      console.error('Error checking purchase statuses:', error);
    }
  };

  const handleDirectPurchase = (product: Product) => {
    if (!user || !userProfile?.email) {
      toast.error('Please sign in to purchase perks');
      return;
    }

    // Use Ko-fi shop URL if available, otherwise fallback to donation URL
    let kofiUrl: string;
    if (product.kofi_direct_link_code) {
      // Ko-fi shop item URL - this will trigger "Shop Order" webhook
      kofiUrl = `https://ko-fi.com/s/${product.kofi_direct_link_code}`;
      
      toast.success(
        `Redirecting to Ko-fi shop for ${product.name}! Your purchase will be automatically activated after payment.`,
        { duration: 8000 }
      );

      toast(
        'Ko-fi will process your purchase and automatically activate your perk - no verification needed!',
        { 
          duration: 10000,
          icon: '✨'
        }
      );
    } else {
      // Fallback to donation URL for products without shop links
      const message = `Purchase: ${product.name} - User: ${userProfile.email}`;
      kofiUrl = `https://ko-fi.com/ctfpl?donation_amount=${product.price / 100}&message=${encodeURIComponent(message)}`;
      
      toast.success(
        `Redirecting to Ko-fi for ${product.name} purchase! Your email (${userProfile.email}) has been included.`,
        { duration: 8000 }
      );

      toast(
        'After payment, return here and click "Check for Existing Donation" to activate your perk!',
        { 
          duration: 10000,
          icon: '🔄'
        }
      );
    }

    // Open Ko-fi in a new tab
    window.open(kofiUrl, '_blank');
  };

  const handlePhraseConfirm = (phrase: string) => {
    if (!selectedProduct || !user || !userProfile?.email) {
      toast.error('Missing product or user information');
      return;
    }

    // Use Ko-fi shop URL if available, otherwise fallback to donation URL
    let kofiUrl: string;
    if (selectedProduct.kofi_direct_link_code) {
      // Ko-fi shop item URL with variation for custom phrase
      // Note: Ko-fi variations will be passed as variation_name in webhook
      kofiUrl = `https://ko-fi.com/s/${selectedProduct.kofi_direct_link_code}?variation=${encodeURIComponent(phrase)}`;
      
      toast.success(
        `Redirecting to Ko-fi shop for ${selectedProduct.name} with phrase "${phrase}"! Your purchase will be automatically activated.`,
        { duration: 8000 }
      );

      toast(
        'Ko-fi will process your purchase and automatically activate your perk with your custom phrase!',
        { 
          duration: 10000,
          icon: '✨'
        }
      );
    } else {
      // Fallback to donation URL for products without shop links
      const message = `Purchase: ${selectedProduct.name} - Phrase: "${phrase}" - User: ${userProfile.email}`;
      kofiUrl = `https://ko-fi.com/ctfpl?donation_amount=${selectedProduct.price / 100}&message=${encodeURIComponent(message)}`;
      
      toast.success(
        `Redirecting to Ko-fi for ${selectedProduct.name} with phrase "${phrase}"! Your details have been included.`,
        { duration: 8000 }
      );

      toast(
        'After payment, return here and click "Check for Existing Donation" to activate your perk!',
        { 
          duration: 10000,
          icon: '🔄'
        }
      );
    }

    // Open Ko-fi in a new tab
    window.open(kofiUrl, '_blank');

    setShowPhraseModal(false);
    setSelectedProduct(null);
  };

  const handlePhraseCancel = () => {
    setShowPhraseModal(false);
    setSelectedProduct(null);
    setPurchaseLoading(false);
  };

  const getUserProductForProduct = (productId: string) => {
    return userProducts.find(up => up.product_id === productId);
  };

  const handleEditPhrase = (userProduct: any) => {
    setEditingUserProduct(userProduct);
    setShowEditModal(true);
  };

  const handlePhraseUpdate = async (newPhrase: string) => {
    if (editingUserProduct) {
      // Update local state
      setUserProducts(prev => 
        prev.map(up => 
          up.id === editingUserProduct.id 
            ? { ...up, phrase: newPhrase }
            : up
        )
      );
    }
    setShowEditModal(false);
    setEditingUserProduct(null);
  };

  const handleEditModalClose = () => {
    setShowEditModal(false);
    setEditingUserProduct(null);
  };

  const handleVerifyPurchase = async (productId: string) => {
    if (!userProfile?.email) {
      toast.error('Please sign in to verify purchases');
      return;
    }

    setVerifyingProducts(prev => ({ ...prev, [productId]: true }));

    try {
      const response = await fetch('/api/verify-kofi-purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId,
          userEmail: userProfile.email,
          customPhrase: customPhrases[productId] || null
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(`🎉 Success! ${result.message}\n\nYour perk has been automatically activated!`);
        // Refresh purchase statuses and user products
        checkPurchaseStatuses();
        // Refresh the page to show updated ownership status
        window.location.reload();
      } else {
        if (result.error === 'No matching Ko-fi donation found') {
          toast.error(`❌ No matching Ko-fi donation found.\n\n${result.details}\n\nPlease make sure you:\n1. Made a Ko-fi donation with your account email (${userProfile.email})\n2. Donated at least the required amount\n3. Haven't already used this donation for another purchase`);
        } else {
          toast.error(`❌ Verification failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error verifying purchase:', error);
      toast.error('❌ Error occurred during verification. Please try again.');
    } finally {
      setVerifyingProducts(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleKofiPurchase = (product: Product) => {
    if (!userProfile?.email) {
      toast.error('Please sign in to make purchases');
      return;
    }

    const customPhrase = customPhrases[product.id] || '';
    
    // For customizable products, require a phrase
    if (product.customizable && !customPhrase.trim()) {
      toast.error('🎮 Please enter a custom phrase for this product before purchasing!');
      // Focus on the phrase input
      const phraseInput = document.querySelector(`input[value="${customPhrase}"]`) as HTMLInputElement;
      if (phraseInput) {
        phraseInput.focus();
        phraseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Validate phrase if provided
    if (customPhrase && customPhrase.trim()) {
      const cleanPhrase = customPhrase.trim();
      if (cleanPhrase.length > 12) {
        toast.error('Custom phrase must be 12 characters or less');
        return;
      }
      if (!/^[a-zA-Z0-9 !?._-]+$/.test(cleanPhrase)) {
        toast.error('Custom phrase can only contain letters, numbers, spaces, and these symbols: ! ? . _ -');
        return;
      }
    }
    
    // Use Ko-fi shop URL if available, otherwise fallback to donation URL
    let kofiUrl: string;
    if (product.kofi_direct_link_code) {
      // Ko-fi shop item URL with variation for custom phrase
      kofiUrl = `https://ko-fi.com/s/${product.kofi_direct_link_code}${customPhrase ? `?variation=${encodeURIComponent(customPhrase)}` : ''}`;
      
      toast.success(
        `Redirecting to Ko-fi shop for ${product.name}${customPhrase ? ` with phrase "${customPhrase}"` : ''}! Your purchase will be automatically activated.`,
        { duration: 8000 }
      );
    } else {
      // Fallback to donation URL for products without shop links
      const message = `Purchase: ${product.name}${customPhrase ? ` | Custom Phrase: ${customPhrase}` : ''} | Email: ${userProfile.email}`;
      kofiUrl = `https://ko-fi.com/ctfpl?donation_amount=${product.price / 100}&message=${encodeURIComponent(message)}`;
      
      toast.success(
        `Redirecting to Ko-fi for ${product.name}${customPhrase ? ` with phrase "${customPhrase}"` : ''}!`,
        { duration: 8000 }
      );
    }
    
    window.open(kofiUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        <span className="ml-3 text-cyan-400 font-mono">Loading tactical equipment...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">🛍️ DONATION PERKS</h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Weapon skins, Kill effects, and more!
          </p>
          {user && userProfile ? (
            <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-blue-300 text-sm font-medium">
                ✅ Signed in as: <span className="font-bold">{userProfile.email}</span>
              </p>
              <p className="text-blue-400 text-xs mt-1">
                Ko-fi donations will be automatically matched to this email for instant perk activation!
              </p>
            </div>
          ) : (
            <div className="mt-6 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-yellow-300 text-sm font-medium">
                ⚠️ Please sign in to purchase and automatically verify perks
              </p>
            </div>
          )}
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-hidden">
                <div className="animate-pulse bg-gray-700" style={{ minHeight: '120px', maxHeight: '192px', height: '160px' }}></div>
                <div className="p-6">
                  <div className="animate-pulse h-6 bg-gray-700 rounded mb-3"></div>
                  <div className="animate-pulse h-4 bg-gray-600 rounded mb-2"></div>
                  <div className="animate-pulse h-4 bg-gray-600 rounded mb-2 w-3/4"></div>
                  <div className="animate-pulse h-12 bg-gray-700 rounded mt-4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => {
              const status = purchaseStatuses[product.id];
              const isOwned = status?.owned;
              const canVerify = status?.canVerify;
              const isVerifying = verifyingProducts[product.id];
              const userProduct = getUserProductForProduct(product.id);

              return (
                <div key={product.id} className={`bg-gradient-to-b from-gray-800 to-gray-900 border rounded-lg shadow-2xl overflow-hidden hover:shadow-cyan-500/20 transition-all duration-300 ${
                  isOwned ? 'border-green-500/50' : 'border-cyan-500/30'
                }`}>
                  {isOwned && (
                    <div className="bg-green-600 text-white text-center py-2 font-bold text-sm">
                      ✅ OWNED
                    </div>
                  )}
                  {product.image && (
                    <div className="w-full overflow-hidden border-b border-gray-600 bg-gray-800">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-auto max-h-48 object-contain hover:scale-105 transition-transform duration-300"
                        style={{ minHeight: '120px' }}
                        onMouseEnter={(e) => {
                          if (product.name.toLowerCase().includes('rainbow') && product.name.toLowerCase().includes('caw')) {
                            e.currentTarget.src = '/products/caw_cropped.gif';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (product.name.toLowerCase().includes('rainbow') && product.name.toLowerCase().includes('caw') && product.image) {
                            e.currentTarget.src = product.image;
                          }
                        }}
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <h2 className="text-2xl font-bold mb-3 text-cyan-400 tracking-wide">{product.name}</h2>
                    <p className="text-gray-300 mb-4 leading-relaxed">{product.description}</p>
                    
                    {product.customizable && (
                      <div className="bg-gray-700/50 border border-cyan-500/30 rounded-lg p-3 mb-4">
                        <p className="text-cyan-400 font-bold text-sm mb-1">🎮 CUSTOMIZABLE:</p>
                        <p className="text-gray-300 text-sm">
                          {isOwned 
                            ? "Custom phrase for visual text explosion kill macro"
                            : "You'll be able to set your own custom phrase for the visual text explosion kill macro during purchase!"
                          }
                        </p>
                        {isOwned && userProduct && (
                          <div className="mt-3 p-2 bg-gray-800/50 border border-gray-600 rounded">
                            <p className="text-yellow-400 text-xs font-bold mb-1">Current Phrase:</p>
                            <p className="text-white font-mono text-lg text-center bg-gradient-to-r from-purple-600 to-blue-600 px-2 py-1 rounded">
                              💥 {userProduct.phrase || 'Not set'} 💥
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold text-yellow-400">${product.price / 100}</span>
                      {isOwned ? (
                        <div className="flex space-x-2">
                          {product.customizable && (
                            <button
                              onClick={() => handleEditPhrase(userProduct)}
                              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white py-2 px-4 rounded-lg font-bold text-sm transition-all duration-300 shadow-lg"
                            >
                              ✏️ Edit Phrase
                            </button>
                          )}
                          <div className="flex items-center text-green-400 font-bold">
                            <span className="text-sm">Purchased</span>
                          </div>
                        </div>
                      ) : canVerify ? (
                        <div className="space-y-2">
                          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3">
                            <div className="text-blue-400 font-semibold text-sm">🔍 Ko-fi Donation Found!</div>
                            <div className="text-xs text-gray-300 mt-1">
                              Amount: ${status.availableDonation?.amount} | Date: {new Date(status.availableDonation?.created_at || '').toLocaleDateString()}
                            </div>
                          </div>
                          <button
                            onClick={() => handleVerifyPurchase(product.id)}
                            disabled={isVerifying}
                            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isVerifying ? '⏳ Verifying...' : '✅ Verify & Activate Perk'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Ko-fi Purchase Button */}
                          <button
                            onClick={() => handleKofiPurchase(product)}
                            disabled={!user || !userProfile || (product.customizable && !customPhrases[product.id]?.trim())}
                            className={`w-full font-bold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                              product.customizable && !customPhrases[product.id]?.trim()
                                ? 'bg-gray-600 hover:bg-gray-600 text-gray-300'
                                : 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white'
                            }`}
                          >
                            {product.customizable && !customPhrases[product.id]?.trim() 
                              ? '🔒 Enter Phrase First' 
                              : '☕ Purchase via Ko-fi'
                            }
                          </button>
                          

                          
                          {/* Custom Phrase Input for Customizable Products */}
                          {product.customizable && (
                            <div className="mt-3">
                              <label className="block text-xs text-yellow-400 mb-2 font-semibold">🎮 Custom Phrase (Required):</label>
                              <input
                                type="text"
                                value={customPhrases[product.id] || ''}
                                onChange={(e) => setCustomPhrases(prev => ({ ...prev, [product.id]: e.target.value }))}
                                placeholder="Enter your custom phrase..."
                                maxLength={12}
                                className={`w-full px-3 py-2 bg-gray-700 border rounded text-white placeholder-gray-400 text-sm focus:outline-none transition-colors ${
                                  customPhrases[product.id]?.trim() 
                                    ? 'border-green-500 focus:border-green-400' 
                                    : 'border-red-500 focus:border-red-400'
                                }`}
                                required
                              />
                              <p className="text-xs text-gray-500 mt-1">Max 12 characters: letters, numbers, spaces, ! ? . _ -</p>
                              {!customPhrases[product.id]?.trim() && (
                                <p className="text-xs text-red-400 mt-1 font-semibold">⚠️ Phrase required before purchase</p>
                              )}
                            </div>
                          )}
                          
                          {user && userProfile && (
                            <button
                              onClick={() => handleVerifyPurchase(product.id)}
                              disabled={isVerifying}
                              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                              {isVerifying ? '⏳ Checking...' : '🔍 Check for Existing Donation'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl">
            <div className="text-6xl text-gray-500 mb-6">🎮</div>
            <h2 className="text-3xl font-bold mb-4 text-cyan-400 tracking-wider">NO TACTICAL EQUIPMENT AVAILABLE</h2>
            <p className="text-gray-300 max-w-md mx-auto text-lg">
              Our armory is currently being restocked. Check back soon for new tactical advantages and combat enhancements.
            </p>
            <div className="mt-6 text-yellow-400 font-bold">
              🔄 RESUPPLY INCOMING
            </div>
          </div>
        )}
      </main>

      {/* Phrase Input Modal */}
      <PhraseInputModal
        isOpen={showPhraseModal}
        onClose={handlePhraseCancel}
        onConfirm={handlePhraseConfirm}
        productName={selectedProduct?.name || ''}
        loading={purchaseLoading}
      />

      {/* Phrase Edit Modal */}
      <PhraseEditModal
        isOpen={showEditModal}
        onClose={handleEditModalClose}
        onUpdate={handlePhraseUpdate}
        userProductId={editingUserProduct?.id || ''}
        currentPhrase={editingUserProduct?.phrase || null}
        productName={editingUserProduct?.products?.name || ''}
      />
    </div>
  );
} 