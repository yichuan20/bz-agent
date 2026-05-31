import { MagnifyingGlassIcon, PackageIcon } from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { dynasClient } from '#/auth';

export const Route = createFileRoute('/_app/products')({
  component: ProductsPage,
});

type Product = {
  id: number;
  sku: string;
  name: string;
  description: string;
  price: number;
  in_stock: boolean;
  quantity: number;
};

type ProductListResponse = {
  data: Product[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: apiError } = await dynasClient.GET(
          '/v1/apps/{appId}/tables/{tableName}/records',
          {
            params: {
              path: {
                appId: import.meta.env.VITE_DYNAS_APP_ID,
                tableName: 'products',
              },
              query: { limit: 100, offset: 0 },
            },
          }
        );

        if (apiError) {
          setError(`Failed to load products: ${JSON.stringify(apiError)}`);
          return;
        }

        const response = data as unknown as ProductListResponse;
        setProducts(response.data || []);
        setTotal(response.pagination?.total || 0);
      } catch (err) {
        setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }

    void fetchProducts();
  }, []);

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query)
    );
  });

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Browse and manage your product catalog. Total: {total}</p>
        </div>
      </div>

      <div className="search-wrapper">
        <span className="search-icon">
          <MagnifyingGlassIcon size={16} />
        </span>
        <input
          type="text"
          placeholder="Search by name, SKU, or description…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
        />
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      )}

      {error && <div className="error-state">{error}</div>}

      {!loading && !error && filteredProducts.length === 0 && (
        <div className="empty-state">
          <PackageIcon size={40} weight="duotone" />
          <p className="empty-state-title">No products found</p>
          <p className="empty-state-subtitle">
            {searchQuery ? 'Try a different search query' : 'No products in the catalog yet'}
          </p>
        </div>
      )}

      {!loading && !error && filteredProducts.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id}>
                  <td>
                    <span className="cell-mono">{product.sku}</span>
                  </td>
                  <td>
                    <div className="cell-product">
                      <div className="card-icon">
                        <PackageIcon size={16} weight="duotone" />
                      </div>
                      <div>
                        <p className="cell-name">{product.name}</p>
                        {product.description && (
                          <p className="cell-desc">{product.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{formatPrice(product.price)}</td>
                  <td>
                    {product.in_stock ? (
                      <span className="badge badge-success">In Stock</span>
                    ) : (
                      <span className="badge badge-error">Out of Stock</span>
                    )}
                  </td>
                  <td>{product.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filteredProducts.length > 0 && (
        <p className="result-summary">
          Showing {filteredProducts.length} of {total} products
        </p>
      )}
    </div>
  );
}
