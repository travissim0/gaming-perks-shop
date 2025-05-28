'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { Product } from '@/types';

export default function AdminPerksPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formProduct, setFormProduct] = useState<Partial<Product>>({
    name: '',
    description: '',
    price: 0,
    priceId: '',
    active: true,
    image: '',
    phrase: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    // Check if user is admin
    const checkAdmin = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (error || !data || !data.is_admin) {
          router.push('/dashboard');
          toast.error('Unauthorized: Admin access required');
          return;
        }

        setIsAdmin(true);
        fetchProducts();
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    
    setFormProduct({
      ...formProduct,
      [name]: type === 'number' ? parseFloat(value) : value,
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    
    setFormProduct({
      ...formProduct,
      [name]: checked,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
                      // Validate form
        if (!formProduct.name || !formProduct.description || !formProduct.priceId || !formProduct.price || formProduct.price <= 0) {
          toast.error('Please fill in all required fields');
          return;
        }

        // Validate phrase if provided (max 12 alphanumeric characters)
        if (formProduct.phrase && !/^[a-zA-Z0-9]{1,12}$/.test(formProduct.phrase)) {
          toast.error('Phrase must be 1-12 alphanumeric characters only');
          return;
        }

        // Convert price to cents for Stripe
        const priceInCents = Math.round(formProduct.price * 100);

              if (editingId) {
          // Update existing product
          const { error } = await supabase
            .from('products')
            .update({
              name: formProduct.name,
              description: formProduct.description,
              price: priceInCents,
              price_id: formProduct.priceId,
              image: formProduct.image,
              active: formProduct.active,
              phrase: formProduct.phrase,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingId);

          if (error) throw error;
          toast.success('Product updated successfully');
        } else {
          // Create new product
          const { error } = await supabase
            .from('products')
            .insert([{
              name: formProduct.name,
              description: formProduct.description,
              price: priceInCents,
              price_id: formProduct.priceId,
              image: formProduct.image,
              active: formProduct.active,
              phrase: formProduct.phrase,
            }]);

          if (error) throw error;
          toast.success('Product created successfully');
        }

      // Reset form and refresh products
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product: Product) => {
    // Convert price from cents to dollars for the form
    const priceInDollars = product.price / 100;
    
    setFormProduct({
      name: product.name,
      description: product.description,
      price: priceInDollars,
      priceId: product.priceId,
      image: product.image || '',
      active: product.active,
      phrase: product.phrase || '',
    });
    
    setEditingId(product.id);
    setShowAddForm(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (error: any) {
      toast.error('Error deleting product: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormProduct({
      name: '',
      description: '',
      price: 0,
      priceId: '',
      active: true,
      image: '',
      phrase: '',
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleSyncStripeProducts = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again');
        return;
      }

      const response = await fetch('/api/sync-stripe-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Sync completed! ${result.results.created} created, ${result.results.updated} updated`);
        fetchProducts(); // Refresh the products list
      }
    } catch (error: any) {
      toast.error('Error syncing products: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Admin: Manage Perks</h1>
          
          <div className="flex space-x-2">
            <button
              onClick={handleSyncStripeProducts}
              disabled={syncing}
              className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center ${
                syncing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Syncing...
                </>
              ) : (
                <>
                  🔄 Sync from Stripe
                </>
              )}
            </button>
            
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Add New Perk
              </button>
            ) : (
              <button
                onClick={resetForm}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? 'Edit Perk' : 'Add New Perk'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formProduct.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formProduct.description}
                  onChange={handleInputChange}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                    Price (USD) *
                  </label>
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formProduct.price}
                    onChange={handleInputChange}
                    required
                    min="0.01"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the price in dollars (e.g., 9.99)
                  </p>
                </div>
                
                <div>
                  <label htmlFor="priceId" className="block text-sm font-medium text-gray-700 mb-1">
                    Stripe Price ID *
                  </label>
                  <input
                    type="text"
                    id="priceId"
                    name="priceId"
                    value={formProduct.priceId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Price ID from your Stripe dashboard
                  </p>
                </div>
              </div>
              
              <div>
                <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  id="image"
                  name="image"
                  value={formProduct.image}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label htmlFor="phrase" className="block text-sm font-medium text-gray-700 mb-1">
                  Custom Phrase
                </label>
                <input
                  type="text"
                  id="phrase"
                  name="phrase"
                  value={formProduct.phrase}
                  onChange={handleInputChange}
                  maxLength={12}
                  pattern="[a-zA-Z0-9]*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Up to 12 alphanumeric characters"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional custom phrase for in-game usage (1-12 alphanumeric characters only)
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="active"
                  name="active"
                  checked={formProduct.active}
                  onChange={handleCheckboxChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
                  Active (visible to customers)
                </label>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded ${
                    submitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {submitting
                    ? 'Saving...'
                    : editingId
                    ? 'Update Perk'
                    : 'Create Perk'}
                </button>
              </div>
            </form>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Available Perks</h2>
          </div>
          
          {loadingProducts ? (
            <div className="p-6">
              <div className="animate-pulse">
                <div className="h-12 bg-gray-200 rounded mb-4"></div>
                <div className="h-12 bg-gray-200 rounded mb-4"></div>
                <div className="h-12 bg-gray-200 rounded"></div>
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No perks found. Add your first perk using the form above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phrase
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {product.image && (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-10 w-10 rounded-full mr-3 object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {product.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        ${(product.price / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 font-mono">
                          {product.phrase || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            product.active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {product.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(product.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleEdit(product)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 