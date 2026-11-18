import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const StockListPage = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');

  const favoriteStocks = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'NFLX', name: 'Netflix' },
    { symbol: 'DIS', name: 'Walt Disney' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'PYPL', name: 'PayPal' },
    { symbol: 'ADBE', name: 'Adobe' },
    { symbol: 'PFE', name: 'Pfizer' },
    { symbol: 'CSCO', name: 'Cisco Systems' },
  ];

  // Handle search submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/stock/${searchInput.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-6">
        <input
          type="text"
          className="p-2 rounded bg-gray-800 text-white w-full"
          placeholder="Enter stock ticker (e.g., AAPL)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button
          type="submit"
          className="mt-2 p-2 bg-green-600 rounded hover:bg-green-500 w-full"
        >
          Search Stock
        </button>
      </form>

      {/* Favorite Stocks Section */}
      <div>
  <h3 className="text-2xl mb-4 text-center font-bold">Favorite Stocks</h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {favoriteStocks.map((stock) => (
      <div key={stock.symbol}>
        <button
          className="bg-gray-800 hover:bg-gray-700 p-6 rounded text-center w-full"
          onClick={() => navigate(`/stock/${stock.symbol}`)}
        >
          {stock.name} ({stock.symbol})
        </button>
      </div>
    ))}
  </div>
</div>
    </div>
  );
};

export default StockListPage;
