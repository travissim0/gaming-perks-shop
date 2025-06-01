'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from 'react-hot-toast';
import { Product } from '@/types';
import PhraseInputModal from '@/components/PhraseInputModal';
import PhraseEditModal from '@/components/PhraseEditModal';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

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

  // Debug auth state
  useEffect(() => {
    console.log('PerksPage - Auth state:', { user: user?.email || 'null', loading });
  }, [user, loading]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoadingProducts(true);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('active', true);

        if (error) {
          throw error;
        }

        // Map price_id to priceId for frontend compatibility
        const mappedProducts = (data || []).map((product: any) => ({
          ...product,
          priceId: product.price_id,
        }));

        setProducts(mappedProducts);
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
        const { data, error } = await supabase
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

  const handleBuyClick = (product: Product) => {
    console.log('Buy clicked - Auth state:', { 
      user: user?.email || 'null', 
      loading, 
      userObject: user 
    });
    
    if (!user) {
      toast.error('Please sign in to purchase perks');
      return;
    }

    setSelectedProduct(product);
    
    // If product is customizable, show phrase modal. Otherwise, go directly to checkout
    if (product.customizable) {
      setShowPhraseModal(true);
    } else {
      handleDirectPurchase(product);
    }
  };

  const handleDirectPurchase = async (product: Product) => {
    if (!user) {
      toast.error('Please sign in to purchase perks');
      return;
    }

    setPurchaseLoading(true);

    try {
      // Get the user's access token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again to purchase perks');
        return;
      }

      // Call checkout API without phrase for non-customizable products
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceId: product.priceId,
          // No phrase for non-customizable products
        }),
      });

      const session_data = await response.json();

      if (session_data.error) {
        toast.error(session_data.error);
        return;
      }

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      const { error } = await stripe!.redirectToCheckout({
        sessionId: session_data.id,
      });

      if (error) {
        toast.error(error.message || 'An error occurred');
      }
    } catch (error: any) {
      toast.error('Error creating checkout session: ' + error.message);
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handlePhraseConfirm = async (phrase: string) => {
    if (!selectedProduct || !user) {
      toast.error('Missing product or user information');
      return;
    }

    setPurchaseLoading(true);

    try {
      // Get the user's access token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again to purchase perks');
        return;
      }

      // Call your checkout API with authorization header and phrase
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceId: selectedProduct.priceId,
          phrase: phrase,
        }),
      });

      const session_data = await response.json();

      if (session_data.error) {
        toast.error(session_data.error);
        return;
      }

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      const { error } = await stripe!.redirectToCheckout({
        sessionId: session_data.id,
      });

      if (error) {
        toast.error(error.message || 'An error occurred');
      }
    } catch (error: any) {
      toast.error('Error creating checkout session: ' + error.message);
    } finally {
      setPurchaseLoading(false);
      setShowPhraseModal(false);
      setSelectedProduct(null);
    }
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
              const userProduct = getUserProductForProduct(product.id);
              const isOwned = !!userProduct;
              
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
                      ) : (
                        <button
                          onClick={() => handleBuyClick(product)}
                          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-3 px-6 rounded-lg font-bold tracking-wide border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
                        >
                          {user ? '🚀 Buy' : '🔐 LOGIN REQUIRED'}
                        </button>
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